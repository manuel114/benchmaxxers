# Spike: a gym as a Terse durable actor

Question from the launch thread: can the gym survive a redeploy? Today it can't. Who's in, the lines and the held turns live in the server's memory (see [`docs/HOSTING.md`](../../docs/HOSTING.md) › Redeploys). This spike puts that queue state in a [durable actor](https://docs.useterse.ai/concepts) (Terse's open-source `durable-actors` runtime) and crashes the server under it.

It is a spike: `actor/src/actors.ts` holds only the queue core (agents in the gym, machine occupants, lines, turn offers that expire on the actor's alarm). Scoring, stats and passes stay in `apps/server`. Nothing in `apps/` depends on it.

## Run it

Needs Bun 1.4.2 or later (actor side) and Node 24 (client side, like `apps/server`).

```bash
spikes/terse-gym/spike.sh          # local, no account needed
spikes/terse-gym/spike-cloud.sh    # Terse Cloud, after `terse auth login` (see below)
```

`spike.sh` starts a local actor server, sets up a gym (Ada lifting on bench-1, Bo and Cy in line), kills the server with `SIGKILL`, restarts it, and checks:

1. The gym is exactly as it was: 3 agents, Ada on bench-1, Bo then Cy in line.
2. Ada finishes. Bo is offered the turn with a 4 s hold and the alarm is set for its expiry.
3. The server is killed **again** while Bo's turn is pending, restarted, and left alone for 7 s. The alarm fires by itself, Bo's unused turn passes to Cy, and it keeps re-arming.
4. A backend WebSocket (what our server would hold, one per gym, to relay to viewers) hears events.
5. Timings.

## Results (local, 11 Nov 2026)

All checks pass.

| Call | p50 | p95 |
| --- | --- | --- |
| Read (snapshot) | 3.8 ms | 7 ms |
| Write one field | 2.9 ms | 5 ms |
| Enter (write + broadcast) | 5 ms | 7 ms |
| Leave, no turn changes | 5 ms | 6 ms |
| Anything that reads or sets the **alarm** | ~50 ms | ~55 ms |
| Relay socket hears an event | ~15 ms after the call | |

These are local numbers (the dev server writes to disk). Terse Cloud writes each change to bucket storage before the call returns, so its numbers are higher.

## Results (Terse Cloud, 11 Nov 2026)

All checks pass, including the one with no local equivalent: with Bo's turn pending, nobody called the
actor for 15 s, so it went dormant past its 10 s idle timeout. **The alarm woke it by itself**, passed
Bo's unused turn to Cy and re-armed. Nothing was lost.

Measured from a laptop in London against the deployed actor, so each number includes one round trip to
Terse (`api.useterse.ai`).

| Call | p50 | p95 |
| --- | --- | --- |
| Read (snapshot) | 34 ms | 47 ms |
| Write one field | 33 ms | 45 ms |
| Enter (write + broadcast) | 36 ms | 39 ms |
| Leave, no turn changes | 35 ms | 42 ms |
| Anything that reads or sets the **alarm** | 71 ms | 107 ms |
| Relay socket hears an event | ~220 ms after the call | |

About 33 ms of every call is the round trip and the durable write, and that floor is the same whether the
call reads or writes. A gym visit is a handful of calls a minute per agent, so 33 ms is nothing against a
45 s rest; the one to watch is the treadmill, where an agent answers quickly against a clock.

## What we learned

- **Durability works.** Two `SIGKILL`s mid-visit lost nothing, and the alarm fired after a crash with no caller.
- **The generated client runs on Node 24.** Plain JS, no Bun APIs, no packages. Only the actor and the CLI need Bun.
- **Viewers: relay, don't connect.** Terse's docs say "ideally, each actor should have only a few people connected to it". Our server opens one socket per gym (`prepareWebsocket` + Node's built-in `WebSocket`) and fans out to viewers as it does today.
- **`wait_for_turn` must not hold the call.** An actor runs one call at a time, so a held wait freezes the gym. Here it returns at once (`your_turn` / `waiting` + place) and the waiting would stay in our MCP server.
- **The alarm is slow to touch.** Reading or setting it costs ~45 ms locally against ~3 ms for a field (it's stored outside the actor). Cache it in an `@Ephemeral` field and only write it when the time changes. Even so, every turn hand-off sets it once. In the cloud the gap is smaller in proportion but still there: +38 ms on top of a 33 ms call, so about double.
- **The relay socket is slower than the call that caused the event.** An event reached the backend socket ~220 ms after the call returned in the cloud, against ~10 ms locally. Viewers see the gym a fraction of a second behind, which is fine for watching but means the socket is not the way to confirm a write.
- **Write state by reassignment.** `@Persisted` saves on assignment, so objects are replaced, never mutated (`#put` in the actor).

## Terse Cloud

Hosted Terse is pay-as-you-go: [$0.00001971 per CPU-second and $0.00000667 per GiB-second](https://www.useterse.ai/pricing), so a standard actor (0.25 CPU, 256 MiB) is about $0.024 an hour awake. It goes dormant after 10 s idle. Its packages (`terse-sdk`, `terse-cli`) are source-available (Sustainable Use License); the runtime this spike uses locally (`durable-actors`) is MIT. `terse-sdk/actor` re-exports `durable-actors`, so the same actor deploys.

To run `spike-cloud.sh`:

1. `bunx terse-cli@latest install`, then `terse auth login` (opens a browser).
2. Run `spikes/terse-gym/spike-cloud.sh`. The first time, it creates a Terse project (`terse init` in a scratch folder, keeping its `terse.config.json` in `actor/`), deploys, then stops and asks for `client/.env`.
3. Create `spikes/terse-gym/client/.env` (gitignored) with `TERSE_ACTOR_URL` (printed by `terse deploy`) and `TERSE_API_KEY` (Terse app › API keys). Run the script again.

`terse deploy` needs the actor to import from `terse-sdk/actor` rather than `durable-actors` directly, and
`terse-sdk` to be a dependency of `actor/`. It re-exports the same API, so local `spike.sh` runs unchanged
on the same file.

`actor/terse.config.json` is gitignored: it names one Terse project, so each person's first run makes
their own rather than deploying into someone else's.

## Still to ask Terse

- Whether there's a free allowance (their billing code has a `free` plan with monthly credits; the pricing page doesn't mention it).
- Whether one backend socket per actor, relaying to many viewers, is the intended pattern.
- Why touching the alarm costs extra at all (~15× a field write locally, ~2× in the cloud), and whether an actor that re-arms its alarm every few seconds is an expected shape.

Answered by the cloud run: write latency is ~33 ms p50 and an alarm write ~71 ms p50 (see the table
above), and a dormant actor is woken by its own alarm with no caller.
