import { useEffect, useRef } from 'react'
import { LogOut, Settings as SettingsIcon, User } from 'lucide-react'
import { useI18n } from '../i18n/LanguageContext.js'

interface ProfileMenuProps {
  open: boolean
  name: string
  isSignedIn: boolean
  busy?: boolean
  onClose(): void
  onOpenSettings(tab?: string): void
  onSignIn(): void
  onSignOut(): void
}

export function ProfileMenu({ open, name, isSignedIn, busy, onClose, onOpenSettings, onSignIn, onSignOut }: ProfileMenuProps): React.JSX.Element | null {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const menu = menuRef.current
      if (!menu) return
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      if (!items.length) return
      const current = items.indexOf(document.activeElement as HTMLElement)
      let next: number
      if (event.key === 'ArrowDown') next = current === -1 ? 0 : (current + 1) % items.length
      else next = current === -1 ? 0 : (current - 1 + items.length) % items.length
      items[next]?.focus()
    }
    window.addEventListener('keydown', onKey)
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div ref={menuRef} className="shell-profile-menu" role="menu" aria-label={t('shell.profile')}>
      <div className="shell-profile-menu-head">
        <span className="shell-avatar"><User aria-hidden="true" /></span>
        <div className="shell-profile-menu-identity">
          <strong>{name}</strong>
          <span className={`shell-profile-menu-status${isSignedIn ? ' is-signed-in' : ''}`}>{isSignedIn ? t('shell.signedIn') : t('shell.signedOut')}</span>
        </div>
      </div>
      <button type="button" role="menuitem" className="shell-profile-menu-item" onClick={() => { onOpenSettings(); onClose() }}>
        <SettingsIcon className="shell-profile-menu-icon" />
        <span>{t('shell.settings')}</span>
        <kbd className="shell-profile-menu-shortcut">⌘ ,</kbd>
      </button>
      <div role="separator" aria-orientation="horizontal" className="shell-profile-menu-divider" />
      {isSignedIn ? (
        <button type="button" role="menuitem" className="shell-profile-menu-item shell-profile-menu-item--signout" onClick={() => { onSignOut(); onClose() }}>
          <LogOut className="shell-profile-menu-icon" />
          <span>{t('shell.logOut')}</span>
        </button>
      ) : (
        <button type="button" role="menuitem" className="shell-profile-menu-item shell-profile-menu-item--signin" disabled={busy} aria-busy={busy} onClick={() => { onSignIn(); onClose() }}>
          <LogOut className="shell-profile-menu-icon" />
          <span>{t('shell.logIn')}</span>
        </button>
      )}
    </div>
  )
}
