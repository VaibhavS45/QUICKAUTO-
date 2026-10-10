import { describe, expect, it } from 'vitest'
import { cn } from '../../src/renderer/components/ui/cn.js'
import { badgeClass } from '../../src/renderer/components/ui/badge.js'
import { buttonClass } from '../../src/renderer/components/ui/button.js'
import { cardClass } from '../../src/renderer/components/ui/card.js'
import { inputClass } from '../../src/renderer/components/ui/input.js'
import { kbdClass } from '../../src/renderer/components/ui/kbd.js'
import { separatorClass } from '../../src/renderer/components/ui/separator.js'
import { switchClass, switchThumbClass } from '../../src/renderer/components/ui/switch.js'
import { shaderLayerClass } from '../../src/renderer/components/ShaderBackdrop.js'
import {
  SETTINGS_HEIGHT,
  SETTINGS_MIN_WIDTH,
  SETTINGS_WIDTH
} from '../../src/main/agent/settings-layout.js'

describe('cn', () => {
  it('joins truthy classes only', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
    expect(cn()).toBe('')
  })
})

describe('buttonClass', () => {
  it('maps variants to shadcn token classes', () => {
    expect(buttonClass()).toContain('bg-primary')
    expect(buttonClass('destructive', 'sm')).toContain('bg-destructive')
    expect(buttonClass('success', 'sm')).toContain('bg-emerald-600')
    expect(buttonClass('ghost', 'icon')).toContain('text-muted-foreground')
    expect(buttonClass('secondary', 'sm')).toContain('bg-secondary')
  })
})

describe('badgeClass', () => {
  it('maps tool-call statuses to the previous raw chip classes', () => {
    expect(badgeClass('tool')).toContain('bg-indigo-600/30')
    expect(badgeClass('busy')).toContain('bg-amber-600/30')
    expect(badgeClass('alert')).toContain('bg-orange-600/40')
    expect(badgeClass('ok')).toContain('bg-emerald-700/30')
    expect(badgeClass('bad')).toContain('bg-red-800/50')
    expect(badgeClass('mute', true)).toContain('rounded-full')
  })
})

describe('cardClass / inputClass', () => {
  it('keeps the settings card and input shell', () => {
    expect(cardClass()).toContain('bg-card')
    expect(inputClass()).toContain('border-input')
    expect(inputClass(true)).toContain('font-mono')
  })
})

describe('switch / kbd / separator / shader', () => {
  it('maps on/off tracks and chrome classes', () => {
    expect(switchClass(true)).toContain('bg-primary')
    expect(switchClass(false)).toContain('bg-input')
    expect(switchThumbClass(true)).toContain('translate-x-4')
    expect(kbdClass()).toContain('font-mono')
    expect(separatorClass()).toContain('h-px')
    expect(shaderLayerClass()).toContain('pointer-events-none')
  })
})

describe('settings panel size', () => {
  it('uses a roomy floating settings panel size', () => {
    expect(SETTINGS_WIDTH).toBeGreaterThanOrEqual(900)
    expect(SETTINGS_HEIGHT).toBeGreaterThanOrEqual(600)
    expect(SETTINGS_MIN_WIDTH).toBeLessThan(SETTINGS_WIDTH)
  })
})
