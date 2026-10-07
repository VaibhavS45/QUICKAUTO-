#!/usr/bin/env bash
# QUICKauto Hyprland setup (Omarchy 4 / Hyprland 0.56 Lua config):
# adds the toggle keybind, floating window rules, and autostart — only
# inside the managed block, with timestamped backups. Falls back to classic
# hyprland.conf syntax on non-Lua setups.
#
#   scripts/omarchy/hypr-setup.sh [--key "ALT, SPACE"] [--dry-run] [--yes] [--uninstall]
#
# Idempotent. Never touches ~/.local/share/omarchy (Omarchy-owned).
set -euo pipefail

BEGIN_TEXT='>>> QUICKauto (managed) >>>'
END_TEXT='<<< QUICKauto (managed) <<<'

# Marker comment style must match the host file: '--' for Lua (a '#' line is
# a Lua syntax error and breaks the whole module), '#' for hyprland.conf.
markers_for() {
  case "$1" in
    *.lua) printf -- '-- %s\n-- %s\n' "$BEGIN_TEXT" "$END_TEXT" ;;
    *) printf '# %s\n# %s\n' "$BEGIN_TEXT" "$END_TEXT" ;;
  esac
}

begin_for() { markers_for "$1" | head -n 1; }
end_for() { markers_for "$1" | tail -n 1; }

KEY="ALT, SPACE"
DRY_RUN=0
ASSUME_YES=0
UNINSTALL=0

usage() {
  cat <<'EOF'
Usage: scripts/omarchy/hypr-setup.sh [--key "ALT, SPACE"] [--dry-run] [--yes] [--uninstall]

  --key "MOD, KEY"  keybind to toggle QUICKauto (default: "ALT, SPACE")
  --dry-run         print what would change, change nothing
  --yes             skip confirmation prompts
  --uninstall       remove only the managed blocks again
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --key)
      KEY="${2:?--key needs a value like \"ALT, SPACE\"}"
      shift
      ;;
    --dry-run) DRY_RUN=1 ;;
    --yes) ASSUME_YES=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HYPR_TS="$PROJECT_ROOT/src/shared/hypr.ts"
HYPR_DIR="$HOME/.config/hypr"
BINDINGS_LUA="$HYPR_DIR/bindings.lua"
AUTOSTART_LUA="$HYPR_DIR/autostart.lua"
WINDOWS_LUA="$HYPR_DIR/windows.lua"
HYPR_MAIN_LUA="$HYPR_DIR/hyprland.lua"
HYPR_CONF="$HYPR_DIR/hyprland.conf"
WM_CLASS="quickauto"
EXEC_CMD="quickauto --toggle"

log() { printf '%s\n' "$*"; }
dry() { printf '[dry-run] %s\n' "$*"; }

confirm() {
  if [ "$ASSUME_YES" -eq 1 ] || [ "$DRY_RUN" -eq 1 ]; then return 0; fi
  printf '%s [y/N] ' "$1"
  read -r answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ]
}

# Call the pure TS helper (Node strips types): node_eval <fn> [args...]
node_eval() {
  local fn="$1"
  shift
  node -e "
import('$HYPR_TS').then((m) => {
  const out = m['$fn'](...process.argv.slice(1));
  if (typeof out === 'string') process.stdout.write(out + '\n');
  else process.stdout.write(JSON.stringify(out));
}).catch((e) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
" -- "$@"
}

lua_managed() {
  # Omarchy 4+: user overrides live in ~/.config/hypr/*.lua with o.bind/o.window.
  [ -f "$BINDINGS_LUA" ]
}

hypr_version_string() {
  hyprctl version 2>/dev/null | head -n 1
}

detect_syntax() {
  if lua_managed; then
    printf 'lua'
  else
    node_eval hyprSyntaxForVersionString "$(hypr_version_string)" false
  fi
}

# modmask map from hyprctl binds -j (SUPER=64, ALT=8, CTRL=4, SHIFT=1)
key_conflict() {
  local key="$1"
  local mods keyname modmask
  mods="$(printf '%s' "$key" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | tr '[:lower:]' '[:upper:]')"
  modmask=0
  keyname=""
  while IFS= read -r part; do
    case "$part" in
      SUPER) modmask=$((modmask + 64)) ;;
      ALT) modmask=$((modmask + 8)) ;;
      CTRL) modmask=$((modmask + 4)) ;;
      SHIFT) modmask=$((modmask + 1)) ;;
      "") ;;
      *) keyname="$part" ;;
    esac
  done <<<"$mods"
  hyprctl binds -j 2>/dev/null | python3 -c "
import json, sys
want_mod = $modmask
want_key = '''$keyname'''.upper()
try:
    binds = json.load(sys.stdin)
except Exception:
    sys.exit(2)
for b in binds:
    if str(b.get('modmask')) == str(want_mod) and str(b.get('key') or '').upper() == want_key:
        print('CONFLICT:' + str(b.get('description') or b.get('dispatcher')))
        sys.exit(0)
