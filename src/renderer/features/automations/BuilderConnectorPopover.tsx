import React, { useState } from 'react'
import './builder-connector-popover.css'

interface BuilderConnectorPopoverProps {
  open: boolean
  onClose(): void
  onOpenSettings(): void
}

/* Authentic, pixel-perfect brand SVG icons */
function BrowserGlobeIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function PhoneIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="3" />
      <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
    </svg>
  )
}

function EmailEnvelopeIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="m22 7-10 7L2 7" />
    </svg>
  )
}

function GitHubBrandIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function GmailBrandIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 5.5v13a1 1 0 0 0 1 1h3.5v-9l5 4 5-4v9h3.5a1 1 0 0 0 1-1v-13a1 1 0 0 0-1.6-.8L12 10.5 4.1 4.7a1 1 0 0 0-1.6.8z" fill="#EA4335" />
      <path d="M7 10.5V19.5H3.5a1 1 0 0 1-1-1v-13l4.5 5z" fill="#4285F4" />
      <path d="M17 10.5V19.5h3.5a1 1 0 0 0 1-1v-13l-4.5 5z" fill="#34A853" />
      <path d="M2.5 5.5l9.5 7 9.5-7-3.5-2.5-6 4.5-6-4.5z" fill="#FBBC05" />
    </svg>
  )
}

function MetaBrandIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#0081FB" aria-hidden="true">
      <path d="M12 8.5C9.8 4 6.7 3 3.8 3 1.5 3 0 4.8 0 7.8c0 4.2 3.1 8.7 6.4 8.7 2.3 0 4.1-1.8 5.6-4.5 1.5 2.7 3.3 4.5 5.6 4.5 3.3 0 6.4-4.5 6.4-8.7C24 4.8 22.5 3 20.2 3c-2.9 0-6 1-8.2 5.5zm0 3.2C10.7 7.2 8.5 5.4 6.2 5.4 4.3 5.4 2.8 6.7 2.8 8.8c0 3 2.2 5.8 4.6 5.8 1.9 0 3.4-1.7 4.6-2.9zm0 0c1.2 1.2 2.7 2.9 4.6 2.9 2.4 0 4.6-2.8 4.6-5.8 0-2.1-1.5-3.4-3.4-3.4-2.3 0-4.5 1.8-5.8 6.3z" />
    </svg>
  )
}

function InstagramBrandIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="ig-grad" r="150%" cx="30%" cy="105%">
          <stop stopColor="#fdf497" offset="0%" />
          <stop stopColor="#fdf497" offset="5%" />
          <stop stopColor="#fd5949" offset="45%" />
          <stop stopColor="#d6249f" offset="60%" />
          <stop stopColor="#285AEB" offset="90%" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#ig-grad)" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="4.2" stroke="url(#ig-grad)" strokeWidth="2.2" />
      <circle cx="17.8" cy="6.2" r="1.3" fill="url(#ig-grad)" />
    </svg>
  )
}

function CreatorBagIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E1306C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  )
}

function OutlookBrandIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 4h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7V4z" fill="#0072C6" />
      <path d="M14 8.5l9 6.2V6l-9 2.5z" fill="#005A9E" />
      <rect x="1" y="5" width="13" height="14" rx="2" fill="#0284C7" />
      <circle cx="7.5" cy="12" r="3" fill="#ffffff" />
      <circle cx="7.5" cy="12" r="1.6" fill="#0284C7" />
    </svg>
  )
}

/* Browser Icons for Right Preview Card */
function ChromeLogo(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#EA4335" />
      <path d="M12 12l8.66-5A10 10 0 0 1 17 20.66L12 12z" fill="#FBBC05" />
      <path d="M12 12l-5 8.66A10 10 0 0 1 3.34 7L12 12z" fill="#34A853" />
      <circle cx="12" cy="12" r="4.5" fill="#FFFFFF" />
      <circle cx="12" cy="12" r="3.5" fill="#1A73E8" />
    </svg>
  )
}

