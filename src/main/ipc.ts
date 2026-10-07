import { z } from 'zod'
import { HotkeySchema } from '../shared/types.js'

/**
 * Typed IPC contract. Renderers may only invoke these channels
 * (see preload allowlist). All payloads validated with zod at the boundary.
 */

export const IpcChannels = {
  paletteSubmit: 'palette:submit',
  paletteHide: 'palette:hide',
  paletteOpened: 'palette:opened',
  calendarNewDraft: 'calendar:new-draft',
  getHotkey: 'settings:get-hotkey',
  setHotkey: 'settings:set-hotkey',
  hotkeyError: 'settings:hotkey-error',
  platformInfo: 'app:platform-info'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export const PaletteSubmitSchema = z.object({
  text: z.string().max(8000),
  tools: z.array(z.string())
})

export const CalendarDraftSchema = z.object({
  text: z.string().max(8000)
})

export const SetHotkeySchema = z.object({
  hotkey: HotkeySchema
})

export const PlatformInfoSchema = z.object({
  platform: z.string(),
  sessionType: z.string(),
  wayland: z.boolean(),
  globalShortcutReliable: z.boolean(),
  hyprland: z.boolean(),
  toggleCommand: z.string()
})

export interface PlatformInfo {
  platform: NodeJS.Platform
  sessionType: string
  wayland: boolean
  globalShortcutReliable: boolean
  /** Running inside Hyprland (HYPRLAND_INSTANCE_SIGNATURE or XDG_CURRENT_DESKTOP). */
  hyprland: boolean
  /**
   * Exact command a system shortcut must run for --toggle.
   * Packaged: process.execPath; dev: `electron <app-path>`.
   */
  toggleCommand: string
}
