import { useState, type FormEvent } from 'react'
import type { AuthState } from '../../shared/contracts/auth.js'
import { useI18n } from '../i18n/LanguageContext.js'

interface LoginScreenProps {
  hasAccounts: boolean
  onAuthenticated(state: AuthState): void
}

type Mode = 'login' | 'register'

export function LoginScreen({ hasAccounts, onAuthenticated }: LoginScreenProps): React.JSX.Element {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>(hasAccounts ? 'login' : 'register')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isRegister = mode === 'register'

  function switchMode(next: Mode): void {
    setMode(next)
    setPassword('')
    setConfirm('')
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (busy) return
    setError('')
    if (isRegister && password !== confirm) {
      setError(t('shell.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      const credentials = { username, password }
      const result = isRegister
        ? await window.app.authRegister(credentials)
        : await window.app.authLogin(credentials)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onAuthenticated(result.state)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const action = busy
    ? isRegister ? t('shell.creatingAccount') : t('shell.signingIn')
    : isRegister ? t('shell.createAccountAction') : t('shell.signInAction')

  return (
    <div className="shell-auth-gate">
      <section className="shell-auth-card" role="dialog" aria-modal="true" aria-labelledby="shell-auth-title">
        <span className="shell-auth-kicker">{t('shell.localAccount')}</span>
        <h1 id="shell-auth-title">{isRegister ? t('shell.createAccountTitle') : t('shell.signInTitle')}</h1>
        <p>{isRegister ? t('shell.createAccountIntro') : t('shell.signInIntro')}</p>
        {isRegister && !hasAccounts && <p className="shell-auth-note">{t('shell.firstAccountNote')}</p>}
        <form className="shell-auth-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>{t('shell.username')}</span>
            <input
              name="username"
              autoComplete="username"
              autoFocus
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9._-]+"
              value={username}
              disabled={busy}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            <span>{t('shell.password')}</span>
            <input
              name="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={8}
              maxLength={200}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {isRegister && (
            <label>
              <span>{t('shell.confirmPassword')}</span>
              <input
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={200}
                value={confirm}
                disabled={busy}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
          )}
          <button type="submit" disabled={busy}>{action}</button>
        </form>
        <p className="shell-auth-status" role="status" aria-live="polite">
          {error || t('shell.localAccountHint')}
        </p>
        <button
          type="button"
          className="shell-auth-switch"
          disabled={busy}
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
        >
          {isRegister ? t('shell.haveAccount') : t('shell.needAccount')}
        </button>
      </section>
    </div>
  )
}
