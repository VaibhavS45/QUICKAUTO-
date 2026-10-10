import type { FeatureModule, FeatureProps, ShellApi } from '../contracts/feature.js'
import { AUTOMATION_TEMPLATES } from '../../shared/contracts/automation-templates.js'

export function createFeatureProps(shell: ShellApi, params: Record<string, unknown>): FeatureProps {
  const templateId = params['templateId']
  const initialTemplate = typeof templateId === 'string'
    ? AUTOMATION_TEMPLATES.find((template) => template.id === templateId)
    : undefined
  const focusId = params['focusId']
  return {
    shell,
    ...(initialTemplate ? { initialTemplate } : {}),
    ...(typeof focusId === 'string' ? { focusId } : {})
  }
}

export function FeatureContent({
  feature,
  shell,
  params
}: {
  feature: FeatureModule
  shell: ShellApi
  params: Record<string, unknown>
}): React.JSX.Element {
  return <feature.Component {...createFeatureProps(shell, params)} />
}

export function FeatureHeaderActions({ feature, shell }: { feature: FeatureModule; shell: ShellApi }): React.JSX.Element {
  return (
    <div className="shell-feature-header-actions">
      {feature.headerActions?.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-label={action.label}
          title={action.label}
          onClick={() => action.onClick(shell)}
        >
          <span aria-hidden="true">{action.icon}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  )
}
