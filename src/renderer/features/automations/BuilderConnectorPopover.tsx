import { useState } from 'react'
import './builder-connector-popover.css'

interface BuilderConnectorPopoverProps {
  open: boolean
  onClose(): void
  onOpenSettings(): void
}

interface ConnectorItem {
  id: string
  name: string
  category?: string
  icon: string
  isBeta?: boolean
  hasDetails?: boolean
  connected?: boolean
  toggleable?: boolean
}

const CONNECTOR_ITEMS: ConnectorItem[] = [
  { id: 'browser', name: 'My Browser', icon: '🌐', toggleable: true, connected: true },
  { id: 'phone', name: 'Phone', icon: '📱', hasDetails: true },
  { id: 'email', name: 'Email', icon: '✉️', hasDetails: true },
  { id: 'github', name: 'GitHub', icon: '🐙', connected: false },
  { id: 'gmail', name: 'Gmail', icon: '🔴', connected: false },
  { id: 'meta-ads', name: 'Meta Ads Manager', icon: 'Ⓜ️', isBeta: true, connected: false },
  { id: 'instagram', name: 'Instagram', icon: '📸', isBeta: true, connected: false },
  { id: 'instagram-creator', name: 'Instagram Creator Marketplace', icon: '🛍️', isBeta: true, connected: false },
  { id: 'outlook', name: 'Outlook Mail', icon: '📧', connected: false }
]

export default function BuilderConnectorPopover({
  open,
  onClose,
  onOpenSettings
}: BuilderConnectorPopoverProps): React.JSX.Element | null {
  const [browserActive, setBrowserActive] = useState(true)

  if (!open) return null

  return (
    <>
      <div className="bconn-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="bconn-popover" role="dialog" aria-label="Connectors menu">
        {/* Left Sidebar List */}
        <div className="bconn-sidebar">
          <div className="bconn-items">
            {CONNECTOR_ITEMS.map((item) => (
              <div
                key={item.id}
                className={`bconn-item ${item.id === 'browser' ? 'is-selected' : ''}`}
              >
                <span className="bconn-item-icon">{item.icon}</span>
                <span className="bconn-item-name">{item.name}</span>
                {item.isBeta && <span className="bconn-beta-badge">Beta</span>}

                {item.toggleable && (
                  <label className="bconn-switch" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={browserActive}
                      onChange={(e) => setBrowserActive(e.target.checked)}
                    />
                    <span className="bconn-slider" />
                  </label>
                )}

                {!item.toggleable && item.hasDetails && (
                  <span className="bconn-arrow">›</span>
                )}

                {!item.toggleable && !item.hasDetails && (
                  <button
                    type="button"
                    className="bconn-btn-connect"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenSettings()
                    }}
                  >
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="bconn-footer">
            <button
              type="button"
              className="bconn-add-btn"
              onClick={onOpenSettings}
            >
              <span className="bconn-add-plus">+</span>
              <span>Add connectors</span>
              <span className="bconn-count-badge">+99</span>
            </button>
            <button
              type="button"
              className="bconn-manage-btn"
              onClick={onOpenSettings}
            >
              Manage connectors
            </button>
          </div>
        </div>

        {/* Right Preview Card */}
        <div className="bconn-preview-pane">
          <div className="bconn-preview-glow" />
          <div className="bconn-preview-card">
            <div className="bconn-browser-icons">
              <span className="bconn-browser-icon chrome" title="Google Chrome">🟡</span>
              <span className="bconn-browser-icon edge" title="Microsoft Edge">🌀</span>
              <span className="bconn-browser-icon arc" title="Arc Browser">🌈</span>
              <span className="bconn-browser-icon brave" title="Brave Browser">🦁</span>
            </div>

            <h4 className="bconn-preview-title">Manus is browsing... Take over</h4>
            <p className="bconn-preview-sub">
              QuickAuto uses your default browser profile to access authorized sites and perform routine workflows seamlessly.
            </p>

            <div className="bconn-preview-footer">
              <span className="bconn-browser-label">
                <span className="bconn-pulse-dot" />
                My Browser
              </span>
              <button
                type="button"
                className="bconn-install-link"
                onClick={onOpenSettings}
              >
                Install ↗
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
