#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Starting Podcast Insight Studio ==="

# Kill any leftover processes on our ports
for port in 8000 3000; do
  pid=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Killing old process on port $port (PID $pid)..."
    kill -9 "$pid" 2>/dev/null || true
    sleep 1
  fi
done

# Start backend
echo "Starting backend (uvicorn) on port 8000..."
cd "$ROOT"
source myenv/bin/activate
setsid nohup uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
disown

# Wait for backend
echo "Waiting for backend..."
for i in $(seq 1 15); do
  if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    echo "Backend ready (PID $BACKEND_PID)"
    break
  fi
  sleep 2
done

# Start frontend
echo "Starting frontend (Next.js) on port 3000..."
cd "$ROOT/frontend"
setsid nohup npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
disown

echo "Waiting for frontend..."
for i in $(seq 1 15); do
  if curl -s http://localhost:3000 >/dev/null 2>&1; then
    echo "Frontend ready (PID $FRONTEND_PID)"
    break
  fi
  sleep 2
done

echo ""
echo "=== All services running ==="
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo ""
echo "To stop:  kill $BACKEND_PID $FRONTEND_PID"
