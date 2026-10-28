import { ToolLoopAgent, isStepCount, type ModelMessage, type ToolSet } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { AgentEvent, RunAttachment, RunSource } from '../../shared/agent.js'
import { MAX_HISTORY_MESSAGES, type ChatMessage } from '../../shared/chat.js'
import type { ToolId } from '../../shared/types.js'
import { buildInstructions, getToolsForMentions } from './registry.js'
import { runWithContext } from './run-context.js'
import { buildToolApproval } from './tools.js'
import { noteUntrustedIngested } from './read-guard.js'
import type { ModelSettings } from '../settings/model-settings.js'
import { DEFAULT_ACP_MODEL, type AgentProvider } from './agent-provider.js'
import { runAcpPrompt } from '../engines/opencode/acp-client.js'
import { ensureOpencode, type EnsureOpencodeResult } from '../engines/opencode/opencode-install.js'

/**
 * Agent runner. Uses the Vercel AI SDK `ai` v7 `ToolLoopAgent` with
 * `toolApproval` (per-tool `needsApproval` is deprecated) and a step limit of
 * 20 (`isStepCount(20)`, the v7 name; v5/v6 called it `stepCountIs` — the
 * installed `ai@7` exports both, we use the v7 name).
 */

export const AGENT_STEP_LIMIT = 20

/**
 * Whole-run wall-clock cap for scheduled (headless) runs. Without it a hung
 * provider stream leaves `scheduledActive` set forever and the scheduler
 * skips every future occurrence of that automation (scheduler onTimer).
 */
export const SCHEDULED_RUN_TIMEOUT_MS = 15 * 60_000

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
  /** Folders shared with the task (@/path mentions from prompt/history). */
  sharedFolders?: string[]
  /** Files attached in the composer; forwarded to the engine as attachments. */
  attachments?: RunAttachment[]
}

export interface RunnerDeps {
  getConfig: () => ModelSettings
  getApiKey: () => Promise<string | null>
  getTools?: (toolIds: ToolId[]) => Promise<ToolSet>
  /** Selected engine; absent = builtin Vercel AI SDK loop (legacy value). */
  getAgentProvider?: () => AgentProvider
  getHarnessDirectory?: () => string
  /** ACP model id for opencode runs; null = free default (DEFAULT_ACP_MODEL). */
  getAcpModel?: () => string | null
  /** Injected in tests to avoid spawning `opencode acp`. */
  runAcp?: (req: { prompt: string; systemPrompt?: string; model?: string; attachments?: RunAttachment[]; runId: string; signal?: AbortSignal; emit: (e: AgentEvent) => void; onPermission?: (perm: { id: string; toolCallId: string; toolName: string; input: unknown; reason?: string }) => Promise<boolean> }) => Promise<{ text: string; steps: number }>
  /** Checks for OpenCode and installs it when missing; injected in tests. */
  ensureOpenCode?: () => Promise<EnsureOpencodeResult>
  /** Injected in tests to avoid network/model calls. */
  createAgent?: (args: {
    model: unknown
    tools: ToolSet
    source: RunSource
    instructions: string
  }) => AgentLike
  /** Scheduled-run wall-clock cap; injected in tests, 0 disables. */
  scheduledTimeoutMs?: number
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
  if (config.provider === 'google') {
    return createGoogleGenerativeAI({ apiKey })(config.model)
  }
  // 'openai' and 'openai-compatible' both ride the OpenAI provider;
  // compatible endpoints (Ollama, LM Studio, gateways) just set baseURL.
  return createOpenAI({ apiKey, baseURL: config.baseUrl || undefined })(config.model)
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

/**
 * Binds a whole scheduled run in wall-clock time. Only scheduled (headless)
 * runs are capped — interactive chat may legitimately run arbitrarily long.
 * `onTimeout` aborts the controller the provider stream (and ACP/pi child
 * processes) are bound to. If the provider honors the abort and settles the
 * run shortly after, the run's own outcome wins. Otherwise the race rejects,
 * letting the IPC layer's run-level catch record a failed RunLog and clear
 * `scheduledActive` (finally), so the scheduler resumes firing the next
 * occurrence. Without the cap a hung stream would keep `scheduledActive` set
 * forever and the scheduler would skip every subsequent occurrence.
 */
function withScheduledTimeout(
  source: RunSource,
  run: Promise<{ text: string; steps: number }>,
  timeoutMs?: number,
  onTimeout?: () => void
): Promise<{ text: string; steps: number }> {
  if (source !== 'scheduled') return run
  const ms = timeoutMs ?? SCHEDULED_RUN_TIMEOUT_MS
  if (!(ms > 0)) return run
  let settled = false
  void run.then(() => { settled = true }, () => { settled = true })
  return Promise.race([
    run,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        onTimeout?.()
        // Abort-responsive providers settle the run in this tick; the
        // grace delay lets that outcome win. A non-responsive (hung)
        // provider still gets the rejection right after.
        setTimeout(
          () => {
            if (!settled) {
              reject(new Error(`Scheduled run timed out after ${Math.round(ms / 60000)} minutes without completing.`))
            }
          },
          50
        )
      }, ms)
      timer.unref?.()
    })
  ])
}

