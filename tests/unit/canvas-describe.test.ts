import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CanvasDescribeBar from '../../src/renderer/features/automations/canvas-describe.js'

const props = {
  value: '',
  busy: false,
  error: '',
  onChange: () => {},
  onSubmit: () => {},
  onClose: () => {}
}

describe('canvas describe bar', () => {
  it('invites a plain-language description for the agent', () => {
    const html = renderToStaticMarkup(createElement(CanvasDescribeBar, props))
    expect(html).toContain('Describe the automation and the agent will create it')
    expect(html).toContain('Create')
  })

  it('disables Create while empty and shows scheduler errors', () => {
    const html = renderToStaticMarkup(createElement(CanvasDescribeBar, { ...props, value: '  ', error: 'No time found' }))
    expect(html).toContain('disabled')
    expect(html).toContain('No time found')
  })

  it('shows a busy state while the agent creates it', () => {
    const html = renderToStaticMarkup(createElement(CanvasDescribeBar, { ...props, value: 'At 6pm ping me', busy: true }))
    expect(html).toContain('Creating…')
  })
})
