import type { ShellApi } from '../contracts/feature.js'
import { START_OPTIONS, type StartKind } from '../features/automations/start-choice.js'
import { UpdatesStream } from './UpdatesStream.js'
import '../features/automations/automations.css'

export function HomeView({ shell }: { shell: ShellApi }): React.JSX.Element {
  function pickStart(kind: StartKind): void {
    shell.navigate('automations', { startKind: kind })
  }

  return (
    <section className="shell-home-automate" aria-label="Automate your work">
      <h2>Automate your work</h2>
      <div className="home-start-card">
        <div className="home-start-head">
          <strong>Choose how it starts</strong>
        </div>
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
      <div className="home-suggestions-head">
        <h3>Updates</h3>
      </div>
      <UpdatesStream shell={shell} />
    </section>
  )
}
