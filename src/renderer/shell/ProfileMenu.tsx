import { useEffect } from 'react'
import { useI18n } from '../i18n/LanguageContext.js'

interface ProfileMenuProps {
  open: boolean
  name: string
  email: string
  initials: string
  onClose(): void
  onOpenSettings(tab?: string): void
}

export function ProfileMenu({ open, name, email, initials, onClose, onOpenSettings }: ProfileMenuProps): React.JSX.Element | null {
  const { t } = useI18n()
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <>
      <button type="button" className="shell-menu-backdrop" aria-label={t('shell.closeProfileMenu')} onClick={onClose} />
      <div className="shell-profile-menu" role="menu" aria-label={t('shell.profile')}>
        <div className="shell-profile-menu-head">
          <span className="shell-avatar">{initials || 'L'}</span>
          <span className="shell-profile-menu-identity">
            <strong>{name}</strong>
            {email && <small>{email}</small>}
          </span>
        </div>
        <button type="button" role="menuitem" onClick={() => { onOpenSettings('account'); onClose() }}>
          {t('shell.accountSettings')}
        </button>
        <button type="button" role="menuitem" onClick={() => { onOpenSettings(); onClose() }}>
          {t('shell.settings')}
        </button>
      </div>
    </>
  )
}
