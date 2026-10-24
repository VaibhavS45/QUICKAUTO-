import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CanvasDescribeBar from '../../src/renderer/features/automations/canvas-describe.js'

const props = {
  value: '',
  busy: false,
  disabled: true,
  error: '',
  onChange: () => {},
  onSubmit: () => {},
  onClose: () => {}
}

describe('canvas describe bar', () => {
  it('invites a plain-language description', () => {
    const html = renderToStaticMarkup(createElement(CanvasDescribeBar, props))
    expect(html).toContain('Describe what this automation should do')
    expect(html).toContain('Create')
  })

  it('disables Create until there is a description or a configured step', () => {
    expect(renderToStaticMarkup(createElement(CanvasDescribeBar, props))).toContain('disabled')
    const ready = renderToStaticMarkup(createElement(CanvasDescribeBar, { ...props, disabled: false, value: 'Send my inbox digest' }))
    expect(ready).not.toContain('disabled')
  })

  it('shows the error and the busy state', () => {
    const html = renderToStaticMarkup(createElement(CanvasDescribeBar, { ...props, disabled: false, busy: true, error: 'Could not save' }))
    expect(html).toContain('disabled')
    expect(html).toContain('Creating…')
    expect(html).toContain('Could not save')
  })
})
