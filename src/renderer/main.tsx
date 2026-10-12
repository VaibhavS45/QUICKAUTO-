import React from 'react'
import { createRoot } from 'react-dom/client'
import SettingsApp from './settings/SettingsDialog'
import ShellApp from './shell/ShellApp'
import { LanguageProvider } from './i18n/LanguageContext'
import { applyTheme } from './settings/theme'
import './styles.css'

/** Single renderer entry; app and settings share hash-based routing. */
function Root(): React.JSX.Element {
  const [hash, setHash] = React.useState(window.location.hash)
  React.useEffect(() => {
    const onChange = (): void => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  // Apply the saved day/night mode before first paint of either surface.
  React.useEffect(() => {
    window.app
      .getAppBehavior()
      .then((r) => applyTheme((r as unknown as { theme?: unknown }).theme))
      .catch(() => applyTheme('system'))
  }, [])
  if (hash.startsWith('#settings')) return <LanguageProvider><SettingsApp /></LanguageProvider>
  return <LanguageProvider><ShellApp /></LanguageProvider>
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
