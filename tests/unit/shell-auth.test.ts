import { describe, expect, it } from 'vitest'
import { LocalProfileAuth } from '../../src/main/agent/auth.js'

describe('LocalProfileAuth', () => {
  it('reads only the local profile and supplies a fallback name', () => {
    const auth = new LocalProfileAuth({
      get: () => ({ name: '  Vaibhav  ', email: 'v@example.test', about: 'private note', language: 'en' })
    })
    expect(auth.getCurrentProfile()).toEqual({ name: 'Vaibhav', email: 'v@example.test' })
  })

  it('does not require account credentials', () => {
    const auth = new LocalProfileAuth({
      get: () => ({ name: '', email: '', about: '', language: 'system' })
    })
    expect(auth.getCurrentProfile()).toEqual({ name: 'Local profile', email: '' })
  })
})
