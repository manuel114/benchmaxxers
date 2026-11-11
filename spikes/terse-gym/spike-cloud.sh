#!/usr/bin/env bash
# The same checks as spike.sh, against Terse Cloud. Run it after `terse auth login`.
# There's no process to kill in the cloud, so instead the actor is left alone
# past its 10 s idle timeout (it goes dormant) while a turn offer is pending,
# and the durable alarm has to wake it. The timings are the real numbers:
# every write goes to Terse's bucket storage before the call returns.
set -euo pipefail
cd "$(dirname "$0")"
GYM="gym-spike-$(date +%s)"

terse auth status >/dev/null 2>&1 || { echo "Not logged in. Run: terse auth login"; exit 1; }

cd actor
bun install --silent
# First run only: link this folder to a Terse project. This CLI version has no
# `attach`, so create the project with `terse init` in a scratch folder and keep
# just its terse.config.json.
if [ ! -f terse.config.json ]; then
  TMP=$(mktemp -d)
  (cd "$TMP" && terse init benchmaxxers-gym-spike --non-interactive)
  cp "$(find "$TMP" -name terse.config.json | head -1)" .
  rm -rf "$TMP"
fi
terse deploy
cd ..

# The generated client reads these. Put them in client/.env yourself (never commit it):
#   TERSE_ACTOR_URL=<the URL terse deploy printed>
#   TERSE_API_KEY=<a key from the Terse app, API keys in the sidebar>
[ -f client/.env ] || { echo "Create client/.env with TERSE_ACTOR_URL and TERSE_API_KEY (see above), then re-run."; exit 1; }
set -a; . client/.env; set +a
(cd client && terse actor generate --non-interactive)

echo "== $GYM on Terse Cloud: Ada lifts, Bo and Cy queue"
node client/run.ts setup "$GYM"
echo "== hand the turn to Bo (4 s hold)"
node client/run.ts after-crash "$GYM"
echo "== nobody calls for 15 s: the actor goes dormant, the alarm must wake it"
sleep 15
node client/run.ts after-alarm "$GYM"
echo "== relay socket"
node client/run.ts socket "$GYM"
echo "== timings"
node client/run.ts bench "$GYM"
