/**
 * Pure Hyprland helpers (no node/electron imports).
 *
 * Single source of truth for version -> syntax decisions and generated
 * config snippets. Imported by:
 *  - src/main (platformInfo, Settings hint text)
 *  - vitest (tests/unit/hypr.test.ts)
 *  - scripts/omarchy/hypr-setup.sh via `node` (Node >= 22 strips types,
 *    so this file must stay free of non-erasable TS syntax: no enums,
 *    no parameter properties, no namespaces).
 */

export interface HyprEnv {
  HYPRLAND_INSTANCE_SIGNATURE?: string
  XDG_CURRENT_DESKTOP?: string
}

/** True when running inside a Hyprland session. */
export function detectHyprland(env: HyprEnv): boolean {
  const sig = env.HYPRLAND_INSTANCE_SIGNATURE ?? ''
  const desktop = env.XDG_CURRENT_DESKTOP ?? ''
  if (sig.trim().length > 0) return true
  return desktop.toLowerCase().includes('hyprland')
}

export interface HyprVersion {
  major: number
  minor: number
  patch: number
}

/** Parse `hyprctl version` first line, e.g. "Hyprland 0.56.2 ...". Null if unparseable. */
export function parseHyprVersion(output: string): HyprVersion | null {
  const m = /Hyprland\s+(\d+)\.(\d+)\.(\d+)/.exec(output)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3])
  }
}

/** -1 | 0 | 1 comparing a to b. */
export function compareHyprVersion(a: HyprVersion, b: HyprVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return 0
}

/**
 * Hyprland introduced the `windowrule = <rule> on|off, match:<criteria>`
 * syntax after `windowrulev2`. Best-effort cutoff (verify against the Hypr
 * wiki for your version); the Omarchy-4 Lua path below does not depend on it.
 */
export const NEW_WINDOWRULE_SINCE: HyprVersion = { major: 0, minor: 50, patch: 0 }

export type HyprSyntax = 'lua' | 'conf-new' | 'conf-old'

/**
 * Pick the config syntax to generate.
 * - `lua` when the machine is managed by Omarchy 4+ Lua config
 *   (user files ~/.config/hypr/*.lua with the o.bind/o.window helpers).
 * - otherwise conf-new/conf-old by Hyprland version.
 */
export function hyprSyntaxFor(
  version: HyprVersion | null,
  luaManaged: boolean
): HyprSyntax {
  if (luaManaged) return 'lua'
  if (version && compareHyprVersion(version, NEW_WINDOWRULE_SINCE) >= 0) return 'conf-new'
  return 'conf-old'
}

/** "ALT, SPACE" (conf style) -> "ALT + SPACE" (Lua o.bind style). */
export function hyprKeyToLua(key: string): string {
  return key
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.toUpperCase())
    .join(' + ')
}

/** "ALT + SPACE" (Lua style) -> "ALT, SPACE" (conf style). */
export function hyprKeyToConf(key: string): string {
  const lua = key.includes('+') ? key : hyprKeyToLua(key)
  return lua
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.toUpperCase())
    .join(', ')
}

/** Convert an Electron accelerator ("Alt+Space") to a Hypr key ("ALT + SPACE"). */
export function electronHotkeyToHypr(hotkey: string): string {
  return hotkey
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const up = part.toUpperCase()
      if (up === 'COMMANDORCONTROL' || up === 'CMDORCTRL') return 'SUPER'
      if (up === 'COMMAND' || up === 'CMD') return 'SUPER'
      if (up === 'CONTROL' || up === 'CTRL') return 'CTRL'
      return up
    })
    .join(' + ')
}

/** Exact keybind line for the given syntax. `key` is conf-style ("ALT, SPACE"). */
export function hyprBindSnippet(key: string, execCmd: string, syntax: HyprSyntax): string {
  if (syntax === 'lua') {
    return `o.bind("${hyprKeyToLua(key)}", "QUICKauto", "${execCmd}")`
  }
  return `bind = ${hyprKeyToConf(key)}, exec, ${execCmd}`
}

/**
 * Window-rule snippet for the palette. Mirrors the exact rule form Omarchy
 * itself uses for floating helpers (localsend/pip: float + center; pip adds
 * pin; davinci stay_focused; pip border_size = 0; battlenet no_shadow).
 */
export function hyprWindowRuleSnippet(wmClass: string, syntax: HyprSyntax): string {
  const pattern = `^(${wmClass})$`
  if (syntax === 'lua') {
    return `o.window("${pattern}", { float = true, center = true, pin = true, stay_focused = true, border_size = 0, no_shadow = true })`
  }
  if (syntax === 'conf-new') {
    const match = `match:class ${pattern}`
    return [
      `windowrule = float on, ${match}`,
      `windowrule = center on, ${match}`,
      `windowrule = pin on, ${match}`,
      `windowrule = stayfocused on, ${match}`,
      `windowrule = border_size 0, ${match}`,
      `windowrule = noshadow on, ${match}`
    ].join('\n')
  }
  return [
    `windowrulev2 = float, class:${pattern}`,
    `windowrulev2 = center, class:${pattern}`,
    `windowrulev2 = pin, class:${pattern}`,
    `windowrulev2 = stayfocused, class:${pattern}`,
    `windowrulev2 = noborder, class:${pattern}`,
    `windowrulev2 = noshadow, class:${pattern}`
  ].join('\n')
}

/** Autostart snippet for the given syntax. */
export function hyprAutostartSnippet(execCmd: string, syntax: HyprSyntax): string {
  if (syntax === 'lua') return `o.launch_on_start("${execCmd}")`
  return `exec-once = ${execCmd}`
}
