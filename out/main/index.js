import { BrowserWindow, app, screen, globalShortcut, Notification, session, ipcMain, nativeImage, Tray, Menu } from "electron";
import Store from "electron-store";
import { existsSync } from "node:fs";
import { join } from "path";
import { z } from "zod";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const PALETTE_WIDTH = 720;
const PALETTE_MIN_HEIGHT = 120;
function preloadPath() {
  const candidates = [
    join(__dirname, "../preload/index.cjs"),
    join(app.getAppPath(), "out/preload/index.cjs"),
    join(__dirname, "../preload/index.mjs"),
    join(__dirname, "../preload/index.js")
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0];
}
let win$1 = null;
let lastFocusedWindowId = null;
function rendererUrl(page) {
  if (process.env["ELECTRON_RENDERER_URL"]) {
    return `${process.env["ELECTRON_RENDERER_URL"]}/${page}`;
  }
  return join(__dirname, `../renderer/${page}`);
}
function getPaletteWindow() {
  return win$1;
}
function createPaletteWindow() {
  win$1 = new BrowserWindow({
    width: PALETTE_WIDTH,
    height: PALETTE_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hiddenInMissionControl: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const isMac = process.platform === "darwin";
  if (isMac) {
    win$1.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win$1.setVisibleOnAllWorkspaces(true);
  }
  const page = "index.html";
  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win$1.loadURL(`${rendererUrl(page)}#palette`);
  } else {
    void win$1.loadFile(rendererUrl(page), { hash: "palette" });
  }
  win$1.on("blur", () => {
    if (win$1 && !win$1.webContents.isDevToolsOpened()) hidePalette(false);
  });
  win$1.on("closed", () => {
    win$1 = null;
  });
  return win$1;
}
function centerOnCursor() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { width } = display.workAreaSize;
  const x = Math.round(display.workArea.x + (width - PALETTE_WIDTH) / 2);
  const y = Math.round(display.workArea.y + 120);
  return { x, y };
}
function showPalette() {
  if (!win$1) return;
  const active = BrowserWindow.getFocusedWindow();
  if (active && active !== win$1) lastFocusedWindowId = active.id;
  const { x, y } = centerOnCursor();
  win$1.setPosition(x, y);
  win$1.show();
  win$1.focus();
  win$1.webContents.send("palette:opened");
}
function hidePalette(restoreFocus) {
  if (!win$1 || win$1.isDestroyed()) return;
  win$1.hide();
  if (restoreFocus && process.platform === "win32" && lastFocusedWindowId !== null) {
    const prev = BrowserWindow.fromId(lastFocusedWindowId);
    if (prev && !prev.isDestroyed()) prev.focus();
    lastFocusedWindowId = null;
  }
}
function togglePalette() {
  if (!win$1 || win$1.isDestroyed()) return;
  if (win$1.isVisible()) hidePalette(true);
  else showPalette();
}
let win = null;
let pendingDraft = null;
function getCalendarWindow() {
  return win;
}
function openCalendar(draft) {
  if (typeof draft === "string" && draft.length > 0) pendingDraft = draft;
  if (win && !win.isDestroyed()) {
    if (pendingDraft) {
      win.webContents.send("calendar:new-draft", pendingDraft);
      pendingDraft = null;
    }
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 550,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const load = () => {
    if (!win) return;
    if (process.env["ELECTRON_RENDERER_URL"]) {
      const base = process.env["ELECTRON_RENDERER_URL"].replace(/\/$/, "");
      void win.loadURL(`${base}/index.html#calendar`);
    } else {
      void win.loadFile(join(__dirname, "../renderer/index.html"), { hash: "calendar" });
    }
  };
  load();
  win.once("ready-to-show", () => {
    win?.show();
    if (pendingDraft && win) {
      win.webContents.send("calendar:new-draft", pendingDraft);
      pendingDraft = null;
    }
  });
  win.on("closed", () => {
    win = null;
  });
}
const TOOL_IDS = [
  "calendar",
  "websearch",
  "notion",
  "gmail",
  "sheets",
  "opencode",
  "github",
  "files"
];
const TOOL_ALIASES = {
  email: "gmail",
  sheet: "sheets"
};
function parseMentionedTools(text) {
  const found = [];
  const re = /@([a-zA-Z]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].toLowerCase();
    let id;
    if (TOOL_IDS.includes(raw)) id = raw;
    else if (raw in TOOL_ALIASES) id = TOOL_ALIASES[raw];
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
}
const HotkeySchema = z.string().min(1).max(60).regex(/^[A-Za-z0-9+ ]+$/, "Hotkey may only contain letters, digits, + and space");
function defaultHotkey(platform) {
  return platform === "darwin" ? "Alt+Space" : "Ctrl+Space";
}
function toPaletteSubmit(text) {
  return { text, tools: parseMentionedTools(text) };
}
const IpcChannels = {
  paletteSubmit: "palette:submit",
  paletteHide: "palette:hide",
  paletteOpened: "palette:opened",
  calendarNewDraft: "calendar:new-draft",
  getHotkey: "settings:get-hotkey",
  setHotkey: "settings:set-hotkey",
  hotkeyError: "settings:hotkey-error",
  platformInfo: "app:platform-info"
};
const PaletteSubmitSchema = z.object({
  text: z.string().max(8e3),
  tools: z.array(z.string())
});
const CalendarDraftSchema = z.object({
  text: z.string().max(8e3)
});
const SetHotkeySchema = z.object({
  hotkey: HotkeySchema
});
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
const store = new Store({
  defaults: { hotkey: defaultHotkey(process.platform), openAtLogin: false }
});
let tray = null;
let hotkeyError = null;
function wantsToggle(argv) {
  return argv.includes("--toggle") || argv.includes("palette --toggle");
}
app.on("second-instance", (_event, argv) => {
  if (wantsToggle(argv)) togglePalette();
  else showPalette();
});
function sessionType() {
  return process.env["XDG_SESSION_TYPE"] ?? (process.platform === "linux" ? "unknown" : "n/a");
}
function platformInfo() {
  const st = sessionType();
  const wayland = process.platform === "linux" && st === "wayland";
  return {
    platform: process.platform,
    sessionType: st,
    wayland,
    // globalShortcut is unreliable on Wayland (Electron docs / portal path).
    globalShortcutReliable: !wayland
  };
}
function waylandToggleHint() {
  const execPath = process.execPath;
  return `Global hotkeys don't work reliably on Wayland, so the hotkey was not registered.

Fallback: bind a system shortcut in your desktop settings (GNOME: Settings → Keyboard → Custom Shortcut, KDE: System Settings → Shortcuts) to run:
${execPath} --toggle`;
}
function registerHotkey(hotkey) {
  globalShortcut.unregisterAll();
  try {
    const ok = globalShortcut.register(hotkey, () => togglePalette());
    if (!ok) {
      hotkeyError = process.platform === "linux" && platformInfo().wayland ? waylandToggleHint() : `Could not register hotkey "${hotkey}". It may be in use by another app. Pick a different hotkey in Settings, or run with --toggle.`;
      getPaletteWindow()?.webContents.send(IpcChannels.hotkeyError, hotkeyError);
      return false;
    }
    hotkeyError = null;
    return true;
  } catch (err) {
    hotkeyError = `Could not register hotkey "${hotkey}": ${String(err)}`;
    getPaletteWindow()?.webContents.send(IpcChannels.hotkeyError, hotkeyError);
    return false;
  }
}
function applyAutostart() {
  const openAtLogin = store.get("openAtLogin", false);
  app.setLoginItemSettings({ openAtLogin });
}
function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Palette");
  const menu = Menu.buildFromTemplate([
    { label: "Open palette", click: () => showPalette() },
    { label: "Open calendar", click: () => openCalendar() },
    {
      label: "Settings",
      click: () => {
        showPalette();
        getPaletteWindow()?.webContents.send("settings:open");
      }
    },
    { type: "separator" },
    {
      label: "Start on login",
      type: "checkbox",
      checked: store.get("openAtLogin", false),
      click: (item) => {
        store.set("openAtLogin", item.checked);
        applyAutostart();
      }
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => togglePalette());
}
function applyStrictCsp() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const dev = !!process.env["ELECTRON_RENDERER_URL"];
    const csp = dev ? `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; style-src 'self' 'unsafe-inline' http://localhost:*; img-src 'self' data: blob:; font-src 'self' data:;` : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;`;
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp]
      }
    });
  });
}
function wireIpc() {
  ipcMain.handle(IpcChannels.platformInfo, () => platformInfo());
  ipcMain.handle(IpcChannels.getHotkey, () => ({
    hotkey: store.get("hotkey", defaultHotkey(process.platform)),
    error: hotkeyError
  }));
  ipcMain.handle(IpcChannels.setHotkey, (_event, payload) => {
    const parsed = SetHotkeySchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: "Invalid hotkey format." };
    store.set("hotkey", parsed.data.hotkey);
    const ok = registerHotkey(parsed.data.hotkey);
    return { ok, error: ok ? null : hotkeyError };
  });
  ipcMain.on(IpcChannels.paletteHide, () => hidePalette(true));
  ipcMain.handle(IpcChannels.paletteSubmit, (_event, payload) => {
    const parsed = PaletteSubmitSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: "Invalid request." };
    const submit = toPaletteSubmit(parsed.data.text);
    if (submit.tools.includes("calendar")) {
      const draft = parsed.data.text.replace(/@calendar\s*/i, "").trim();
      const draftParsed = CalendarDraftSchema.safeParse({ text: draft });
      openCalendar(draftParsed.success ? draftParsed.data.text : "");
      if (process.platform === "darwin" && app.dock) app.dock.show();
      hidePalette(false);
      return { ok: true, action: "calendar", tools: submit.tools };
    }
    return {
      ok: true,
      action: "placeholder",
      tools: submit.tools,
      message: submit.tools.length === 0 ? "Agent loop lands in Milestone 2. For now try @ to see the tool list, or @calendar <text> to open a task draft." : `Agent loop lands in Milestone 2 — would have used: ${submit.tools.map((t) => `@${t}`).join(", ")}.`
    };
  });
  ipcMain.on("calendar:opened-with-window", () => {
    if (process.platform === "darwin" && app.dock) app.dock.show();
  });
  ipcMain.on("calendar:closed-to-tray", () => {
    if (process.platform === "darwin" && app.dock && !getCalendarWindow()) app.dock.hide();
  });
}
async function onReady() {
  if (wantsToggle(process.argv)) ;
  applyStrictCsp();
  createPaletteWindow();
  wireIpc();
  createTray();
  applyAutostart();
  const hotkey = store.get("hotkey", defaultHotkey(process.platform));
  const registered = registerHotkey(hotkey);
  if (!registered && platformInfo().wayland) {
    new Notification({
      title: "Palette: hotkey unavailable on Wayland",
      body: "Bind a system shortcut to palette --toggle. See Settings for the exact command."
    }).show();
  }
  if (process.platform === "darwin" && app.dock) app.dock.hide();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createPaletteWindow();
  });
}
app.whenReady().then(() => void onReady());
app.on("window-all-closed", () => {
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
export {
  store
};
