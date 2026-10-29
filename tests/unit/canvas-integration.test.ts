import { describe, expect, it } from 'vitest'
import { AutomationCreateSchema, AutomationPatchSchema } from '../../src/shared/contracts/automations.js'
import {
  canvasToCreate,
  canvasToPatch,
  canvasToPrompt,
  defaultCanvasSteps,
  insertCanvasStep,
  shouldSyncCanvasGraph,
  updateCanvasStep,
  type CanvasStep
} from '../../src/renderer/features/automations/canvas/canvas-steps.js'
import { CANVAS_DEMO_TEMPLATES } from '../../src/renderer/features/automations/canvas/canvas-templates.js'
import { readCanvasSteps, writeCanvasSteps } from '../../src/renderer/features/automations/canvas/canvas-memory.js'
import { AutomationService } from '../../src/main/automations/schedule/automation-service.js'
import { MemoryRoutineStore, Scheduler } from '../../src/main/automations/schedule/scheduler.js'

function makeMockStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => { store.set(key, val) },
    removeItem: (key: string) => { store.delete(key) }
  }
}

describe('Canvas Integration & End-to-End Workflow', () => {
  it('creates an advanced automation from default canvas steps and validates against schema', () => {
    const steps = defaultCanvasSteps()
    // Configure an action with a concrete task
    const configuredSteps = updateCanvasStep(steps, steps[1]!.id, {
      subtitle: 'Summarize unread emails and draft responses'
    })

    const payload = canvasToCreate(configuredSteps, 'Daily Email Assistant')
    expect(payload.kind).toBe('advanced')
    expect(payload.title).toBe('Daily Email Assistant')
    expect(payload.prompt).toContain('Summarize unread emails')
    expect(payload.connectors).toContain('gmail')

    const parsed = AutomationCreateSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
  })

  it('connects to AutomationService: creates, stores, retrieves, and patches advanced automations', () => {
    const memory = makeMockStorage()
    const now = new Date(2026, 9, 28, 10, 0, 0).getTime()
    const fired: string[] = []
    const scheduler = new Scheduler(new MemoryRoutineStore(), {
      fire: (r) => { fired.push(r.id) },
      now: () => now
    })
    const service = new AutomationService({
      scheduler,
      runTest: (r) => { fired.push(r.id); return 'test-run-123' },
      now: () => now
    })

    // 1. Create automation from canvas
    const steps = defaultCanvasSteps()
    const configuredSteps = updateCanvasStep(steps, steps[1]!.id, {
      subtitle: 'Review open PRs and notify team on Slack'
    })
    const createPayload = canvasToCreate(configuredSteps, 'PR Reviewer')
    const created = service.create(createPayload)

    expect(created.id).toBeTruthy()
    expect(created.kind).toBe('advanced')
    expect(created.title).toBe('PR Reviewer')
    expect(created.status).toBe('active')

    // 2. Persist graph steps into canvas storage
    writeCanvasSteps(created.id, configuredSteps, memory)
    const restoredSteps = readCanvasSteps<CanvasStep>(created.id, memory)
    expect(restoredSteps).not.toBeNull()
    expect(restoredSteps?.length).toBe(configuredSteps.length)
    expect(restoredSteps?.[1]?.subtitle).toBe('Review open PRs and notify team on Slack')

    // 3. Edit canvas steps (add a Sheets step and modify time)
    const updatedSteps = insertCanvasStep(restoredSteps!, restoredSteps!.length, 'action', undefined, {
      title: 'Sheets',
      subtitle: 'Record reviewed PR URLs in spreadsheet'
    })
    const triggerStep = updatedSteps.find((s) => s.kind === 'trigger')!
    const stepsWithNewTime = updateCanvasStep(updatedSteps, triggerStep.id, {
      subtitle: 'daily · 18:30'
    })

    // 4. Generate patch and validate against AutomationPatchSchema
    const patch = canvasToPatch(stepsWithNewTime, created)
    expect(patch.prompt).toContain('Record reviewed PR URLs in spreadsheet')
    expect(patch.connectors).toContain('sheets')
    expect(patch.schedule?.time).toBe('18:30')

    const patchValidation = AutomationPatchSchema.safeParse(patch)
    expect(patchValidation.success).toBe(true)

    // 5. Apply patch to backend service
    const updated = service.update(created.id, patch)
    expect(updated).not.toBeNull()
    expect(updated?.prompt).toContain('Record reviewed PR URLs in spreadsheet')
    expect(updated?.connectors).toContain('sheets')
    expect(updated?.schedule?.time).toBe('18:30')

    // 6. Test run execution
    const runId = service.testRun(created.id)
    expect(runId).toBe('test-run-123')
    expect(fired).toContain(created.id)
  })

  it('all 7 pre-built demo workflows connect, compile cleanly, and register as valid automations', () => {
    const now = new Date(2026, 9, 28, 10, 0, 0).getTime()
    const scheduler = new Scheduler(new MemoryRoutineStore(), { fire: () => {}, now: () => now })
    const service = new AutomationService({ scheduler, now: () => now })

    for (const template of CANVAS_DEMO_TEMPLATES) {
      const steps = template.buildSteps()
      expect(steps.length).toBeGreaterThan(1)

      const promptData = canvasToPrompt(steps)
      expect(promptData.text.length).toBeGreaterThan(0)
      expect(promptData.tools.length).toBeGreaterThan(0)

      const payload = canvasToCreate(steps, template.targetTitle)
      const parseResult = AutomationCreateSchema.safeParse(payload)
      expect(parseResult.success, `Template ${template.id} failed validation: ${JSON.stringify(parseResult)}`).toBe(true)

      const created = service.create(payload)
      expect(created.id).toBeTruthy()
      expect(created.kind).toBe('advanced')
      expect(created.title).toBe(template.targetTitle)
    }
  })

  it('handles multi-branch workflows with conditions, routing tools to proper connectors', () => {
    const steps: CanvasStep[] = [
      {
        id: 'step-trigger',
        kind: 'trigger',
        title: 'GitHub',
        subtitle: 'When a new pull request is opened · daily · 09:00 AM',
        filled: true,
        pos: { x: 0, y: 0 },
        event: 'a new pull request is opened'
      },
      {
        id: 'step-filter',
        kind: 'filter',
        title: 'Filter',
        subtitle: 'PR title contains "SECURITY" or "HOTFIX"',
        filled: true,
        pos: { x: 272, y: 0 },
        branch: 'Yes'
      },
      {
        id: 'step-slack',
        kind: 'action',
        title: 'Slack',
        subtitle: 'Alert #security-oncall immediately',
        filled: true,
        pos: { x: 544, y: 0 }
      },
      {
        id: 'step-opencode',
        kind: 'action',
        title: 'OpenCode',
        subtitle: 'Run security audit and post analysis',
        filled: true,
        pos: { x: 816, y: 0 }
      }
    ]

    const { text, tools } = canvasToPrompt(steps)
    expect(text).toContain('check @github for a new pull request is opened')
    expect(text).toContain('Only continue if: PR title contains "SECURITY" or "HOTFIX"')
    expect(text).toContain('Alert #security-oncall immediately')
    expect(text).toContain('Run security audit and post analysis')
    expect(tools).toContain('github')
    expect(tools).toContain('composio')
    expect(tools).toContain('opencode')

    const createPayload = canvasToCreate(steps, 'Security PR Sentinel')
    expect(createPayload.kind).toBe('advanced')
    expect(createPayload.connectors).toEqual(expect.arrayContaining(['github', 'composio', 'opencode']))
  })
})

