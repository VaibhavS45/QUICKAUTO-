import { z } from 'zod'
import {
  AgentApprovalResponseSchema,
  AgentRunRequestSchema
} from '../shared/agent.js'
import { ModelSettingsSchema } from './settings/model-settings.js'
import { ProfileSettingsSchema } from './agent/profile-settings.js'
import { AppBehaviorPatchSchema, AppBehaviorSchema } from './agent/app-prefs.js'
import {
  ChatAppendSchema,
  ChatClearSchema,
  ChatCreateSchema,
  ChatRenameSchema,
  ChatThreadIdSchema
} from '../shared/chat.js'
import { ShellIpcChannels } from './shell/ipc.js'

/**
 * Typed IPC contract. Renderers may only invoke these channels
 * (see preload allowlist). All payloads validated with zod at the boundary.
 */

export const IpcChannels = {
  getModelSettings: 'settings:get-model',
  setModelSettings: 'settings:set-model',
  setApiKey: 'settings:set-api-key',
  clearApiKey: 'settings:clear-api-key',
  connectionStatus: 'connections:status',
  connectionConnect: 'connections:connect',
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
  routineToggle: 'routine:toggle',
  getProfile: 'settings:get-profile',
  setProfile: 'settings:set-profile',
  getAppBehavior: 'app:get-behavior',
  setAppBehavior: 'app:set-behavior',
  settingsShow: 'settings:show',
  settingsHide: 'settings:hide',
  /** GitHub CLI status for @github (local gh; token never crosses IPC). */
  githubStatus: 'github:status',
  chatList: 'shell:chat-list',
  chatGet: 'shell:chat-get',
  chatCreate: 'shell:chat-create',
  chatAppend: 'shell:chat-append',
  chatRename: 'shell:chat-rename',
  chatRemove: 'shell:chat-remove',
  chatClear: 'shell:chat-clear',
  ...ShellIpcChannels
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export const ApiKeySchema = z.object({
  key: z.string().min(1).max(10000)
})

export const ConnectionToolSchema = z.object({
  toolId: z.string().min(1).max(64)
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

export {
  ChatAppendSchema,
  ChatClearSchema,
  ChatCreateSchema,
  ChatRenameSchema,
  ChatThreadIdSchema
}

export const SettingsTabRequestSchema = z.object({
  tab: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i).optional()
}).strict().optional()

export {
  AgentApprovalResponseSchema,
  AgentRunRequestSchema,
  ModelSettingsSchema,
  ProfileSettingsSchema,
  AppBehaviorSchema,
  AppBehaviorPatchSchema
}
