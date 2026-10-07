import { contextBridge, ipcRenderer } from "electron";
const api = {
  submit: (payload) => ipcRenderer.invoke("palette:submit", payload),
  hide: () => ipcRenderer.send("palette:hide"),
  onOpened: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("palette:opened", fn);
    return () => ipcRenderer.removeListener("palette:opened", fn);
  },
  onOpenSettings: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("settings:open", fn);
    return () => ipcRenderer.removeListener("settings:open", fn);
  },
  onHotkeyError: (cb) => {
    const fn = (_e, msg) => cb(msg);
    ipcRenderer.on("settings:hotkey-error", fn);
    return () => ipcRenderer.removeListener("settings:hotkey-error", fn);
  },
  getHotkey: () => ipcRenderer.invoke("settings:get-hotkey"),
  setHotkey: (hotkey) => ipcRenderer.invoke("settings:set-hotkey", { hotkey }),
  platformInfo: () => ipcRenderer.invoke("app:platform-info"),
  onCalendarDraft: (cb) => {
    const fn = (_e, text) => cb(text);
    ipcRenderer.on("calendar:new-draft", fn);
    return () => ipcRenderer.removeListener("calendar:new-draft", fn);
  },
  calendarWindowEvent: (kind) => {
    if (kind === "opened") ipcRenderer.send("calendar:opened-with-window");
    else ipcRenderer.send("calendar:closed-to-tray");
  }
};
contextBridge.exposeInMainWorld("palette", api);