interface HarnessRunArgs {
  prompt: string
  source: RunSource
  signal?: AbortSignal
  runId: string
  emit: (e: AgentEvent) => void
  systemPrompt?: string
  decideApproval?: RunAgentOptions['decideApproval']
  deps: RunnerDeps
  sharedFolders?: string[]
  attachments?: RunAttachment[]
}

/** Whole-run delegation to OpenCode ACP. Always emits done/error/aborted. */
async function runViaHarness(args: HarnessRunArgs): Promise<{ text: string; steps: number }> {
  const { prompt, signal, runId, emit, deps } = args
  const fail = (message: string): { text: string; steps: number } => {
    emit({ type: 'error', runId, message })
    return { text: '', steps: 0 }
  }
  if (signal?.aborted) {
    emit({ type: 'aborted', runId })
    return { text: '', steps: 0 }
  }
  return runWithContext(
    { runId, source: args.source, signal, sharedFolders: args.sharedFolders, untrustedIngested: false },
    async () => {
    try {
      if (!deps.getHarnessDirectory) {
        return fail('OpenCode harness is not wired in this build.')
      }
      // Scheduled runs must never fail on a missing CLI: install on demand
      // (once per machine) before the ACP handshake.
      const ready = await (deps.ensureOpenCode ?? ensureOpencode)()
      if (!ready.ok) {
        return fail(ready.error ?? 'OpenCode is not ready. Install it from https://opencode.ai and retry.')
      }
      const runAcp = deps.runAcp ?? ((r) => runAcpPrompt({ ...r, cwd: deps.getHarnessDirectory?.() }))
      const acp = await runAcp({
          prompt: [args.systemPrompt?.trim() ? `Additional user-provided instructions:\n${args.systemPrompt.trim()}` : '', prompt]
            .filter(Boolean)
            .join('\n\n'),
          model: deps.getAcpModel?.() ?? DEFAULT_ACP_MODEL,
          ...(args.attachments?.length ? { attachments: args.attachments } : {}),
          runId,
          signal,
          emit,
          onPermission: async (perm) => {
            // Scheduled runs CAN write once the user approves: the request
            // surfaces as the in-app approve/deny card (same channel a chat
            // run uses). Unanswered requests ride out the scheduled timeout.
            if (!args.decideApproval) return false
            const decision = await args.decideApproval({
              approvalId: perm.id,
              toolCallId: perm.toolCallId,
              toolName: perm.toolName,
              input: perm.input,
              reason: perm.reason ?? 'OpenCode requests permission.'
            })
            return decision.approved
          }
      })
      const { text, steps } = acp
      if (signal?.aborted) {
        emit({ type: 'aborted', runId })
        return { text: '', steps: 0 }
      }
      emit({ type: 'done', runId, text, steps })
      return { text, steps }
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        emit({ type: 'aborted', runId })
        return { text: '', steps: 0 }
      }
      return fail(err instanceof Error ? err.message : String(err))
    }
    }
  )
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
  // Absent deps = the builtin SDK loop (unit-test path); the app always
  // injects the stored engine, which is OpenCode.
  const engine: AgentProvider = deps.getAgentProvider?.() ?? 'builtin'

  // Scheduled runs get an internal ctrl that the timeout fires on, so the
  // abort reaches the underlying provider stream (AI SDK abortSignal) and
  // any hung socket unblocks. Caller cancel/completion composes through.
  const scheduledController = source === 'scheduled' ? new AbortController() : null
  if (scheduledController && signal) {
    signal.addEventListener('abort', () => scheduledController.abort(), { once: true })
  }
  const runSignal = scheduledController?.signal ?? signal

  // OpenCode runs bring their own models + auth (`opencode auth login`), so no
  // model API key is needed. Its ACP permission protocol fails closed (deny
  // without an approval answer), so scheduled runs never execute writes
  // unless the user approves the in-app card. `builtin` only survives as a
  // stored legacy value; the UI no longer offers it.
  if (engine !== 'builtin') {
    // Engine selected: authoritative, no builtin fall-through (one outcome
    // per run; failures emit a single error with the install/auth fix).
    // Scheduled runs keep writes behind the explicit approval flow.
    const engineSystemPrompt = [
      opts.systemPrompt?.trim() ?? '',
      buildInstructions(source, tools)
    ].filter(Boolean).join('\n\n')
    return withScheduledTimeout(
      source,
      runViaHarness({ prompt, source, signal: runSignal, runId, emit, systemPrompt: engineSystemPrompt, decideApproval: opts.decideApproval, deps, sharedFolders: opts.sharedFolders, attachments: opts.attachments }),
      deps.scheduledTimeoutMs,
      () => scheduledController?.abort()
    )
  }

  const apiKey = await deps.getApiKey()
  if (!apiKey) {
    return fail('No OpenCode engine available. Install it from https://opencode.ai and retry.')
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

  // Carry { runId, source, runSignal } to tool execute functions
  // (BudgetGuard metering, nested approvals, abort checks, read guard).
  return withScheduledTimeout(
    source,
    runWithContext(
      { runId, source, signal: runSignal, sharedFolders: opts.sharedFolders, untrustedIngested: false },
      async () => {
    const messages: ModelMessage[] = [
      ...(opts.history ?? []).slice(-MAX_HISTORY_MESSAGES)
        .map((message) => ({ role: message.role, content: message.text }) as ModelMessage),
      { role: 'user', content: prompt }
    ]
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (runSignal?.aborted) {
      emit({ type: 'aborted', runId })
      return { text: '', steps: 0 }
    }

    let result: Awaited<ReturnType<AgentLike['stream']>>
    try {
      result = await agent.stream({ messages, abortSignal: runSignal })
    } catch (err) {
      if (runSignal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
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
            noteUntrustedIngested(String(call['toolName'] ?? p['toolName'] ?? ''))
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
            noteUntrustedIngested(String(res['toolName'] ?? p['toolName'] ?? ''))
            emit({
              type: 'tool-result',
              runId,
              toolCallId: String(res['toolCallId'] ?? p['toolCallId'] ?? ''),
              toolName: String(res['toolName'] ?? p['toolName'] ?? 'unknown'),
              output: (res['output'] ?? res['result'] ?? p['output'] ?? null) as unknown
            })
            break
          }
          case 'tool-error': {
            // W9: a throwing tool execute shows up as a tool-error part, not
            // tool-result. Surface it so the failing step lands in the run log.
            const res = asRecord(p)
            const rawError = res['error']
            let detail: string
            if (typeof res['errorText'] === 'string' && res['errorText'].length) {
              detail = res['errorText']
            } else if (rawError instanceof Error) {
              detail = rawError.message
            } else if (typeof rawError === 'string' && rawError.length) {
              detail = rawError
            } else if (rawError && typeof rawError === 'object' && Object.keys(rawError).length) {
              detail = JSON.stringify(rawError)
            } else {
              detail = 'tool failed'
            }
            emit({
              type: 'tool-error',
              runId,
              toolCallId: String(res['toolCallId'] ?? p['toolCallId'] ?? ''),
              toolName: String(res['toolName'] ?? p['toolName'] ?? 'unknown'),
              message: detail.slice(0, 300)
            })
            break
          }
          default:
            break
        }
      }
    } catch (err) {
      if (runSignal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
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

    // Every write, including scheduled writes, waits for an explicit UI decision.
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
      if (opts.decideApproval) {
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
    }
  ),
    deps.scheduledTimeoutMs,
    () => scheduledController?.abort()
  )
}
