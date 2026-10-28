import { describe, expect, it } from 'vitest'
import { CANVAS_DEMO_TEMPLATES } from '../../src/renderer/features/automations/canvas/canvas-templates.js'
import { canvasToPrompt, canvasToCreate } from '../../src/renderer/features/automations/canvas/canvas-steps.js'

describe('CANVAS_DEMO_TEMPLATES', () => {
  it('provides all four required demo templates including GitHub issue solver, PR reviewer, bug triage, and standup', () => {
    const ids = CANVAS_DEMO_TEMPLATES.map((t) => t.id)
    expect(ids).toContain('github-issue-solver')
    expect(ids).toContain('github-pr-reviewer')
    expect(ids).toContain('gmail-github-notion-triage')
    expect(ids).toContain('daily-standup-digest')
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
})
