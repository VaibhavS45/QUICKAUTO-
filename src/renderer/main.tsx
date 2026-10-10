import React from 'react'
import { createRoot } from 'react-dom/client'
import SettingsApp from './settings/SettingsDialog'
import ShellApp from './shell/ShellApp'
import './styles.css'

/** Single renderer entry; app and settings share hash-based routing. */
function Root(): React.JSX.Element {
  const [hash, setHash] = React.useState(window.location.hash)
  React.useEffect(() => {
    const onChange = (): void => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  if (hash.startsWith('#settings')) return <SettingsApp />
  return <ShellApp />
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
