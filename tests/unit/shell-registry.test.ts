import { describe, expect, it } from 'vitest'
import { discoverFeatures } from '../../src/renderer/shell/registry.js'
import type { FeatureModule } from '../../src/renderer/contracts/feature.js'

const Placeholder = (): null => null
const Automations: FeatureModule = {
  id: 'automations',
  title: 'Automations',
  icon: 'automation',
  Component: Placeholder
}

describe('feature registry', () => {
  it('provides the placeholder when no automations feature is discovered', () => {
    const [feature] = discoverFeatures({})
    expect(feature?.id).toBe('automations')
    expect(feature?.title).toBe('Automations')
  })

  it('prefers an injected automations feature over the placeholder', () => {
    const [feature] = discoverFeatures({ '/features/automations/feature.ts': { default: Automations } })
    expect(feature).toBe(Automations)
  })

  it('ignores invalid modules while retaining other valid features', () => {
    const registry = discoverFeatures({
      bad: { default: { id: 'broken' } },
      valid: { default: { ...Automations, id: 'plugins' } }
    })
    expect(registry.map(({ id }) => id)).toEqual(['automations', 'plugins'])
  })
})
