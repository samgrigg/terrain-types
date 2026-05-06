#!/usr/bin/env bash
# Local brainstorm visual companion — survives Cursor/agent shells and avoids owner-PID shutdown.
# Usage: ./scripts/start-brainstorm-companion.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

discover_brainstorm_scripts() {
  local candidates=(
    "${BRAINSTORM_SCRIPTS:-}"
    "$HOME/.cursor/plugins/cache/cursor-public/superpowers/b7a8f76985f1e93e75dd2f2a3b424dc731bd9d37/skills/brainstorming/scripts"
  )
  local d
  for d in "${candidates[@]}"; do
    if [[ -n "$d" && -f "$d/server.cjs" ]]; then
      printf '%s' "$d"
      return 0
    fi
  done
  # Fallback: first match under ~/.cursor/plugins
  local found
  found="$(find "$HOME/.cursor/plugins" -path '*/skills/brainstorming/scripts/server.cjs' 2>/dev/null | head -1)"
  if [[ -n "$found" ]]; then
    printf '%s' "$(dirname "$found")"
    return 0
  fi
  return 1
}

SCRIPT_DIR="$(discover_brainstorm_scripts)" || {
  echo '{"error":"Could not find brainstorming scripts (server.cjs). Set BRAINSTORM_SCRIPTS to the folder containing server.cjs."}'
  exit 1
}

SESSION_ID="$$-$(date +%s)"
SESSION_DIR="${ROOT}/.superpowers/brainstorm/${SESSION_ID}"
STATE_DIR="${SESSION_DIR}/state"
CONTENT_DIR="${SESSION_DIR}/content"
PID_FILE="${STATE_DIR}/server.pid"
LOG_FILE="${STATE_DIR}/server.log"

mkdir -p "$CONTENT_DIR" "$STATE_DIR"

# Reduce EMFILE from fs.watch on busy dev machines
ulimit -n 10240 2>/dev/null || ulimit -n 8192 2>/dev/null || true

cd "$SCRIPT_DIR"

# Do NOT set BRAINSTORM_OWNER_PID — the superpowers default ties the server to a parent that
# exits when agent/bash wrappers finish, which stops the HTTP server within ~60s.

nohup env BRAINSTORM_DIR="$SESSION_DIR" BRAINSTORM_HOST="127.0.0.1" BRAINSTORM_URL_HOST="localhost" \
  node server.cjs >>"$LOG_FILE" 2>&1 &
SERVER_PID=$!
disown "$SERVER_PID" 2>/dev/null || true
echo "$SERVER_PID" >"$PID_FILE"

for _ in {1..50}; do
  if [[ -f "${STATE_DIR}/server-info" ]] && grep -q "server-started" "${STATE_DIR}/server-info" 2>/dev/null; then
    head -1 "${STATE_DIR}/server-info"
    exit 0
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo '{"error":"Server exited before ready; see state/server.log in the session dir under .superpowers/brainstorm/"}'
    tail -20 "$LOG_FILE" >&2 || true
    exit 1
  fi
  sleep 0.1
done

echo '{"error":"Server failed to start within 5 seconds"}'
exit 1
