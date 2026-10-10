import type { FeatureModule } from '../contracts/feature.js'
import { AutomationsPlaceholder } from './placeholders/AutomationsPlaceholder.js'

const placeholder: FeatureModule = {
  id: 'automations',
  title: 'Automations',
  icon: 'automation',
  Component: AutomationsPlaceholder
}

export function discoverFeatures(modules: Record<string, unknown>): FeatureModule[] {
  const discovered = Object.values(modules).flatMap((value) => {
    const candidate =
      typeof value === 'object' && value !== null && 'default' in value
        ? (value as { default: unknown }).default
        : value
    if (typeof candidate !== 'object' || candidate === null) return []
    const feature = candidate as Partial<FeatureModule>
    if (
      typeof feature.id !== 'string' ||
      typeof feature.title !== 'string' ||
      typeof feature.icon !== 'string' ||
      typeof feature.Component !== 'function'
    ) {
      return []
    }
    return [feature as FeatureModule]
  })
  const automations = discovered.find((feature) => feature.id === 'automations')
  return automations ? [automations, ...discovered.filter((feature) => feature !== automations)] : [placeholder, ...discovered]
}

export function getFeatureRegistry(
  modules: Record<string, unknown> = import.meta.glob('../features/*/feature.ts', { eager: true })
): FeatureModule[] {
  return discoverFeatures(modules)
}
