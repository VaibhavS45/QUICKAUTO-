import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LoginScreen, RecoveryKeyGate } from '../../src/renderer/shell/LoginScreen.js'

function html(hasAccounts: boolean): string {
  return renderToStaticMarkup(createElement(LoginScreen, { hasAccounts, onAuthenticated: vi.fn() }))
}

describe('LoginScreen', () => {
  it('shows account creation first when no local account exists', () => {
    const rendered = html(false)
    expect(rendered).toContain('Create your local account')
    expect(rendered).toContain('Confirm password')
    expect(rendered).toContain('Create account')
    expect(rendered).toContain('first account here')
    expect(rendered).toContain('Already have an account? Sign in')
  })

  it('shows the sign-in form when an account already exists', () => {
    const rendered = html(true)
    expect(rendered).toContain('Sign in to Palette')
    expect(rendered).not.toContain('Confirm password')
    expect(rendered).toContain('Sign in')
    expect(rendered).toContain('New here? Create an account')
    expect(rendered).not.toContain('first account here')
  })

  it('offers password recovery from the sign-in form', () => {
    const rendered = html(true)
    expect(rendered).toContain('Forgot password?')
    expect(rendered).not.toContain('Recovery key')
  })

  it('wires exactly one navigation action per auth mode', () => {
    const login = html(true)
    expect((login.match(/Forgot password\?/g) ?? []).length).toBe(1)
    expect((login.match(/New here\? Create an account/g) ?? []).length).toBe(1)
    expect(login).not.toContain('Already have an account? Sign in')

    const register = html(false)
    // Exactly one "go to sign in" action; it must not be a forgot-password action.
    expect((register.match(/shell-auth-switch/g) ?? []).length).toBe(1)
    expect((register.match(/Already have an account\? Sign in/g) ?? []).length).toBe(1)
    expect(register).not.toContain('Forgot password?')
    expect(register).not.toContain('New here? Create an account')
  })

  it('does not offer password recovery on the account-creation form', () => {
    const rendered = html(false)
    expect(rendered).not.toContain('Forgot password?')
    expect(rendered).not.toContain('Recovery key')
  })

  it('shows the one-time recovery key gate when requested', () => {
    const rendered = renderToStaticMarkup(createElement(RecoveryKeyGate, {
      value: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111',
      onDone: vi.fn()
    }))
    expect(rendered).toContain('Save your recovery key')
    expect(rendered).toContain('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111')
    expect(rendered).toContain('Copy')
    expect(rendered).toContain('Continue')
  })
})
