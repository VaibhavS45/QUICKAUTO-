import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload: contextBridge API only. No API keys or tokens ever reach the renderer.
 * Every invoke payload is validated with zod in the main process.
 */

const api = {
  submit: (payload: { text: string; tools: string[] }) =>
    ipcRenderer.invoke('palette:submit', payload),
  hide: () => ipcRenderer.send('palette:hide'),
  onOpened: (cb: () => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('palette:opened', fn)
    return () => ipcRenderer.removeListener('palette:opened', fn)
  },
  onOpenSettings: (cb: () => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('settings:open', fn)
    return () => ipcRenderer.removeListener('settings:open', fn)
  },
  onHotkeyError: (cb: (msg: string) => void) => {
    const fn = (_e: unknown, msg: string): void => cb(msg)
    ipcRenderer.on('settings:hotkey-error', fn)
    return () => ipcRenderer.removeListener('settings:hotkey-error', fn)
  },
  getHotkey: (): Promise<{ hotkey: string; error: string | null }> =>
    ipcRenderer.invoke('settings:get-hotkey'),
  setHotkey: (hotkey: string) => ipcRenderer.invoke('settings:set-hotkey', { hotkey }),
  platformInfo: () => ipcRenderer.invoke('app:platform-info'),
  onCalendarDraft: (cb: (text: string) => void) => {
    const fn = (_e: unknown, text: string): void => cb(text)
    ipcRenderer.on('calendar:new-draft', fn)
    return () => ipcRenderer.removeListener('calendar:new-draft', fn)
  },
  calendarWindowEvent: (kind: 'opened' | 'closed') => {
    if (kind === 'opened') ipcRenderer.send('calendar:opened-with-window')
    else ipcRenderer.send('calendar:closed-to-tray')
  }
}

export type PaletteApi = typeof api

contextBridge.exposeInMainWorld('palette', api)