print('FREE')
"
}

suggest_alternatives() {
  local candidates=("CTRL, SPACE" "ALT, SHIFT, SPACE" "SUPER, ALT, SPACE" "CTRL, ALT, SPACE")
  local found=0
  for c in "${candidates[@]}"; do
    if [ "$(key_conflict "$c")" = "FREE" ]; then
      log "  free: $c  (use: scripts/omarchy/hypr-setup.sh --key \"$c\")"
      found=$((found + 1))
      if [ "$found" -ge 3 ]; then break; fi
    fi
  done
  if [ "$found" -eq 0 ]; then log "  (no suggestion found among common combos — pick a key manually)"; fi
}

backup() {
  local file="$1"
  if [ ! -f "$file" ]; then return 0; fi
  local bak="$file.bak.$(date +%Y%m%d%H%M%S)"
  if [ "$DRY_RUN" -eq 1 ]; then dry "backup $file -> $bak"; else cp -p "$file" "$bak"; log "backup: $bak"; fi
}

# Remove any existing managed block from a file (for idempotency).
strip_block() {
  local file="$1"
  local begin end
  begin="$(begin_for "$file")"
  end="$(end_for "$file")"
  if [ ! -f "$file" ]; then return 0; fi
  # Also match the legacy '#' markers (used before Lua-aware markers existed).
  if grep -qF -- "$begin" "$file" || grep -qF -- "$BEGIN_TEXT" "$file"; then
    if [ "$DRY_RUN" -eq 1 ]; then
      dry "strip old managed block from $file"
    else
      python3 - "$file" "$BEGIN_TEXT" "$END_TEXT" <<'EOF'
import sys
path, begin_text, end_text = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    lines = f.readlines()
out, skipping = [], False
for line in lines:
    if begin_text in line:
        skipping = True
        continue
    if end_text in line:
        skipping = False
        continue
    if not skipping:
        out.append(line)
text = ''.join(out)
while '\n\n\n' in text:
    text = text.replace('\n\n\n', '\n\n')
with open(path, 'w') as f:
    f.write(text)
EOF
      log "stripped old managed block from $file"
    fi
  fi
}

append_block() {
  local file="$1"
  local body="$2"
  local begin end
  begin="$(begin_for "$file")"
  end="$(end_for "$file")"
  if [ "$DRY_RUN" -eq 1 ]; then
    dry "append to $file:"
    {
      printf '%s\n' "$begin"
      printf '%s\n' "$body"
      printf '%s\n' "$end"
    } | sed 's/^/[dry-run]   /'
    return 0
  fi
  mkdir -p "$(dirname "$file")"
  touch "$file"
  {
    printf '\n%s\n' "$begin"
    printf '%s\n' "$body"
    printf '%s\n' "$end"
  } >>"$file"
  log "added managed block to $file"
}

ensure_require_windows() {
  # ~/.config/hypr/hyprland.lua must require our windows.lua module.
  local line='require("hypr.windows")'
  if [ ! -f "$HYPR_MAIN_LUA" ]; then
    log "WARN: $HYPR_MAIN_LUA missing — cannot wire windows.lua; rules file still written."
    return 0
  fi
  if grep -qF "$line" "$HYPR_MAIN_LUA"; then
    log "windows.lua already required in hyprland.lua"
    return 0
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    dry "add $line to $HYPR_MAIN_LUA (after require(\"hypr.autostart\"))"
    return 0
  fi
  backup "$HYPR_MAIN_LUA"
  python3 - "$HYPR_MAIN_LUA" <<'EOF'
import sys
path = sys.argv[1]
anchor = 'require("hypr.autostart")'
line = 'require("hypr.windows")'
with open(path) as f:
    text = f.read()
if line not in text:
    if anchor in text:
        text = text.replace(anchor, anchor + '\n' + line, 1)
    else:
        text = text.rstrip('\n') + '\n' + line + '\n'
    with open(path, 'w') as f:
        f.write(text)
print("wired require(\"hypr.windows\") into hyprland.lua")
EOF
}

remove_require_windows() {
  local line='require("hypr.windows")'
  if [ -f "$HYPR_MAIN_LUA" ] && grep -qF "$line" "$HYPR_MAIN_LUA"; then
    if [ "$DRY_RUN" -eq 1 ]; then
      dry "remove $line from $HYPR_MAIN_LUA"
    else
      backup "$HYPR_MAIN_LUA"
      grep -vF "$line" "$HYPR_MAIN_LUA" >"$HYPR_MAIN_LUA.tmp" && mv "$HYPR_MAIN_LUA.tmp" "$HYPR_MAIN_LUA"
      log "removed require line from hyprland.lua"
    fi
  fi
}

