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
  it('maps variants to the previous raw palette classes', () => {
    expect(buttonClass()).toContain('bg-blue-500')
    expect(buttonClass('destructive', 'sm')).toContain('bg-red-700')
    expect(buttonClass('success', 'sm')).toContain('bg-emerald-600')
    expect(buttonClass('ghost', 'icon')).toContain('text-neutral-500')
    expect(buttonClass('secondary', 'sm')).toContain('border-neutral-700')
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
    expect(cardClass()).toContain('bg-neutral-900')
    expect(inputClass()).toContain('bg-neutral-950')
    expect(inputClass(true)).toContain('font-mono')
  })
})

describe('switch / kbd / separator / shader', () => {
  it('maps on/off tracks and chrome classes', () => {
    expect(switchClass(true)).toContain('bg-blue-500')
    expect(switchClass(false)).toContain('bg-neutral-700')
    expect(switchThumbClass(true)).toContain('translate-x-4')
    expect(kbdClass()).toContain('font-mono')
    expect(separatorClass()).toContain('h-px')
    expect(shaderLayerClass()).toContain('pointer-events-none')
  })
})

describe('settings window size', () => {
  it('is larger than the command bar overlay it replaced', () => {
    expect(SETTINGS_WIDTH).toBeGreaterThanOrEqual(900)
    expect(SETTINGS_HEIGHT).toBeGreaterThanOrEqual(600)
    expect(SETTINGS_MIN_WIDTH).toBeLessThan(SETTINGS_WIDTH)
  })
})
