/**
 * Spike: one Benchmaxxers gym as a durable actor.
 *
 * Holds the part of a gym that a restart currently wipes out: who is in,
 * who is on which machine, who is waiting in which line, and whose turn is
 * being held for them. Turn offers expire on the actor's durable alarm, so
 * the queue keeps moving even across a crash. Scoring, stats and passes stay
 * in the real server; this only proves the queue can live here.
 *
 * Unlike apps/server's World, `waitForTurn` never holds the call open: it
 * answers at once and the caller (our MCP server) does the waiting, because
 * an actor runs one call at a time and a held call would freeze the gym.
 */
import { Actor, Ephemeral, Persisted } from "terse-sdk/actor"

/** A turn held for the next person in line, until it expires. */
type Offer = { agentId: string; expiresAt: number }

/** One machine's queue state. */
type Machine = { id: string; occupant: string | null; line: string[]; offer: Offer | null }

/** One agent in the gym. */
type Agent = { id: string; name: string; enteredAt: number }

/** What viewers (and our server's relay socket) hear about. */
export type GymEvent =
    | { type: "entered"; agentId: string; name: string }
    | { type: "left"; agentId: string }
    | { type: "machine"; machine: Machine }

/** Machine ids, matching MACHINE_LAYOUT in packages/shared/src/rules.ts. */
const MACHINE_IDS = ["bench-1", "bench-2", "treadmill-1", "treadmill-2", "treadmill-3", "mat-1", "mat-2", "mat-3", "mat-4"]

/** Longest line per machine, as LIMITS.lineMax in the real rules. */
const LINE_MAX = 4

export class Gym extends Actor<{ viewer: string }, never, GymEvent> {
    @Persisted agents: Record<string, Agent> = {}
    @Persisted machines: Record<string, Machine> = Object.fromEntries(MACHINE_IDS.map((id) => [id, { id, occupant: null, line: [], offer: null }]))
    /** How long a turn is held, in ms. The real gym uses 20 s; tests shorten it. */
    @Persisted offerMs = 20_000
    /** How many offers expired on the alarm, to prove it fired. */
    @Persisted expiredOffers = 0
    /** The alarm time as last read or set while awake. Reading the real alarm costs ~45 ms locally. */
    @Ephemeral alarmCache: number | null | undefined = undefined

    /** Sets how long turns are held. For tests. */
    async configure(options: { offerMs: number }): Promise<void> {
        this.offerMs = options.offerMs
    }

    /** Checks an agent in. */
    async enter(agentId: string, name: string): Promise<{ agents: number }> {
        if (!this.agents[agentId]) {
            this.agents = { ...this.agents, [agentId]: { id: agentId, name, enteredAt: Date.now() } }
            this.broadcast({ type: "entered", agentId, name })
        }
        return { agents: Object.keys(this.agents).length }
    }

    /** Checks an agent out, freeing anything it held. */
    async leave(agentId: string): Promise<void> {
        for (const m of Object.values(this.machines)) {
            if (m.occupant === agentId || m.offer?.agentId === agentId || m.line.includes(agentId)) {
                this.#put({ ...m, occupant: m.occupant === agentId ? null : m.occupant, offer: m.offer?.agentId === agentId ? null : m.offer, line: m.line.filter((x) => x !== agentId) })
                this.#advance(m.id)
            }
        }
        const { [agentId]: _gone, ...rest } = this.agents
        this.agents = rest
        this.broadcast({ type: "left", agentId })
        this.#schedule()
    }

