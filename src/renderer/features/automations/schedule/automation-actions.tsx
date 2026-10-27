import { createContext, useContext } from 'react'
import type { Automation } from '../../../../shared/contracts/automations.js'

/** Actions shared by the card menu and the detail header menu. */
export interface AutomationActions {
  toggle(automation: Automation): void
  testRun(automation: Automation): void
  editSchedule(automation: Automation): void
  remove(automation: Automation): void
}

const AutomationActionsContext = createContext<AutomationActions | null>(null)

export const AutomationActionsProvider = AutomationActionsContext.Provider

export function useAutomationActions(): AutomationActions {
  const actions = useContext(AutomationActionsContext)
  if (!actions) throw new Error('Automation actions are unavailable outside the Scheduled Tasks surface.')
  return actions
}
