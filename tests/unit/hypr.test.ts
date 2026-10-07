import { describe, expect, it } from 'vitest'
import {
  detectHyprland,
  parseHyprVersion,
  compareHyprVersion,
  hyprSyntaxFor,
  hyprKeyToLua,
  hyprKeyToConf,
  electronHotkeyToHypr,
  hyprBindSnippet,
  hyprWindowRuleSnippet,
  hyprAutostartSnippet
} from '../../src/shared/hypr.js'

describe('detectHyprland', () => {
  it('detects via instance signature', () => {
    expect(detectHyprland({ HYPRLAND_INSTANCE_SIGNATURE: 'abc_123_456' })).toBe(true)
  })

  it('detects via current desktop (case-insensitive)', () => {
    expect(detectHyprland({ XDG_CURRENT_DESKTOP: 'Hyprland' })).toBe(true)
    expect(detectHyprland({ XDG_CURRENT_DESKTOP: 'HYPRLAND' })).toBe(true)
  })

  it('is false on GNOME/X11', () => {
    expect(detectHyprland({ XDG_CURRENT_DESKTOP: 'GNOME' })).toBe(false)
    expect(detectHyprland({})).toBe(false)
  })
})

describe('parseHyprVersion', () => {
  it('parses hyprctl version output', () => {
    expect(parseHyprVersion('Hyprland 0.56.2 built from branch v0.56.2')).toEqual({
      major: 0,
      minor: 56,
      patch: 2
    })
  })

  it('returns null when unparseable', () => {
    expect(parseHyprVersion('garbage')).toBeNull()
  })

  it('compares versions', () => {
    expect(
      compareHyprVersion({ major: 0, minor: 49, patch: 0 }, { major: 0, minor: 50, patch: 0 })
    ).toBe(-1)
    expect(
      compareHyprVersion({ major: 0, minor: 56, patch: 2 }, { major: 0, minor: 56, patch: 2 })
    ).toBe(0)
  })
})

describe('hyprSyntaxFor', () => {
  it('prefers lua on Omarchy-4 managed machines regardless of version', () => {
    expect(hyprSyntaxFor({ major: 0, minor: 56, patch: 2 }, true)).toBe('lua')
    expect(hyprSyntaxFor(null, true)).toBe('lua')
  })

  it('uses the new conf syntax on recent Hyprland', () => {
    expect(hyprSyntaxFor({ major: 0, minor: 56, patch: 2 }, false)).toBe('conf-new')
  })

  it('falls back to windowrulev2 on old/unknown versions', () => {
    expect(hyprSyntaxFor({ major: 0, minor: 44, patch: 1 }, false)).toBe('conf-old')
    expect(hyprSyntaxFor(null, false)).toBe('conf-old')
  })
})

describe('key conversion', () => {
  it('converts conf keys to Lua', () => {
    expect(hyprKeyToLua('ALT, SPACE')).toBe('ALT + SPACE')
    expect(hyprKeyToLua('SUPER, SHIFT, SPACE')).toBe('SUPER + SHIFT + SPACE')
  })

  it('converts Lua keys to conf', () => {
    expect(hyprKeyToConf('ALT + SPACE')).toBe('ALT, SPACE')
  })

  it('converts Electron accelerators to Hypr', () => {
    expect(electronHotkeyToHypr('Alt+Space')).toBe('ALT + SPACE')
    expect(electronHotkeyToHypr('Ctrl+Space')).toBe('CTRL + SPACE')
  })
})

describe('snippets', () => {
  it('emits the Lua bind line (Omarchy 4 form)', () => {
    expect(hyprBindSnippet('ALT, SPACE', 'quickauto --toggle', 'lua')).toBe(
      'o.bind("ALT + SPACE", "QUICKauto", "quickauto --toggle")'
    )
  })

  it('emits classic bind lines', () => {
    expect(hyprBindSnippet('ALT, SPACE', 'quickauto --toggle', 'conf-new')).toBe(
      'bind = ALT, SPACE, exec, quickauto --toggle'
    )
    expect(hyprBindSnippet('ALT, SPACE', 'quickauto --toggle', 'conf-old')).toBe(
      'bind = ALT, SPACE, exec, quickauto --toggle'
    )
  })

  it('emits Lua window rules mirroring Omarchy float+pin form', () => {
    const lua = hyprWindowRuleSnippet('quickauto', 'lua')
    expect(lua).toContain('o.window("^(quickauto)$"')
    expect(lua).toContain('float = true')
    expect(lua).toContain('pin = true')
  })

  it('emits both conf rule syntaxes', () => {
    const next = hyprWindowRuleSnippet('quickauto', 'conf-new')
    expect(next).toContain('windowrule = float on, match:class ^(quickauto)$')
    const old = hyprWindowRuleSnippet('quickauto', 'conf-old')
    expect(old).toContain('windowrulev2 = float, class:^(quickauto)$')
  })

  it('emits autostart lines', () => {
    expect(hyprAutostartSnippet('quickauto', 'lua')).toBe('o.launch_on_start("quickauto")')
    expect(hyprAutostartSnippet('quickauto', 'conf-new')).toBe('exec-once = quickauto')
  })
})
