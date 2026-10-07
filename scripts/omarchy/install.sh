#!/usr/bin/env bash
# QUICKauto Omarchy installer: build the app, install ~/.local/bin/quickauto
# launcher and the walker/desktop entry.
#
#   scripts/omarchy/install.sh [--dry-run] [--yes] [--uninstall]
#
# Idempotent. Edits only inside the managed block; backs files up before
# touching them. Never touches ~/.local/share/omarchy (Omarchy-owned).
set -euo pipefail

BEGIN_MARK='# >>> QUICKauto (managed) >>>'
END_MARK='# <<< QUICKauto (managed) <<<'

DRY_RUN=0
ASSUME_YES=0
UNINSTALL=0

usage() {
  cat <<'EOF'
Usage: scripts/omarchy/install.sh [--dry-run] [--yes] [--uninstall]

  --dry-run    print what would change, change nothing
  --yes        skip confirmation prompts
  --uninstall  remove only what this script created
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes) ASSUME_YES=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LAUNCHER="$HOME/.local/bin/quickauto"
DESKTOP_ENTRY="$HOME/.local/share/applications/quickauto.desktop"

log() { printf '%s\n' "$*"; }
dry() { printf '[dry-run] %s\n' "$*"; }

run() {
  if [ "$DRY_RUN" -eq 1 ]; then dry "$*"; else "$@"; fi
}

confirm() {
  if [ "$ASSUME_YES" -eq 1 ] || [ "$DRY_RUN" -eq 1 ]; then return 0; fi
  printf '%s [y/N] ' "$1"
  read -r answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ]
}

uninstall() {
  log "Removing QUICKauto install artifacts (managed only)..."
  if [ -f "$LAUNCHER" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then dry "rm $LAUNCHER"; else rm -f "$LAUNCHER"; log "removed $LAUNCHER"; fi
  else
    log "launcher not present: $LAUNCHER"
  fi
  if [ -f "$DESKTOP_ENTRY" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then dry "rm $DESKTOP_ENTRY"; else rm -f "$DESKTOP_ENTRY"; log "removed $DESKTOP_ENTRY"; fi
  else
    log "desktop entry not present: $DESKTOP_ENTRY"
  fi
  log "Uninstall done. (Hyprland bind/rules are removed by hypr-setup.sh --uninstall.)"
}

node_major() {
  node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'
}

preflight() {
  local fail=0
  if ! command -v node >/dev/null 2>&1; then
    log "FAIL: node not found. Install with: mise use -g node@22  (or: sudo pacman -S --needed nodejs npm)"
    fail=1
  else
    local major
    major="$(node_major)"
    if [ "${major:-0}" -lt 22 ]; then
      log "FAIL: node >= 22 required (found v${major}). Install with: mise use -g node@22"
      fail=1
    else
      log "PASS: node $(node -v)"
    fi
  fi
  if [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
    log "PASS: Wayland session"
  else
    log "WARN: XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-unset} (expected wayland)"
  fi
  if command -v hyprctl >/dev/null 2>&1; then
    log "PASS: hyprctl present ($(hyprctl version 2>/dev/null | head -n 1))"
  else
    log "FAIL: hyprctl not found (not a Hyprland session?)"
    fail=1
  fi
  return "$fail"
}

write_launcher() {
  local content
  content="#!/bin/sh
# QUICKauto launcher (managed by scripts/omarchy/install.sh).
# Passes all args through (e.g. quickauto --toggle).
exec \"$PROJECT_ROOT/node_modules/electron/dist/electron\" \"$PROJECT_ROOT/out/main\" \"\$@\""
  if [ "$DRY_RUN" -eq 1 ]; then
    dry "write $LAUNCHER:"
    printf '%s\n' "$content" | sed 's/^/[dry-run]   /'
    return 0
  fi
  mkdir -p "$(dirname "$LAUNCHER")"
  if [ -f "$LAUNCHER" ]; then cp -p "$LAUNCHER" "$LAUNCHER.bak.$(date +%Y%m%d%H%M%S)"; fi
  printf '%s\n' "$content" >"$LAUNCHER"
  chmod +x "$LAUNCHER"
  log "wrote $LAUNCHER"
}

write_desktop_entry() {
  # StartupWMClass=electron: verified dev WM_CLASS via hyprctl clients.
  # Packaged builds report quickauto (see docs/OMARCHY.md).
  local content
  content="[Desktop Entry]
Type=Application
Name=QUICKauto
Comment=Raycast-style command palette + agent task calendar
Exec=$HOME/.local/bin/quickauto
Icon=utilities-terminal
Categories=Utility;
StartupWMClass=electron
Terminal=false"
  if [ "$DRY_RUN" -eq 1 ]; then
    dry "write $DESKTOP_ENTRY:"
    printf '%s\n' "$content" | sed 's/^/[dry-run]   /'
    return 0
  fi
  mkdir -p "$(dirname "$DESKTOP_ENTRY")"
  if [ -f "$DESKTOP_ENTRY" ]; then cp -p "$DESKTOP_ENTRY" "$DESKTOP_ENTRY.bak.$(date +%Y%m%d%H%M%S)"; fi
  printf '%s\n' "$content" >"$DESKTOP_ENTRY"
  log "wrote $DESKTOP_ENTRY"
}

check_path() {
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) log "PASS: ~/.local/bin on PATH" ;;
    *) log "WARN: ~/.local/bin not on PATH. Fix: export PATH=\"\$HOME/.local/bin:\$PATH\" (add to ~/.bashrc)" ;;
  esac
}

main() {
  if [ "$UNINSTALL" -eq 1 ]; then uninstall; exit 0; fi

  log "QUICKauto install (project: $PROJECT_ROOT)"
  if ! preflight; then
    log "Preflight failed. Fix the FAIL lines above and re-run."
    exit 1
  fi

  if [ ! -f "$PROJECT_ROOT/package-lock.json" ]; then
    log "No lockfile: running npm install"
    run bash -c "cd '$PROJECT_ROOT' && npm install"
  else
    log "Running npm ci"
    run bash -c "cd '$PROJECT_ROOT' && npm ci"
  fi
  # Electron ships its binary via postinstall; some environments block
  # lifecycle scripts, so fetch it explicitly if it is missing.
  if [ ! -x "$PROJECT_ROOT/node_modules/electron/dist/electron" ]; then
    log "Electron binary missing (postinstall blocked?) — downloading it now"
    run bash -c "cd '$PROJECT_ROOT' && node node_modules/electron/install.js"
  fi
  log "Building"
  run bash -c "cd '$PROJECT_ROOT' && npm run build"

  if ! confirm "Install launcher ($LAUNCHER) and desktop entry?"; then
    log "Aborted."
    exit 1
  fi
  write_launcher
  write_desktop_entry
  check_path

  log ""
  log "Done. Next step: scripts/omarchy/hypr-setup.sh [--key \"ALT, SPACE\"]"
  log "Then press the keybind: the palette appears, Esc or click-away hides it."
}

main
