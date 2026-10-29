import { useState, type FormEvent } from 'react'
import type { AuthState } from '../../shared/contracts/auth.js'
import { useI18n } from '../i18n/LanguageContext.js'

interface LoginScreenProps {
  hasAccounts: boolean
  onAuthenticated(state: AuthState): void
}

type Mode = 'login' | 'register' | 'forgot'

/** Shown once right after account creation; the shell keeps the key until it is dismissed. */
export function RecoveryKeyGate({ value, onDone }: { value: string; onDone(): void }): React.JSX.Element {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  function copy(): void {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Clipboard may be blocked; the key stays visible so it can be copied by hand.
    })
  }

  return (
    <section
      className="shell-auth-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shell-recovery-title"
    >
      <span className="shell-auth-kicker">{t('shell.localAccount')}</span>
      <h1 id="shell-recovery-title">{t('shell.saveRecoveryTitle')}</h1>
      <p>{t('shell.saveRecoveryIntro')}</p>
      <div className="shell-auth-recovery">
        <code className="shell-auth-key">{value}</code>
        <button type="button" className="shell-auth-key-copy" onClick={copy}>
          {copied ? t('shell.copiedRecoveryKey') : t('shell.copyRecoveryKey')}
        </button>
      </div>
      <button type="button" className="shell-auth-recovery-continue" onClick={onDone}>
        {t('shell.recoverySavedAction')}
      </button>
    </section>
  )
}

export function LoginScreen({ hasAccounts, onAuthenticated }: LoginScreenProps): React.JSX.Element {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>(hasAccounts ? 'login' : 'register')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'

  function switchMode(next: Mode): void {
    setMode(next)
    setPassword('')
    setConfirm('')
    setRecoveryKeyInput('')
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (busy) return
    setError('')
    if (mode !== 'login' && password !== confirm) {
      setError(t('shell.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      const result = mode === 'register'
        ? await window.app.authRegister({ username, password })
        : mode === 'forgot'
          ? await window.app.authResetPassword({ username, recoveryKey: recoveryKeyInput, password })
          : await window.app.authLogin({ username, password })
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
    ? isRegister ? t('shell.creatingAccount') : isForgot ? t('shell.resettingPassword') : t('shell.signingIn')
    : isRegister ? t('shell.createAccountAction') : isForgot ? t('shell.resetAction') : t('shell.signInAction')

  const title = isRegister ? t('shell.createAccountTitle') : isForgot ? t('shell.resetTitle') : t('shell.signInTitle')
  const intro = isRegister ? t('shell.createAccountIntro') : isForgot ? t('shell.resetIntro') : t('shell.signInIntro')

  return (
    <div className="shell-auth-gate">
      <section className="shell-auth-card" role="dialog" aria-modal="true" aria-labelledby="shell-auth-title">
        <span className="shell-auth-kicker">{t('shell.localAccount')}</span>
        <h1 id="shell-auth-title">{title}</h1>
        <p>{intro}</p>
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
          {isForgot && (
            <label>
              <span>{t('shell.recoveryKey')}</span>
              <input
                name="recovery-key"
                className="shell-auth-key-input"
                autoComplete="off"
                spellCheck={false}
                required
                value={recoveryKeyInput}
                onChange={(event) => setRecoveryKeyInput(event.target.value)}
              />
            </label>
          )}
          <label>
            <span>{isForgot ? t('shell.newPassword') : t('shell.password')}</span>
            <input
              name="password"
              type="password"
              autoComplete={isRegister || isForgot ? 'new-password' : 'current-password'}
              required
              minLength={8}
              maxLength={200}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {(isRegister || isForgot) && (
            <label>
              <span>{isForgot ? t('shell.confirmNewPassword') : t('shell.confirmPassword')}</span>
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
        {mode === 'login' ? (
          <>
            <button
              type="button"
              className="shell-auth-forgot"
              disabled={busy}
              onClick={() => switchMode('forgot')}
            >
              {t('shell.forgotPassword')}
            </button>
            <button
              type="button"
              className="shell-auth-switch"
              disabled={busy}
              onClick={() => switchMode('register')}
            >
              {t('shell.needAccount')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="shell-auth-switch"
            disabled={busy}
            onClick={() => switchMode('login')}
          >
            {isForgot ? t('shell.backToSignIn') : t('shell.haveAccount')}
          </button>
        )}
      </section>
    </div>
  )
}
