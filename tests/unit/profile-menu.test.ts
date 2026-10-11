import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ProfileMenu } from '../../src/renderer/shell/ProfileMenu.js'

const props = {
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  initials: 'AL',
  onClose: vi.fn(),
  onOpenSettings: vi.fn()
}

describe('profile menu', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(createElement(ProfileMenu, { ...props, open: false }))
    expect(html).toBe('')
  })

  it('shows the identity, settings entries, and a backdrop that closes it', () => {
    const html = renderToStaticMarkup(createElement(ProfileMenu, { ...props, open: true }))
    expect(html).toContain('role="menu"')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('ada@example.test')
    expect(html).toContain('Account settings')
    expect(html).toContain('Settings')
    expect(html).toContain('Close profile menu')
  })

  it('omits the email line when there is none', () => {
    const html = renderToStaticMarkup(createElement(ProfileMenu, { ...props, open: true, email: '' }))
    expect(html).not.toContain('@')
  })
})