do_uninstall() {
  log "Removing QUICKauto Hyprland blocks (managed only)..."
  for f in "$BINDINGS_LUA" "$AUTOSTART_LUA" "$WINDOWS_LUA" "$HYPR_CONF"; do
    strip_block "$f"
  done
  # windows.lua is ours alone: drop it if nothing but whitespace remains.
  if [ -f "$WINDOWS_LUA" ] && ! grep -q '[^[:space:]]' "$WINDOWS_LUA"; then
    if [ "$DRY_RUN" -eq 1 ]; then
      dry "rm $WINDOWS_LUA (only ever held our block)"
    else
      rm -f "$WINDOWS_LUA"
      log "removed empty $WINDOWS_LUA"
    fi
  fi
  remove_require_windows
  if [ "$DRY_RUN" -eq 0 ]; then
    hyprctl reload >/dev/null 2>&1 || true
    log "hyprctl reload done."
  else
    dry "hyprctl reload"
  fi
  log "Uninstall done."
}

check_autostart_conflict() {
  # The app's own "Start on login" (electron-store) plus exec-once would double-launch;
  # the single-instance lock prevents doubles, but warn so only one path owns it.
  local store="$HOME/.config/quickauto/config.json"
  if [ -f "$store" ] && grep -q '"openAtLogin"[[:space:]]*:[[:space:]]*true' "$store" 2>/dev/null; then
    log "WARN: app's own 'Start on login' is ON and Hyprland exec-once will also launch: the single-instance lock prevents doubles, but prefer one path (tray checkbox vs exec-once)."
  fi
}

main() {
  if [ "$UNINSTALL" -eq 1 ]; then do_uninstall; exit 0; fi

  command -v hyprctl >/dev/null 2>&1 || { log "FAIL: hyprctl not found"; exit 1; }
  command -v node >/dev/null 2>&1 || { log "FAIL: node not found"; exit 1; }

  local syntax
  syntax="$(detect_syntax)"
  log "Hyprland: $(hypr_version_string) | config syntax: $syntax | key: $KEY"

  local conflict
  conflict="$(key_conflict "$KEY")"
  if [ "$conflict" != "FREE" ]; then
    log "REFUSING: $KEY is already bound (${conflict#CONFLICT:}). Not overwriting."
    log "Free alternatives:"
    suggest_alternatives
    exit 1
  fi
  log "PASS: $KEY is free"

  local bind_line rules_line auto_line
  bind_line="$(node_eval hyprBindSnippet "$KEY" "$EXEC_CMD" "$syntax")"
  rules_line="$(node_eval hyprWindowRuleSnippet "$WM_CLASS" "$syntax")"
  auto_line="$(node_eval hyprAutostartSnippet "quickauto" "$syntax")"
  log "bind:    $bind_line"
  log "rules:   $rules_line"
  log "autostart: $auto_line"

  if ! confirm "Apply to ~/.config/hypr files (backups first)?"; then
    log "Aborted."
    exit 1
  fi

  if [ "$syntax" = "lua" ]; then
    backup "$BINDINGS_LUA"
    strip_block "$BINDINGS_LUA"
    append_block "$BINDINGS_LUA" "$bind_line"
    backup "$AUTOSTART_LUA"
    strip_block "$AUTOSTART_LUA"
    append_block "$AUTOSTART_LUA" "$auto_line"
    # rules_line matches packaged class (quickauto). The dev rule below scopes
    # by title so it only ever matches this app's palette (never other Electron apps).
    dev_rule='o.window({ class = "electron", title = "^(QUICKauto)$" }, { float = true, center = true, pin = true, stay_focused = true, border_size = 0, no_shadow = true })'
    backup "$WINDOWS_LUA"
    strip_block "$WINDOWS_LUA"
    append_block "$WINDOWS_LUA" "-- QUICKauto palette: floating, centered, pinned, stays focused.
$rules_line
$dev_rule"
    ensure_require_windows
  else
    backup "$HYPR_CONF"
    strip_block "$HYPR_CONF"
    # (conf syntax bind_line already includes the leading "bind = ...")
    append_block "$HYPR_CONF" "$bind_line
$rules_line
$auto_line"
  fi

  check_autostart_conflict

  if [ "$DRY_RUN" -eq 0 ]; then
    hyprctl reload
    sleep 1
    if [ "$(key_conflict "$KEY")" != "FREE" ]; then
      log "PASS: $KEY bind present after reload (hyprctl binds)."
    else
      log "FAIL: $KEY bind missing after reload. Run: hyprctl configerrors"
      exit 1
    fi
    if hyprctl configerrors 2>/dev/null | grep -qi "quickauto\|hypr\.\(bindings\|autostart\|windows\)"; then
      log "FAIL: Hyprland reports config errors:"
      hyprctl configerrors 2>/dev/null | head -n 10
      exit 1
    else
      log "PASS: no Hyprland config errors."
    fi
  else
    dry "hyprctl reload + verify"
  fi

  log ""
  log "Done. Press $KEY: palette appears floating + centered + focused."
  log "Esc or clicking elsewhere hides it. Uninstall: $0 --uninstall"
}

main
