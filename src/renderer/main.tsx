import React from 'react'
import { createRoot } from 'react-dom/client'
import PaletteApp from './palette/App'
import CalendarApp from './calendar/App'
import SettingsApp from './settings/SettingsDialog'
import ShellApp from './shell/ShellApp'
import './styles.css'

/** Single renderer entry; windows pick their UI by URL hash (#palette / #calendar). */
function Root(): React.JSX.Element {
  const [hash, setHash] = React.useState(window.location.hash)
  React.useEffect(() => {
    const onChange = (): void => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  if (hash === '#calendar') return <CalendarApp />
  if (hash.startsWith('#settings')) return <SettingsApp />
  if (hash === '#app') return <ShellApp />
  return <PaletteApp />
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
