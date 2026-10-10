import type { FeatureModule } from '../../contracts/feature.js'
import AutomationsView from './AutomationsView.js'

const AutomationsFeature: FeatureModule = {
  id: 'automations',
  title: 'Automations',
  icon: 'automation',
  Component: AutomationsView
}

export default AutomationsFeature
