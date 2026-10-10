import { useState } from 'react'
import type { FeatureProps } from '../contracts/feature.js'

export function AutomationsPlaceholder(_props: FeatureProps): React.JSX.Element {
  const [tab, setTab] = useState('Schedule')
  const tabs = ['Schedule', 'Triggers', 'Webhooks', 'Manage']
  return (
    <section className="shell-automations-placeholder">
      <nav aria-label="Automation sections" role="tablist">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <p>Automations are coming soon.</p>
    </section>
  )
}
