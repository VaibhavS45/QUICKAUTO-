import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ProfileMenu } from '../../src/renderer/shell/ProfileMenu.js'

const baseProps = {
  name: 'Ada Lovelace',
  initials: 'AL',
  isSignedIn: false,
  onClose: vi.fn(),
  onOpenSettings: vi.fn(),
  onSignIn: vi.fn(),
  onSignOut: vi.fn()
}

function html(props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(createElement(ProfileMenu, { ...baseProps, ...props, open: true }))
}

describe('profile menu', () => {
  it('renders nothing when closed', () => {
    const rendered = renderToStaticMarkup(createElement(ProfileMenu, { ...baseProps, open: false }))
    expect(rendered).toBe('')
  })

  it('shows identity, status line, Settings, and sign-in (no account settings)', () => {
    const rendered = html()
    expect(rendered).toContain('role="menu"')
    expect(rendered).toContain('Ada Lovelace')
    expect(rendered).toContain('Not signed in')
    expect(rendered).toContain('Settings')
    expect(rendered).toContain('Log in')
    expect(rendered).not.toContain('Account settings')
  })

  it('shows sign-out when signed in', () => {
    const rendered = html({ isSignedIn: true })
    expect(rendered).toContain('Signed in')
    expect(rendered).toContain('Log out')
    expect(rendered).not.toContain('Log in')
  })

  it('omits the status line when there is no name', () => {
    const rendered = html({ name: '' })
    expect(rendered).toContain('Not signed in')
  })
})