function EdgeLogo(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21.8 14.5c-.5 4.5-4.4 7.5-9.3 7.5-5.5 0-10-4.5-10-10C2.5 6.5 7 2 12.5 2c3.5 0 6.5 1.8 8.2 4.6-1.5-.7-3.2-1.1-5-1.1-4.4 0-8 3.6-8 8 0 3.3 2 6.1 4.9 7.3 3.8 1.5 8-.5 8.7-4.3.2-1-.2-1.7-.5-2z" fill="#0078D7" />
      <path d="M12.5 2C16 2 19 3.8 20.7 6.6c-1.5-.7-3.2-1.1-5-1.1-4.4 0-8 3.6-8 8 0 .5 0 1 .2 1.5C9.2 8.5 14.8 5.5 19 8c.8.5 1.5 1.1 2 1.8-1.5-4.6-5.8-7.8-10.5-7.8z" fill="#00C298" />
    </svg>
  )
}

function ArcLogo(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="arc-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop stopColor="#FF416C" offset="0%" />
          <stop stopColor="#8A2387" offset="50%" />
          <stop stopColor="#0072FF" offset="100%" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9" stroke="url(#arc-g)" strokeWidth="3.2" strokeDasharray="38 18" strokeLinecap="round" />
      <circle cx="12" cy="12" r="4" fill="url(#arc-g)" />
    </svg>
  )
}

function BraveLogo(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2l7.5 4-1.8 9.2L12 22l-5.7-6.8L4.5 6 12 2z" fill="#FB542B" />
      <path d="M12 5.5l5 2.6-1.2 6.2L12 18.2l-3.8-3.9-1.2-6.2 5-2.6z" fill="#FF7654" />
      <path d="M12 9l2.5 1.3-.6 3.1L12 15.3l-1.9-1.9-.6-3.1L12 9z" fill="#FFFFFF" />
    </svg>
  )
}

interface ConnectorItem {
  id: string
  name: string
  icon: React.ReactNode
  isBeta?: boolean
  hasDetails?: boolean
  toggleable?: boolean
}

const CONNECTOR_ITEMS: ConnectorItem[] = [
  { id: 'browser', name: 'My Browser', icon: <BrowserGlobeIcon />, toggleable: true },
  { id: 'phone', name: 'Phone', icon: <PhoneIcon />, hasDetails: true },
  { id: 'email', name: 'Email', icon: <EmailEnvelopeIcon />, hasDetails: true },
  { id: 'github', name: 'GitHub', icon: <GitHubBrandIcon /> },
  { id: 'gmail', name: 'Gmail', icon: <GmailBrandIcon /> },
  { id: 'meta-ads', name: 'Meta Ads Manager', icon: <MetaBrandIcon />, isBeta: true },
  { id: 'instagram', name: 'Instagram', icon: <InstagramBrandIcon />, isBeta: true },
  { id: 'instagram-creator', name: 'Instagram Creator Marketplace', icon: <CreatorBagIcon />, isBeta: true },
  { id: 'outlook', name: 'Outlook Mail', icon: <OutlookBrandIcon /> }
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
                onClick={() => {
                  if (item.hasDetails) onOpenSettings()
                }}
              >
                <span className="bconn-item-icon">{item.icon}</span>
                <span className="bconn-item-name" title={item.name}>{item.name}</span>
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
              <span className="bconn-browser-icon chrome" title="Google Chrome"><ChromeLogo /></span>
              <span className="bconn-browser-icon edge" title="Microsoft Edge"><EdgeLogo /></span>
              <span className="bconn-browser-icon arc" title="Arc Browser"><ArcLogo /></span>
              <span className="bconn-browser-icon brave" title="Brave Browser"><BraveLogo /></span>
            </div>

            <h4 className="bconn-preview-title">QuickAuto is browsing... Take over</h4>
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
