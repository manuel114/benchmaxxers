#!/usr/bin/env bash
# Runs the Terse gym spike end to end on a local actor server:
# crash (SIGKILL) mid-visit, check state survived, crash again with a turn
# offer pending, check the durable alarm still moved the line, then time calls.
# Needs Bun >= 1.4.2 (actor side) and Node 24 (client side, like apps/server).
set -euo pipefail
cd "$(dirname "$0")"

LOG=$(mktemp)
GYM="gym-spike-$(date +%s)"

# Starts the local actor server and waits until it's ready.
start() {
  (cd actor && nohup bunx durable-actors dev >"$LOG" 2>&1 &)
  for _ in $(seq 1 60); do grep -q "Ready" "$LOG" 2>/dev/null && return; sleep 0.5; done
  echo "actor server did not start"; cat "$LOG"; exit 1
}

# Kills the actor server the hard way, like a crash or a redeploy that doesn't wait.
crash() {
  pkill -9 -f "durable-actors dev" || true
  sleep 1
  : >"$LOG"
}

trap 'pkill -f "durable-actors dev" || true' EXIT

(cd actor && bun install --silent)
crash
start
(cd client && DURABLE_ACTORS_CONTROL_PLANE_URL=http://127.0.0.1:7100 bunx --bun durable-actors generate >/dev/null)

echo "== $GYM: Ada lifts, Bo and Cy queue"
node client/run.ts setup "$GYM"
echo "== crash + restart"; crash; start
node client/run.ts after-crash "$GYM"
echo "== crash with Bo's turn pending, restart, then nobody calls for 7 s"; crash; start
sleep 7
node client/run.ts after-alarm "$GYM"
echo "== relay socket"
node client/run.ts socket "$GYM"
echo "== timings"
node client/run.ts bench "$GYM"