    /** Joins a machine's line, or takes the turn straight away if it's free. Never waits. */
    async waitForTurn(agentId: string, machineId: string): Promise<{ status: "your_turn" | "waiting" | "line_full"; place?: number; expiresAt?: number }> {
        this.#need(agentId)
        const m = this.#machine(machineId)
        if (m.occupant === agentId || m.offer?.agentId === agentId) return { status: "your_turn", expiresAt: m.offer?.expiresAt }
        if (!m.occupant && !m.offer && m.line.length === 0) {
            const offer = { agentId, expiresAt: Date.now() + this.offerMs }
            this.#put({ ...m, offer })
            this.#schedule()
            return { status: "your_turn", expiresAt: offer.expiresAt }
        }
        if (!m.line.includes(agentId)) {
            if (m.line.length >= LINE_MAX) return { status: "line_full" }
            this.#put({ ...m, line: [...m.line, agentId] })
        }
        return { status: "waiting", place: this.#machine(machineId).line.indexOf(agentId) + 1 }
    }

    /** Takes a turn that was offered (or a free machine) and starts lifting. */
    async startSet(agentId: string, machineId: string): Promise<{ ok: boolean; reason?: string }> {
        this.#need(agentId)
        const m = this.#machine(machineId)
        if (m.occupant === agentId) return { ok: true }
        const free = !m.occupant && !m.offer && m.line.length === 0
        if (m.offer?.agentId !== agentId && !free) return { ok: false, reason: "not your turn" }
        this.#put({ ...m, occupant: agentId, offer: null, line: m.line.filter((x) => x !== agentId) })
        this.#schedule()
        return { ok: true }
    }

    /** Steps off a machine and offers it to the next in line. */
    async finishSet(agentId: string, machineId: string): Promise<void> {
        const m = this.#machine(machineId)
        if (m.occupant !== agentId) return
        this.#put({ ...m, occupant: null })
        this.#advance(machineId)
        this.#schedule()
    }

    /** Everything, for checks and for a viewer's first frame. */
    async snapshot(): Promise<{ agents: Agent[]; machines: Machine[]; expiredOffers: number; alarmAt: number | null }> {
        return { agents: Object.values(this.agents), machines: Object.values(this.machines), expiredOffers: this.expiredOffers, alarmAt: this.alarm.get() }
    }

    /** Expires turns nobody took, hands them to the next in line, and sets the next alarm. */
    async onAlarm(): Promise<void> {
        const now = Date.now()
        for (const m of Object.values(this.machines)) {
            if (m.offer && m.offer.expiresAt <= now) {
                this.expiredOffers += 1
                this.#put({ ...m, offer: null })
                this.#advance(m.id)
            }
        }
        this.#schedule()
    }

    /** Offers a free machine to the first in line. */
    #advance(machineId: string): void {
        const m = this.#machine(machineId)
        if (m.occupant || m.offer || m.line.length === 0) return
        const [next, ...rest] = m.line
        this.#put({ ...m, line: rest, offer: { agentId: next!, expiresAt: Date.now() + this.offerMs } })
    }

    /**
     * Points the alarm at the earliest pending offer expiry, or clears it. Reading
     * or writing the alarm costs ~45 ms locally (it lives outside the actor) against
     * ~3 ms for a field, so it's read once per wake-up and only written on a change.
     */
    #schedule(): void {
        const times = Object.values(this.machines).flatMap((m) => (m.offer ? [m.offer.expiresAt] : []))
        const next = times.length ? Math.min(...times) : null
        if (this.alarmCache === undefined) this.alarmCache = this.alarm.get()
        if (next === this.alarmCache) return
        if (next === null) this.alarm.delete()
        else this.alarm.set(next)
        this.alarmCache = next
    }

    /** Saves one machine (reassigning so @Persisted notices) and tells listeners. */
    #put(m: Machine): void {
        this.machines = { ...this.machines, [m.id]: m }
        this.broadcast({ type: "machine", machine: m })
    }

    /** A machine by id, or an error. */
    #machine(id: string): Machine {
        const m = this.machines[id]
        if (!m) throw new Error(`No machine called ${id}`)
        return m
    }

    /** Throws unless the agent is in the gym. */
    #need(agentId: string): void {
        if (!this.agents[agentId]) throw new Error("Not in the gym. Call enter first.")
    }
}
