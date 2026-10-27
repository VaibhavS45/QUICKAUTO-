import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LoginScreen } from '../../src/renderer/shell/LoginScreen.js'

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
})
