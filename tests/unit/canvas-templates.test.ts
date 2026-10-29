import { describe, expect, it } from 'vitest'
import { CANVAS_DEMO_TEMPLATES } from '../../src/renderer/features/automations/canvas/canvas-templates.js'
import { canvasToPrompt, canvasToCreate } from '../../src/renderer/features/automations/canvas/canvas-steps.js'

describe('CANVAS_DEMO_TEMPLATES', () => {
  it('provides the required demo templates, including the three advanced ones', () => {
    const ids = CANVAS_DEMO_TEMPLATES.map((t) => t.id)
    expect(ids).toContain('github-issue-solver')
    expect(ids).toContain('github-pr-reviewer')
    expect(ids).toContain('gmail-github-notion-triage')
    expect(ids).toContain('daily-standup-digest')
    expect(ids).toContain('web-research-to-file')
    expect(ids).toContain('github-conflict-resolver')
    expect(ids).toContain('sheets-manual-bulk-email')
  })

  it('builds valid steps for GitHub Issue Solver & Auto-PR', () => {
    const template = CANVAS_DEMO_TEMPLATES.find((t) => t.id === 'github-issue-solver')!
    expect(template).toBeDefined()
    const steps = template.buildSteps()

    expect(steps.length).toBe(4)
    expect(steps[0]?.kind).toBe('trigger')
    expect(steps[0]?.title).toBe('GitHub')
    expect(steps[0]?.config?.label).toBe('bug')

    expect(steps[1]?.title).toBe('OpenCode')
    expect(steps[1]?.actionPrompt).toMatch(/inspect the github issue/i)

    expect(steps[2]?.title).toBe('GitHub')
    expect(steps[2]?.actionPrompt).toMatch(/create a git branch/i)

    const compiled = canvasToPrompt(steps)
    expect(compiled.text).toMatch(/check @github for a new issue is opened/i)
    expect(compiled.tools).toContain('github')
    expect(compiled.tools).toContain('opencode')

    const createPayload = canvasToCreate(steps, template.targetTitle)
    expect(createPayload.title).toBe('GitHub Issue Solver & Auto-PR')
    expect(createPayload.connectors).toContain('github')
    expect(createPayload.connectors).toContain('opencode')
  })

  it('builds valid steps for GitHub PR Code Reviewer', () => {
    const template = CANVAS_DEMO_TEMPLATES.find((t) => t.id === 'github-pr-reviewer')!
    expect(template).toBeDefined()
    const steps = template.buildSteps()

    expect(steps.length).toBe(4)
    expect(steps[0]?.kind).toBe('trigger')
    expect(steps[0]?.event).toBe('a new pull request is opened')

    expect(steps[1]?.title).toBe('GitHub')
    expect(steps[2]?.title).toBe('OpenCode')
    expect(steps[3]?.title).toBe('GitHub')

    const compiled = canvasToPrompt(steps)
    expect(compiled.text).toMatch(/code review/i)
    expect(compiled.tools).toContain('github')
    expect(compiled.tools).toContain('opencode')
  })

  it('builds valid steps for Urgent Bug Triage: Gmail to GitHub & Notion', () => {
    const template = CANVAS_DEMO_TEMPLATES.find((t) => t.id === 'gmail-github-notion-triage')!
    expect(template).toBeDefined()
    const steps = template.buildSteps()

    expect(steps.length).toBe(5)
    expect(steps[0]?.kind).toBe('trigger')
    expect(steps[0]?.title).toBe('Gmail')
    expect(steps[0]?.config?.contains).toBe('urgent')

    expect(steps[1]?.title).toBe('OpenCode')
    expect(steps[2]?.title).toBe('GitHub')
    expect(steps[3]?.title).toBe('Notion')

    const compiled = canvasToPrompt(steps)
    expect(compiled.tools).toContain('gmail')
    expect(compiled.tools).toContain('github')
    expect(compiled.tools).toContain('notion')
  })

  it('builds valid steps for Daily Engineering Standup', () => {
    const template = CANVAS_DEMO_TEMPLATES.find((t) => t.id === 'daily-standup-digest')!
    expect(template).toBeDefined()
    const steps = template.buildSteps()

    expect(steps.length).toBe(5)
    expect(steps[0]?.kind).toBe('trigger')
    expect(steps[0]?.schedule?.type).toBe('weekly')
    expect(steps[0]?.schedule?.weekdays).toEqual([1, 2, 3, 4, 5])

    expect(steps[1]?.title).toBe('GitHub')
    expect(steps[2]?.title).toBe('OpenCode')
    expect(steps[3]?.title).toBe('Notion')
    expect(steps[4]?.title).toBe('Slack')
  })

  it('generates unique step IDs on consecutive builds', () => {
    const template = CANVAS_DEMO_TEMPLATES[0]!
    const buildA = template.buildSteps()
    const buildB = template.buildSteps()

    expect(buildA[0]?.id).not.toBe(buildB[0]?.id)
    expect(buildA[1]?.id).not.toBe(buildB[1]?.id)
  })

  it('builds valid steps for Web Research → File Report', () => {
    const template = CANVAS_DEMO_TEMPLATES.find((t) => t.id === 'web-research-to-file')!
    expect(template).toBeDefined()
    const steps = template.buildSteps()

    expect(steps.length).toBe(4)
    expect(steps[0]?.kind).toBe('trigger')
    expect(steps[0]?.title).toBe('Schedule')
    expect(steps[0]?.schedule?.type).toBe('daily')

    expect(steps[1]?.title).toBe('Web Search')
    expect(steps[2]?.title).toBe('OpenCode')
    expect(steps[3]?.title).toBe('Files')

    // The output file path is stated in the exact-path step.
    expect(steps[3]?.actionPrompt).toContain('/home/<you>/Documents/research/report.md')

    const compiled = canvasToPrompt(steps)
    expect(compiled.tools).toContain('websearch')
    expect(compiled.tools).toContain('opencode')
    expect(compiled.tools).toContain('files')
  })

  it('builds valid steps for the GitHub Repo Conflict Resolver', () => {
    const template = CANVAS_DEMO_TEMPLATES.find((t) => t.id === 'github-conflict-resolver')!
    expect(template).toBeDefined()
    const steps = template.buildSteps()

    expect(steps.length).toBe(4)
    expect(steps[0]?.kind).toBe('trigger')
    expect(steps[0]?.title).toBe('GitHub')
    expect(steps[0]?.event).toMatch(/merge conflicts/i)
    expect(steps[0]?.config?.repository).toBe('owner/repo')

    expect(steps[2]?.title).toBe('OpenCode')
    expect(steps[2]?.actionPrompt).toMatch(/resolve each conflicting hunk/i)
    expect(steps[3]?.actionPrompt).toMatch(/push the conflict-resolved commits/i)

    const compiled = canvasToPrompt(steps)
    expect(compiled.tools).toContain('github')
    expect(compiled.tools).toContain('opencode')
  })

  it('builds valid steps for the Bulk Email Sender with both data sources on one trigger', () => {
    const template = CANVAS_DEMO_TEMPLATES.find((t) => t.id === 'sheets-manual-bulk-email')!
    expect(template).toBeDefined()
    const steps = template.buildSteps()

    expect(steps.length).toBe(5)
    const trigger = steps[0]!
    expect(trigger.kind).toBe('trigger')
    expect(trigger.title).toBe('Schedule')

    // Both data-source blocks hang off the same schedule trigger.
    const sheets = steps[1]!
    const manual = steps[3]!
    expect(sheets.title).toBe('Google Sheets')
    expect(sheets.from).toBe(trigger.id)
    expect(manual.from).toBe(trigger.id)
    expect(sheets.branch).toBe('Google Sheets')
    expect(manual.branch).toBe('Manual list')
    // Each branch ends in its own whole-body email step.
    expect(steps[2]!.kind).toBe('gmail')
    expect(steps[4]!.kind).toBe('gmail')
    expect(steps[2]!.from).toBe(sheets.id)
    expect(steps[4]!.from).toBe(manual.id)

    // 1–30 real people: the cap lives in the prompts, and the manual data block
    // carries its placeholder list.
    expect(manual.actionPrompt).toMatch(/1 to 30 people/)
    expect(manual.actionPrompt).toContain('example.com')
    expect(steps[2]!.actionPrompt).toMatch(/max 30/)
    expect(steps[4]!.actionPrompt).toMatch(/max 30/)

    const compiled = canvasToPrompt(steps)
    expect(compiled.tools).toContain('gmail')
    expect(compiled.tools).toContain('sheets')

    const createPayload = canvasToCreate(steps, template.targetTitle)
    expect(createPayload.connectors).toContain('gmail')
    expect(createPayload.connectors).toContain('sheets')
  })
})
