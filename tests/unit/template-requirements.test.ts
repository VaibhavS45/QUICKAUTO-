import { describe, expect, it } from 'vitest'
import { AUTOMATION_TEMPLATES } from '../../src/shared/contracts/automation-templates.js'
import { requirementState, templateRequirementBadges, toolDisplayLabel } from '../../src/renderer/shell/template-requirements.js'

describe('automation template requirements', () => {
  it('distinguishes ready, connectable, unavailable, and unknown services', () => {    const badges = templateRequirementBadges(AUTOMATION_TEMPLATES[0]!, {
      websearch: true,
      gmail: false
    })
    expect(badges).toEqual([
      { id: 'websearch', label: 'Web search', state: 'ready' },
      { id: 'files', label: 'Local file writes (approval required)', state: 'ready' },
      { id: 'gmail', label: 'Gmail', state: 'connect' }
    ])
    expect(templateRequirementBadges(AUTOMATION_TEMPLATES[2]!, {}).map(({ state }) => state)).toEqual(['unknown'])
  })

  it('exposes per-tool labels and connection states for the config rail', () => {
    expect(toolDisplayLabel('gmail')).toBe('Gmail')
    expect(toolDisplayLabel('sheets')).toBe('Google Sheets')
    expect(toolDisplayLabel('nope')).toBe('nope')
    expect(requirementState('gmail', { gmail: true })).toBe('ready')
    expect(requirementState('gmail', { gmail: false })).toBe('connect')
    expect(requirementState('gmail', {})).toBe('unknown')
    expect(requirementState('files', {})).toBe('ready')
    expect(requirementState('opencode', { opencode: true })).toBe('unavailable')
  })
})
