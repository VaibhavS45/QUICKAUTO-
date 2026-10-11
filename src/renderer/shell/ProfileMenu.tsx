import { useEffect } from 'react'

interface ProfileMenuProps {
  open: boolean
  name: string
  email: string
  initials: string
  onClose(): void
  onOpenSettings(tab?: string): void
}

export function ProfileMenu({ open, name, email, initials, onClose, onOpenSettings }: ProfileMenuProps): React.JSX.Element | null {
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
      <button type="button" className="shell-menu-backdrop" aria-label="Close profile menu" onClick={onClose} />
      <div className="shell-profile-menu" role="menu" aria-label="Profile">
        <div className="shell-profile-menu-head">
          <span className="shell-avatar">{initials || 'L'}</span>
          <span className="shell-profile-menu-identity">
            <strong>{name}</strong>
            {email && <small>{email}</small>}
          </span>
        </div>
        <button type="button" role="menuitem" onClick={() => { onOpenSettings('account'); onClose() }}>
          Account settings
        </button>
        <button type="button" role="menuitem" onClick={() => { onOpenSettings(); onClose() }}>
          Settings
        </button>
      </div>
    </>
  )
}
