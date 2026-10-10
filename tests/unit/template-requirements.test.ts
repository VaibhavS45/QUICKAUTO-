import { describe, expect, it } from 'vitest'
import { AUTOMATION_TEMPLATES } from '../../src/shared/contracts/automation-templates.js'
import { templateRequirementBadges } from '../../src/renderer/shell/template-requirements.js'

describe('automation template requirements', () => {
  it('distinguishes ready, connectable, unavailable, and unknown services', () => {
    const badges = templateRequirementBadges(AUTOMATION_TEMPLATES[0]!, {
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
})
