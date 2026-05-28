#!/usr/bin/env bash
# Health-check supervisor for Podcast Insight Studio
# Runs as a daemon, checks both services every 30s, restarts if dead.
#
# Usage:
#   ./supervise.sh              # start supervisor (daemonized)
#   ./supervise.sh status       # check status of supervised services
#   ./supervise.sh stop         # stop the supervisor + services
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
SUPERVISE_LOG="/tmp/supervise.log"
SUPERVISE_PID_FILE="/tmp/supervise.pid"
HEARTBEAT_FILE="/tmp/supervise.heartbeat"

mkdir -p "$(dirname "$SUPERVISE_LOG")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$SUPERVISE_LOG"
}

check_backend() {
  curl -sf http://localhost:8000/health >/dev/null 2>&1
}

check_frontend() {
  curl -sf -o /dev/null http://localhost:3000 2>&1
}

start_services() {
  log "Starting services..."
  if bash "$ROOT/start.sh" >> "$SUPERVISE_LOG" 2>&1; then
    log "Services started"
  else
    log "start.sh failed — services may be down"
  fi
}

stop_services() {
  log "Stopping services..."
  for port in 8000 3000; do
    pid=$(lsof -ti:"$port" 2>/dev/null || true)
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      log "Killed PID $pid on port $port"
    fi
  done
  log "Services stopped"
}

supervise_loop() {
  log "Supervisor started (PID $$)"
  echo $$ > "$SUPERVISE_PID_FILE"
  date +%s > "$HEARTBEAT_FILE"

  start_services

  BACKEND_FAILS=0
  FRONTEND_FAILS=0
  MAX_FAILS=2  # Restart after 2 consecutive failures (~60s downtime)

  while true; do
    sleep 30
    date +%s > "$HEARTBEAT_FILE"

    BACKEND_OK=false
    FRONTEND_OK=false

    if check_backend; then
      BACKEND_OK=true
      BACKEND_FAILS=0
    else
      BACKEND_FAILS=$((BACKEND_FAILS + 1))
      log "Backend health check failed ($BACKEND_FAILS/$MAX_FAILS)"
    fi

    if check_frontend; then
      FRONTEND_OK=true
      FRONTEND_FAILS=0
    else
      FRONTEND_FAILS=$((FRONTEND_FAILS + 1))
      log "Frontend health check failed ($FRONTEND_FAILS/$MAX_FAILS)"
    fi

    if [ "$BACKEND_OK" = true ] && [ "$FRONTEND_OK" = true ]; then
      continue
    fi

    if [ "$BACKEND_FAILS" -ge "$MAX_FAILS" ] || [ "$FRONTEND_FAILS" -ge "$MAX_FAILS" ]; then
      log "Max failures reached — restarting all services"
      stop_services
      sleep 2
      start_services
      BACKEND_FAILS=0
      FRONTEND_FAILS=0
    fi
  done
}

case "${1:-}" in
  status)
    if [ -f "$SUPERVISE_PID_FILE" ] && kill -0 "$(cat "$SUPERVISE_PID_FILE")" 2>/dev/null; then
      echo "Supervisor is running (PID $(cat "$SUPERVISE_PID_FILE"))"
      if check_backend; then
        echo "  Backend:  OK (http://localhost:8000)"
      else
        echo "  Backend:  DOWN"
      fi
      if check_frontend; then
        echo "  Frontend: OK (http://localhost:3000)"
      else
        echo "  Frontend: DOWN"
      fi
      tail -3 "$SUPERVISE_LOG" 2>/dev/null || true
    else
      echo "Supervisor is NOT running"
      echo "Last log entries:"
      tail -5 "$SUPERVISE_LOG" 2>/dev/null || echo "  (no log)"
    fi
    ;;
  stop)
    if [ -f "$SUPERVISE_PID_FILE" ]; then
      SPID=$(cat "$SUPERVISE_PID_FILE")
      stop_services
      kill "$SPID" 2>/dev/null || true
      rm -f "$SUPERVISE_PID_FILE"
      log "Supervisor stopped"
      echo "Supervisor stopped"
    else
      echo "Supervisor not running — stopping services directly"
      stop_services
    fi
    ;;
  start|"")
    if [ -f "$SUPERVISE_PID_FILE" ] && kill -0 "$(cat "$SUPERVISE_PID_FILE")" 2>/dev/null; then
      echo "Supervisor already running (PID $(cat "$SUPERVISE_PID_FILE"))"
      exit 0
    fi
    nohup bash "$0" --inner-loop >> "$SUPERVISE_LOG" 2>&1 &
    echo "Supervisor started (PID $!)"
    echo "  Log: $SUPERVISE_LOG"
    echo "  Status: $0 status"
    echo "  Stop:  $0 stop"
    ;;
  --inner-loop)
    supervise_loop
    ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
