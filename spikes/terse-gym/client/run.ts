/**
 * Drives the Gym actor from Node (the same runtime as apps/server), one phase
 * per run, so spike.sh can kill and restart the actor server between phases.
 *
 *   node run.ts <phase> <gymId>
 */
import { actors } from "./generated/index.js"

const [phase, gymId = "gym-spike"] = process.argv.slice(2)
const gym = actors.Gym.get(gymId)

/** Fails the run with a message when a check doesn't hold. */
const expect = (ok: boolean, what: string, got?: unknown): void => {
    if (!ok) {
        console.error(`FAIL ${what}${got === undefined ? "" : `: got ${JSON.stringify(got)}`}`)
        process.exit(1)
    }
    console.log(`ok   ${what}`)
}

/** The bench-1 machine from a snapshot. */
const bench = async () => (await gym.snapshot()).machines.find((m) => m.id === "bench-1")!

/** Milliseconds at a percentile of a sorted list. */
const pct = (sorted: number[], p: number): string => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!.toFixed(1)

/** Times `n` calls of `fn` and prints p50/p95/p99. */
const time = async (label: string, n: number, fn: (i: number) => Promise<unknown>): Promise<void> => {
    const ms: number[] = []
    for (let i = 0; i < n; i++) {
        const t = performance.now()
        await fn(i)
        ms.push(performance.now() - t)
    }
    ms.sort((a, b) => a - b)
    console.log(`time ${label}: p50 ${pct(ms, 50)} ms, p95 ${pct(ms, 95)} ms, p99 ${pct(ms, 99)} ms (n=${n})`)
}

switch (phase) {
    case "setup": {
        // Ada lifts, Bo and Cy queue behind her.
        await gym.configure({ offerMs: 4000 })
        for (const [id, name] of [["ada", "Ada"], ["bo", "Bo"], ["cy", "Cy"]] as const) await gym.enter(id, name)
        expect((await gym.waitForTurn("ada", "bench-1")).status === "your_turn", "Ada gets bench-1")
        expect((await gym.startSet("ada", "bench-1")).ok, "Ada starts a set")
        expect((await gym.waitForTurn("bo", "bench-1")).place === 1, "Bo is 1st in line")
        expect((await gym.waitForTurn("cy", "bench-1")).place === 2, "Cy is 2nd in line")
        break
    }
    case "after-crash": {
        // The server was killed with SIGKILL and started again. Is the gym as we left it?
        const s = await gym.snapshot()
        expect(s.agents.length === 3, "all 3 agents still in the gym", s.agents.length)
        const m = await bench()
        expect(m.occupant === "ada", "Ada still on bench-1", m.occupant)
        expect(JSON.stringify(m.line) === '["bo","cy"]', "line still Bo, Cy", m.line)
        // Ada finishes; Bo is offered the turn with a 4 s hold that nobody will take.
        await gym.finishSet("ada", "bench-1")
        const after = await bench()
        expect(after.offer?.agentId === "bo", "Bo is offered bench-1", after.offer)
        expect((await gym.snapshot()).alarmAt === after.offer!.expiresAt, "alarm set for the offer's expiry")
        break
    }
    case "after-alarm": {
        // The server was killed again while Bo's offer was pending, restarted, and left alone.
        const s = await gym.snapshot()
        const m = await bench()
        // Bo's 4 s hold expired, the alarm passed the turn to Cy and re-armed; if Cy's 4 s ran out
        // too before we looked, the alarm fired a second time and the machine is simply free.
        expect(s.expiredOffers >= 1, `the alarm fired on its own after the crash (${s.expiredOffers}x)`, s.expiredOffers)
        expect(m.offer?.agentId !== "bo", "Bo no longer holds bench-1", m.offer)
        expect(s.expiredOffers === 1 ? m.offer?.agentId === "cy" : m.offer === null, "the turn moved on to Cy (then lapsed if unused)", { offer: m.offer, expired: s.expiredOffers })
        expect(m.line.length === 0, "line is now empty", m.line)
        break
    }
    case "socket": {
        // Our server would hold one backend socket per gym and relay to every viewer.
        // prepareWebsocket hands out a URL (a credential); Node 24's built-in WebSocket opens it.
        const grant = await actors.Gym.prepareWebsocket({ actorId: gymId, metadata: { viewer: "relay" } })
        const conn = new WebSocket(grant.websocketUrl)
        await new Promise<void>((resolve, reject) => { conn.onopen = () => resolve(); conn.onerror = () => reject(new Error("socket failed")) })
        const got = new Promise<number>((resolve) => {
            const t = performance.now()
            conn.onmessage = (e) => {
                const d = JSON.parse(String(e.data)) as { type?: string }
                if (d.type === "entered") resolve(performance.now() - t)
            }
            void gym.enter("dee", "Dee")
        })
        const ms = await Promise.race([got, new Promise<number>((r) => setTimeout(() => r(-1), 5000))])
        expect(ms >= 0, `relay socket heard Dee walk in (${ms.toFixed(1)} ms after the call)`)
        conn.close()
        break
    }
    case "bench": {
        // Rough cost of a call. Locally this is disk, not Terse Cloud's bucket, so it's a floor.
        await gym.enter("eve", "Eve")
        await time("read  (snapshot)", 200, () => gym.snapshot())
        await time("write (one field, one call)", 200, () => gym.configure({ offerMs: 4000 }))
        await time("enter (persist + broadcast)", 100, (i) => gym.enter(`p${i}`, "P"))
        await time("waitForTurn (persist + broadcast)", 100, (i) => gym.waitForTurn(`p${i}`, "mat-2"))
        await time("leave (persist + broadcast)", 100, (i) => gym.leave(`p${i}`))
        for (let i = 0; i < 100; i++) await gym.enter(`q${i}`, "Q")
        await time("leave, not in any line (no alarm change)", 100, (i) => gym.leave(`q${i}`))
        await time("write (join + leave a line)", 200, (i) => (i % 2 ? gym.leave("zed") : gym.enter("zed", "Zed").then(() => gym.waitForTurn("zed", "mat-1"))))
        break
    }
    default:
        console.error("phases: setup | after-crash | after-alarm | socket | bench")
        process.exit(2)
}
process.exit(0)
