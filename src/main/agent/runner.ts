import { ToolLoopAgent, isStepCount, type ModelMessage, type ToolSet } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { AgentEvent, RunSource } from '../../shared/agent.js'
import { MAX_HISTORY_MESSAGES, type ChatMessage } from '../../shared/chat.js'
import type { ToolId } from '../../shared/types.js'
import { buildInstructions, getToolsForMentions } from './registry.js'
import { runWithContext } from './run-context.js'
import { buildToolApproval } from './tools.js'
import type { ModelSettings } from '../settings/model-settings.js'

/**
 * Agent runner. Uses the Vercel AI SDK `ai` v7 `ToolLoopAgent` with
 * `toolApproval` (per-tool `needsApproval` is deprecated) and a step limit of
 * 20 (`isStepCount(20)`, the v7 name; v5/v6 called it `stepCountIs` — the
 * installed `ai@7` exports both, we use the v7 name).
 */

export const AGENT_STEP_LIMIT = 20

export interface ApprovalDecision {
  approved: boolean
  reason?: string
}

export interface ApprovalRequest {
  approvalId: string
  toolCallId: string
  toolName: string
  input: unknown
  reason?: string
}

export interface RunAgentOptions {
  prompt: string
  tools: ToolId[]
  source: RunSource
  history?: ChatMessage[]
  systemPrompt?: string
  signal?: AbortSignal
  /** Supplied by the IPC layer so renderer can cancel/approve by id. */
  runId?: string
  emit: (e: AgentEvent) => void
  /** Called for each manual approval request. Must resolve true/false. */
  decideApproval?: (req: ApprovalRequest) => Promise<ApprovalDecision>
  deps?: RunnerDeps
}

export interface RunnerDeps {
  getConfig: () => ModelSettings
  getApiKey: () => Promise<string | null>
  getTools?: (toolIds: ToolId[]) => Promise<ToolSet>
  /** Injected in tests to avoid network/model calls. */
  createAgent?: (args: {
    model: unknown
    tools: ToolSet
    source: RunSource
    instructions: string
  }) => AgentLike
}

/** Minimal surface of ToolLoopAgent used here (structural — fakes conform). */
export interface AgentLike {
  stream(args: {
    messages: ModelMessage[]
    abortSignal?: AbortSignal
  }): Promise<{
    stream: AsyncIterable<Record<string, unknown>>
    content: PromiseLike<unknown>
    text: PromiseLike<string>
    steps: PromiseLike<unknown[]>
    responseMessages: PromiseLike<ModelMessage[]>
  }>
}

