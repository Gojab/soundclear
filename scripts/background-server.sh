#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${SOUNDCLEAR_PID_FILE:-/tmp/soundclear-server.pid}"
LOG_FILE="${SOUNDCLEAR_LOG_FILE:-/tmp/soundclear-server.log}"
CMD="${1:-status}"

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

start_daemon() {
  if is_running; then
    echo "SoundClear background server already running (PID $(cat "$PID_FILE"))."
    return 0
  fi
  cd "$ROOT_DIR"
  export SOUNDCLEAR_BACKGROUND=1
  export DISABLE_HMR=true
  nohup npx tsx server.ts >>"$LOG_FILE" 2>&1 </dev/null &
  local pid=$!
  echo "$pid" >"$PID_FILE"
  disown "$pid" 2>/dev/null || true
  echo "SoundClear background server started (PID $pid, log: $LOG_FILE)."
}

stop_daemon() {
  if ! [[ -f "$PID_FILE" ]]; then
    echo "SoundClear background server is not running."
    return 0
  fi
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    for _ in {1..15}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$PID_FILE"
  echo "SoundClear background server stopped."
}

status_daemon() {
  if is_running; then
    echo "SoundClear background server RUNNING (PID $(cat "$PID_FILE"))."
  else
    echo "SoundClear background server STOPPED."
  fi
}

case "$CMD" in
  start)
    start_daemon
    ;;
  stop)
    stop_daemon
    ;;
  restart)
    stop_daemon
    start_daemon
    ;;
  status)
    status_daemon
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}" >&2
    exit 1
    ;;
esac
