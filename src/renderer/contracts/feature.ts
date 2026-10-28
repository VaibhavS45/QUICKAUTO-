import type { ComponentType } from 'react'
import type { AppNotification } from '../../shared/contracts/notifications.js'
import type { AutomationTemplate } from '../../shared/contracts/automation-templates.js'
import type { RunLogRecord, UpdatesListRequest } from '../../shared/contracts/schedule.js'

export interface ShellApi {
  navigate(view: string, params?: Record<string, unknown>): void
  /** @deprecated No-op; the calendar window has been removed. */
  openCalendarWindow(): void
  openSettings(tab?: string): void
  notify(notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): void
  /** Run-log / updates feed (read-only). */
  updatesList(request?: UpdatesListRequest): Promise<{ ok: boolean; logs?: RunLogRecord[]; nextCursor?: string; error?: string }>
  updatesStream(): Promise<{ ok: boolean; error?: string }>
  onUpdatesChanged(cb: () => void): () => void
  getRunLog(runId: string): Promise<{ ok: boolean; log?: RunLogRecord; error?: string }>
}

export interface FeatureHeaderAction {
  id: string
  label: string
  icon: string
  onClick(shell: ShellApi): void
}

export interface FeatureProps {
  shell: ShellApi
  initialTemplate?: AutomationTemplate
  focusId?: string
  focusRunId?: string
  initialStartKind?: string
  initialAutomationTab?: string
  navTime?: number
}

export interface FeatureModule {
  id: string
  title: string
  icon: string
  Component: ComponentType<FeatureProps>
  headerActions?: FeatureHeaderAction[]
}
