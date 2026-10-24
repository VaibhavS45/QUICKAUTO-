import type { ShellApi } from '../contracts/feature.js'
import { START_OPTIONS, type StartKind } from '../features/automations/start-choice.js'
import { CreateFlow } from '../features/automations/create-flow.js'
import { useI18n } from '../i18n/LanguageContext.js'
import { createFeatureProps } from './FeatureHost.js'
import { parseAutomationCreate } from './nav.js'
import { UpdatesStream } from './UpdatesStream.js'
import '../features/automations/automations.css'

export function HomeView({ shell, params }: { shell: ShellApi; params?: Record<string, unknown> }): React.JSX.Element {
  const { t } = useI18n()
  const feature = createFeatureProps(shell, params ?? {})
  const createKind = parseAutomationCreate(feature.initialStartKind)
  const template = feature.initialTemplate

  function pickStart(kind: StartKind): void {
    // "Advanced" describes the automation on the canvas; the rest build it here.
    if (kind === 'advanced') {
      shell.navigate('automations', { automationTab: 'canvas', startKind: 'advanced' })
      return
    }
    shell.navigate('home', { startKind: kind })
  }

  function closeCreate(): void {
    shell.navigate('home')
  }

  function created(id: string): void {
    shell.navigate('automations', { automationTab: 'manage', focusId: id })
  }

  if ((createKind && createKind !== 'advanced') || template) {
    return (
      <section className="automations is-creating" aria-label="Create automation">
        <CreateFlow
          kind={createKind ?? 'choice'}
          template={template}
          onPick={pickStart}
          onClose={closeCreate}
          onCreated={created}
          onConnect={() => shell.openSettings('connectors')}
        />
      </section>
    )
  }

  return (
    <section className="shell-home-automate" aria-label={t('home.title')}>
      <h2>{t('home.title')}</h2>
      <div className="home-start-card">
        <div className="start-grid">
          {START_OPTIONS.map((opt) => (
            <button key={opt.kind} type="button" className="start-opt" onClick={() => pickStart(opt.kind)}>
              <span className="start-icon" aria-hidden="true">{opt.icon}</span>
              <span className="start-titles">
                <strong>{opt.title}{opt.badge && <span className="start-badge">{opt.badge}</span>}</strong>
                <small>{opt.subtitle}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <UpdatesStream shell={shell} />
    </section>
  )
}
