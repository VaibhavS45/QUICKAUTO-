import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { discoverFeatures } from '../../src/renderer/shell/registry.js'
import { FeatureContent, FeatureHeaderActions, createFeatureProps } from '../../src/renderer/shell/FeatureHost.js'
import type { FeatureModule, FeatureProps, ShellApi } from '../../src/renderer/contracts/feature.js'

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

  it('passes template deep links and focus ids to injected feature modules and hosts their header actions', () => {
    let received: FeatureProps | undefined
    const shell: ShellApi = {
      navigate: () => {},
      openCalendarWindow: () => {},
      openSettings: () => {},
      notify: () => {}
    }
    const fake: FeatureModule = {
      ...Automations,
      Component: (props) => {
        received = props
        return createElement('p', null, 'Injected automations module')
      },
      headerActions: [{
        id: 'create',
        label: 'Create automation',
        icon: 'plus',
        onClick: () => {}
      }]
    }
    const params = { templateId: 'repo-watcher', focusId: 'routine-42' }
    const props = createFeatureProps(shell, params)
    const content = renderToStaticMarkup(createElement(FeatureContent, { feature: fake, shell, params }))
    const actions = renderToStaticMarkup(createElement(FeatureHeaderActions, { feature: fake, shell }))

    expect(content).toContain('Injected automations module')
    expect(received?.initialTemplate?.id).toBe('repo-watcher')
    expect(received?.focusId).toBe('routine-42')
    expect(props.initialTemplate?.id).toBe('repo-watcher')
    expect(actions).toContain('Create automation')
    expect(actions).not.toMatch(/calendar/i)
  })
})