function resolveModel(config: ModelSettings, apiKey: string): unknown {
  if (config.provider === 'anthropic') {
    return createAnthropic({ apiKey })(config.model)
  }
  // 'openai' and 'openai-compatible' both ride the OpenAI provider;
  // compatible endpoints (Ollama, LM Studio, gateways) just set baseURL.
  return createOpenAI({ apiKey, baseURL: config.baseUrl || undefined })(config.model)
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

export async function runAgent(opts: RunAgentOptions): Promise<{ text: string; steps: number }> {
  const { prompt, tools, source, signal, emit } = opts
  const deps = opts.deps
  if (!deps) throw new Error('runAgent: deps (settings accessors) are required.')
  const runId =
    opts.runId && opts.runId.length > 0 && opts.runId.length <= 128
      ? opts.runId
      : `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`

  const fail = (message: string): { text: string; steps: number } => {
    emit({ type: 'error', runId, message })
    return { text: '', steps: 0 }
  }

  const config = deps.getConfig()
  const apiKey = await deps.getApiKey()
  if (!apiKey) {
    return fail(
      'No model API key set. Open Settings and add your provider API key first (stored with safeStorage, never leaves this device unencrypted).'
    )
  }

  const toolSet = deps.getTools ? await deps.getTools(tools) : await getToolsForMentions(tools)
  const toolNames = Object.keys(toolSet)
  const instructions = [
    opts.systemPrompt?.trim() ? `Additional user-provided instructions:\n${opts.systemPrompt.trim()}` : '',
    buildInstructions(source, tools)
  ].filter(Boolean).join('\n\n')

  const createAgent = deps.createAgent
  const agent: AgentLike =
    createAgent?.({ model: null, tools: toolSet, source, instructions }) ??
    new ToolLoopAgent({
      model: resolveModel(config, apiKey) as never,
      instructions,
      tools: toolSet,
      stopWhen: isStepCount(AGENT_STEP_LIMIT),
      toolApproval: buildToolApproval(source, toolNames, new Set(config.autoApprove ?? [])) as never
    })

  // Carry { runId, source, signal } to tool execute functions (BudgetGuard
  // metering, nested approvals, abort checks).
  return runWithContext({ runId, source, signal }, async () => {
    const messages: ModelMessage[] = [
      ...(opts.history ?? []).slice(-MAX_HISTORY_MESSAGES)
        .map((message) => ({ role: message.role, content: message.text }) as ModelMessage),
      { role: 'user', content: prompt }
    ]
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) {
      emit({ type: 'aborted', runId })
      return { text: '', steps: 0 }
    }

    let result: Awaited<ReturnType<AgentLike['stream']>>
    try {
      result = await agent.stream({ messages, abortSignal: signal })
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        emit({ type: 'aborted', runId })
        return { text: '', steps: 0 }
      }
      return fail(err instanceof Error ? err.message : String(err))
    }

    try {
      for await (const part of result.stream) {
        const p = asRecord(part)
        switch (p['type']) {
          case 'text-delta':
            if (typeof p['text'] === 'string' && p['text'].length > 0) {
              emit({ type: 'text-delta', runId, delta: p['text'] as string })
            }
            break
          case 'tool-call': {
            const call = asRecord(p['toolCall'] ?? p)
            emit({
              type: 'tool-call',
              runId,
              toolCallId: String(call['toolCallId'] ?? p['toolCallId'] ?? ''),
              toolName: String(call['toolName'] ?? p['toolName'] ?? 'unknown'),
              input: (call['input'] ?? p['input'] ?? p['args'] ?? null) as unknown
            })
            break
          }
          case 'tool-result': {
            const res = asRecord(p['toolResult'] ?? p)
            emit({
              type: 'tool-result',
              runId,
              toolCallId: String(res['toolCallId'] ?? p['toolCallId'] ?? ''),
              toolName: String(res['toolName'] ?? p['toolName'] ?? 'unknown'),
              output: (res['output'] ?? res['result'] ?? p['output'] ?? null) as unknown
            })
            break
          }
          default:
            break
        }
      }
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        emit({ type: 'aborted', runId })
        return { text: '', steps: 0 }
      }
      return fail(err instanceof Error ? err.message : String(err))
    }

    const content = (await result.content) as Array<Record<string, unknown>>
    const approvals = content.filter((c) => c['type'] === 'tool-approval-request' && !c['isAutomatic'])

    if (approvals.length === 0) {
      const text = await result.text
      const steps = await result.steps
      emit({ type: 'done', runId, text, steps: Array.isArray(steps) ? steps.length : 0 })
      return { text, steps: Array.isArray(steps) ? steps.length : 0 }
    }

    // Manual approval round: ask the UI (or auto-deny for scheduled runs).
    const responses: Array<Record<string, unknown>> = []
    for (const a of approvals) {
      const req: ApprovalRequest = {
        approvalId: String(a['approvalId'] ?? ''),
        toolCallId: String(a['toolCallId'] ?? ''),
        toolName: String(a['toolName'] ?? a['toolCall'] ?? 'unknown'),
        input: (a['input'] ?? a['args'] ?? null) as unknown,
        reason: typeof a['reason'] === 'string' ? (a['reason'] as string) : undefined
      }
      emit({
        type: 'approval-requested',
        runId,
        approvalId: req.approvalId,
        toolCallId: req.toolCallId,
        toolName: req.toolName,
        input: req.input,
        reason: req.reason
      })
      let decision: ApprovalDecision
      if (source === 'scheduled') {
        decision = { approved: false, reason: 'Scheduled runs cannot auto-approve writes; queued for review.' }
      } else if (opts.decideApproval) {
        decision = await opts.decideApproval(req)
      } else {
        decision = { approved: false, reason: 'No approval handler; denied by default.' }
      }
      responses.push({
        type: 'tool-approval-response',
        approvalId: req.approvalId,
        approved: decision.approved,
        ...(decision.reason ? { reason: decision.reason } : {})
      })
    }
    messages.push(...(await result.responseMessages))
    messages.push({ role: 'tool', content: responses } as unknown as ModelMessage)
  }
  })
}
