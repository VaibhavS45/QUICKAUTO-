"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/preload/index.ts
var index_exports = {};
module.exports = __toCommonJS(index_exports);
var import_electron = require("electron");
var api = {
  submit: (payload) => import_electron.ipcRenderer.invoke("palette:submit", payload),
  hide: () => import_electron.ipcRenderer.send("palette:hide"),
  onOpened: (cb) => {
    const fn = () => cb();
    import_electron.ipcRenderer.on("palette:opened", fn);
    return () => import_electron.ipcRenderer.removeListener("palette:opened", fn);
  },
  onOpenSettings: (cb) => {
    const fn = () => cb();
    import_electron.ipcRenderer.on("settings:open", fn);
    return () => import_electron.ipcRenderer.removeListener("settings:open", fn);
  },
  onHotkeyError: (cb) => {
    const fn = (_e, msg) => cb(msg);
    import_electron.ipcRenderer.on("settings:hotkey-error", fn);
    return () => import_electron.ipcRenderer.removeListener("settings:hotkey-error", fn);
  },
  getHotkey: () => import_electron.ipcRenderer.invoke("settings:get-hotkey"),
  setHotkey: (hotkey) => import_electron.ipcRenderer.invoke("settings:set-hotkey", { hotkey }),
  platformInfo: () => import_electron.ipcRenderer.invoke("app:platform-info"),
  onCalendarDraft: (cb) => {
    const fn = (_e, text) => cb(text);
    import_electron.ipcRenderer.on("calendar:new-draft", fn);
    return () => import_electron.ipcRenderer.removeListener("calendar:new-draft", fn);
  },
  calendarWindowEvent: (kind) => {
    if (kind === "opened") import_electron.ipcRenderer.send("calendar:opened-with-window");
    else import_electron.ipcRenderer.send("calendar:closed-to-tray");
  }
};
import_electron.contextBridge.exposeInMainWorld("palette", api);
