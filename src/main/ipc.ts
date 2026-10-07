import { z } from 'zod'
import { HotkeySchema } from '../shared/types.js'
import {
  AgentApprovalResponseSchema,
  AgentRunRequestSchema,
  PaletteResizeSchema
} from '../shared/agent.js'
import { ModelSettingsSchema } from './settings/model-settings.js'

/**
 * Typed IPC contract. Renderers may only invoke these channels
 * (see preload allowlist). All payloads validated with zod at the boundary.
 */

export const IpcChannels = {
  paletteSubmit: 'palette:submit',
  paletteHide: 'palette:hide',
  paletteResize: 'palette:resize',
  getHotkey: 'settings:get-hotkey',
  setHotkey: 'settings:set-hotkey',
  hotkeyError: 'settings:hotkey-error',
  platformInfo: 'app:platform-info',
  calendarMinimize: 'calendar:minimize',
  calendarMaximize: 'calendar:toggle-maximize',
  calendarClose: 'calendar:close',
  getModelSettings: 'settings:get-model',
  setModelSettings: 'settings:set-model',
  setApiKey: 'settings:set-api-key',
  clearApiKey: 'settings:clear-api-key',
  agentRun: 'agent:run',
  agentCancel: 'agent:cancel',
  agentApproval: 'agent:approval',
  /** Main -> renderer push channel for streaming agent events. */
  agentEvent: 'agent:event',
  getBudget: 'budget:get',
  getConnector: 'connector:get',
  setConnectorKey: 'connector:set-key',
  clearConnectorKey: 'connector:clear-key',
  routineList: 'routine:list',
  routineCreate: 'routine:create',
  routineRemove: 'routine:remove',
  routineToggle: 'routine:toggle'
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

export const ApiKeySchema = z.object({
  key: z.string().min(1).max(10000)
})

export const AgentCancelSchema = z.object({
  runId: z.string().min(1).max(128)
})

export const ConnectorKeySchema = z.object({
  key: z.string().min(1).max(10000)
})

export const RoutineCreateSchema = z.object({
  text: z.string().min(1).max(8000)
})

export const RoutineIdSchema = z.object({
  id: z.string().min(1).max(128)
})

export const RoutineToggleSchema = z.object({
  id: z.string().min(1).max(128),
  enabled: z.boolean()
})

export { AgentApprovalResponseSchema, AgentRunRequestSchema, PaletteResizeSchema, ModelSettingsSchema }

export interface PlatformInfo {
  platform: NodeJS.Platform
  sessionType: string
  wayland: boolean
  globalShortcutReliable: boolean
}
