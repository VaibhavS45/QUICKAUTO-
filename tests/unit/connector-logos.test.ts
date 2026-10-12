import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONNECTOR_LOGOS, getConnectorLogo } from '../../src/renderer/settings/connectorLogos.js'

const LOGO_DIR = join(__dirname, '../../src/renderer/assets/connector-logos')

const EXPECTED_IDS = [
  'gmail',
  'calendar',
  'instagram',
  'notion',
  'outlook',
  'google-workspace',
  'slack',
  'meta-ads'
]

describe('connector brand logos', () => {
  it('maps every branded builtin connector to a logo', () => {
    for (const id of EXPECTED_IDS) {
      expect(getConnectorLogo(id), `missing logo for ${id}`).toBeTruthy()
    }
  })

  it('returns undefined for generic (non-brand) connectors', () => {
    expect(getConnectorLogo('browser')).toBeUndefined()
    expect(getConnectorLogo('video-editor')).toBeUndefined()
    expect(getConnectorLogo('phone')).toBeUndefined()
    expect(getConnectorLogo('email')).toBeUndefined()
  })

  it('vendors original SVG artwork on disk, not placeholders', () => {
    for (const id of EXPECTED_IDS) {
      const fileName = id === 'calendar' ? 'google-calendar.svg' : `${id}.svg`
      const path = join(LOGO_DIR, fileName)
      expect(existsSync(path), `missing file ${fileName}`).toBe(true)
      const svg = readFileSync(path, 'utf8')
      expect(svg).toContain('<svg')
      // Guard against generic 24x24 stroke placeholders being vendored.
      expect(svg.length).toBeGreaterThan(800)
    }
    expect(Object.keys(CONNECTOR_LOGOS).sort()).toEqual([...EXPECTED_IDS].sort())
  })
})
