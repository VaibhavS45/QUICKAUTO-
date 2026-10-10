import type { ComponentType } from 'react'
import type { AppNotification } from '../../shared/contracts/notifications.js'
import type { AutomationTemplate } from '../../shared/contracts/automation-templates.js'

export interface ShellApi {
  navigate(view: string, params?: Record<string, unknown>): void
  openCalendarWindow(): void
  openSettings(tab?: string): void
  notify(notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): void
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
}

export interface FeatureModule {
  id: string
  title: string
  icon: string
  Component: ComponentType<FeatureProps>
  headerActions?: FeatureHeaderAction[]
}
