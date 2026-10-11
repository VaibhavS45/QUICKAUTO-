import { describe, expect, it } from 'vitest'
import { AUTOMATION_TEMPLATES } from '../../src/shared/contracts/automation-templates.js'
import { templateActionLabel, templateTriggerLabel } from '../../src/renderer/shell/AutomationTemplateCards.js'

describe('templateTriggerLabel', () => {
  it('labels every fixture trigger without throwing', () => {
    for (const template of AUTOMATION_TEMPLATES) {
      expect(templateTriggerLabel(template).length).toBeGreaterThan(0)
    }
  })

  it('formats schedule / before-event triggers', () => {
    const [daily] = AUTOMATION_TEMPLATES
    expect(templateTriggerLabel(daily)).toBe('Daily at 20:00')
    expect(templateTriggerLabel(AUTOMATION_TEMPLATES[1])).toBe('10 min before an event')
  })
})

describe('templateActionLabel', () => {
  it('uses the first sentence of the first step', () => {
    expect(templateActionLabel(AUTOMATION_TEMPLATES[0])).toMatch(/^Research the supplied topic/)
    expect(templateActionLabel(AUTOMATION_TEMPLATES[0])).not.toContain('A separate')
  })
})