describe('shouldSyncCanvasGraph', () => {
  it('never syncs to a locally-owned blank/graph-template flow on the landing screen', () => {
    // A demo template was just loaded on the landing page: no route automation.
    expect(shouldSyncCanvasGraph('web-research-to-file', 'blank', undefined, true, false)).toBe(false)
    // A blank canvas was just started the same way.
    expect(shouldSyncCanvasGraph('blank', 'blank', undefined, true, false)).toBe(false)
  })

  it('keeps a locally-owned graph while an automation is merely resumed from memory (no route focus)', () => {
    // "Open my last canvas" resumed automation A; the user then loads a demo
    // template from the in-editor dropdown — the sync must not replace it
    // with A's saved steps.
    expect(shouldSyncCanvasGraph('github-conflict-resolver', 'automation-a', undefined, true, false)).toBe(false)
  })

  it('ends local mode once the route opens a real automation again', () => {
    expect(shouldSyncCanvasGraph('github-conflict-resolver', 'automation-a', 'automation-a', true, false)).toBe(true)
  })

  it("blocks one render while a local navigation's route commit is still in flight", () => {
    // Shell navigation runs inside startViewTransition: a previous screen's
    // automation id can still be on the route for one render, which must not
    // win against the locally-owned graph that replaced it.
    expect(shouldSyncCanvasGraph('template-id', 'automation-a', 'automation-a', true, true)).toBe(false)
    // Blocks even when nothing is locally owned: the navigation will commit.
    expect(shouldSyncCanvasGraph('blank', 'automation-a', 'automation-a', false, true)).toBe(false)
  })

  it('stays blocked when a locally-owned graph has no route focus even after syncs', () => {
    // Template on landing, canvasKey already the template id.
    expect(shouldSyncCanvasGraph('web-research-to-file', 'web-research-to-file', undefined, true, false)).toBe(false)
  })

  it('syncs when a plain automation is opened (no local graph on screen)', () => {
    expect(shouldSyncCanvasGraph('automation-a', 'automation-b', 'automation-b', false, false)).toBe(true)
    expect(shouldSyncCanvasGraph('blank', 'automation-a', 'automation-a', false, false)).toBe(true)
  })

  it('skips work when the canvas is already synced to the route', () => {
    expect(shouldSyncCanvasGraph('automation-a', 'automation-a', 'automation-a', false, false)).toBe(false)
    expect(shouldSyncCanvasGraph('blank', 'blank', undefined, false, false)).toBe(false)
  })
})
