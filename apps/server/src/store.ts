import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { appearanceFromSeed, parseAppearancePatch, leagueForModel, type Appearance, type AppearancePatch, type MachineKind, type StatName, type Weight } from '@benchmaxxers/shared';

/** A saved agent. */
export type AgentRecord = {
  id: string;
  ownerId: string;
  name: string;
  model: string;
  league: 'large' | 'medium' | 'small';
  appearance: Appearance;
  points: Record<StatName, number>;
  streak: number;
  lastWorkoutDay: string | null;
  createdAt: number;
};

/** A saved set. */
export type SetRecord = {
  visitId: string; agentId: string; machine: MachineKind; weight: Weight;
  reps: number; maxReps: number; form: number; points: number; lift: number; dropped: boolean;
  startedAt: number; finishedAt: number;
};

/** Short random id with a type prefix, e.g. `agt_k3j2...`. */
export const newId = (prefix: string): string => `${prefix}_${randomBytes(10).toString('base64url')}`;

/** Row shape coming back from SQLite. */
type Row = Record<string, unknown>;

/** Maps an agents row to a record. */
const toAgent = (r: Row): AgentRecord => ({
  id: r.id as string,
  ownerId: r.owner_id as string,
  name: r.name as string,
  model: r.model as string,
  league: r.league as AgentRecord['league'],
  appearance: {
    ...appearanceFromSeed(r.id as string),
    // Looks saved before clothing choices retain their original T-shirt/shorts.
    topStyle: 'tshirt', bottomsStyle: 'shorts',
    ...(r.appearance_json ? parseAppearancePatch(JSON.parse(r.appearance_json as string)) : {}),
  },
  points: { strength: r.strength_points as number, stamina: r.stamina_points as number, flexibility: r.flexibility_points as number },
  streak: r.streak as number,
  lastWorkoutDay: (r.last_workout_day as string | null) ?? null,
  createdAt: r.created_at as number,
});

/** Everything the game saves. Passing ':memory:' gives a throwaway database for tests. */
export const openStore = (path: string) => {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS owners (
      id TEXT PRIMARY KEY,
      github_login TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      model TEXT NOT NULL,
      league TEXT NOT NULL,
      pass_hash TEXT NOT NULL UNIQUE,
      appearance_json TEXT,
      strength_points REAL NOT NULL DEFAULT 0,
      stamina_points REAL NOT NULL DEFAULT 0,
      flexibility_points REAL NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      last_workout_day TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      gym_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      end_reason TEXT,
      counted INTEGER NOT NULL,
      tool_calls INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS visits_agent_started ON visits(agent_id, started_at);
    CREATE TABLE IF NOT EXISTS sets (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      machine TEXT NOT NULL,
      weight TEXT NOT NULL,
      reps INTEGER NOT NULL,
      max_reps INTEGER NOT NULL,
      form REAL NOT NULL,
      points INTEGER NOT NULL,
      lift INTEGER NOT NULL,
      dropped INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sets_agent_machine ON sets(agent_id, machine);
    CREATE TABLE IF NOT EXISTS encounters (
      agent_a TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      agent_b TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      times INTEGER NOT NULL DEFAULT 0,
      last_note TEXT NOT NULL,
      last_at INTEGER NOT NULL,
      PRIMARY KEY (agent_a, agent_b)
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notes_created ON notes(created_at);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS signups (
      ip_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS signups_ip_created ON signups(ip_key, created_at);
    CREATE INDEX IF NOT EXISTS signups_created ON signups(created_at);
  `);

  // Upgrade older databases, then save defaults once so future catalog additions
  // cannot change the appearance of an existing agent.
  const columns = db.prepare('PRAGMA table_info(agents)').all();
  if (!columns.some((c) => c.name === 'appearance_json')) db.exec('ALTER TABLE agents ADD COLUMN appearance_json TEXT');
  const legacyAgents = db.prepare('SELECT id FROM agents WHERE appearance_json IS NULL').all();
  if (legacyAgents.length) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const save = db.prepare('UPDATE agents SET appearance_json = ? WHERE id = ? AND appearance_json IS NULL');
      for (const row of legacyAgents) {
        const id = row.id as string;
        save.run(JSON.stringify(appearanceFromSeed(id)), id);
      }
      db.exec('COMMIT');
    } catch (err) { db.exec('ROLLBACK'); db.close(); throw err; }
  }

  return {
    /** Finds or creates the owner for a GitHub login. */
    ensureOwner: (githubLogin: string, now: number): string => {
      const found = db.prepare('SELECT id FROM owners WHERE github_login = ?').get(githubLogin) as Row | undefined;
      if (found) return found.id as string;
      const id = newId('own');
      db.prepare('INSERT INTO owners (id, github_login, created_at) VALUES (?, ?, ?)').run(id, githubLogin, now);
      return id;
    },

    /** Saves a new agent with its hashed pass. */
    createAgent: (o: { ownerId: string; name: string; model: string; passHash: string; now: number; appearance?: AppearancePatch }): AgentRecord => {
      const id = newId('agt');
      const appearance = { ...appearanceFromSeed(id), ...(o.appearance ? parseAppearancePatch(o.appearance) : {}) };
      db.prepare('INSERT INTO agents (id, owner_id, name, model, league, pass_hash, appearance_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, o.ownerId, o.name, o.model, leagueForModel(o.model), o.passHash, JSON.stringify(appearance), o.now);
      return toAgent(db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Row);
    },

    /** Patches only cosmetics, preserving all omitted choices and gameplay state. */
    updateAppearance: (agentId: string, patch: AppearancePatch): AgentRecord | null => {
      const changes = parseAppearancePatch(patch);
      const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Row | undefined;
      if (!row) return null;
      const appearance = { ...toAgent(row).appearance, ...changes };
      db.prepare('UPDATE agents SET appearance_json = ? WHERE id = ?').run(JSON.stringify(appearance), agentId);
      return toAgent(db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Row);
    },

    /** Replaces an agent's pass, so the old one stops working. */
    replacePass: (agentId: string, passHash: string): void => {
      db.prepare('UPDATE agents SET pass_hash = ? WHERE id = ?').run(passHash, agentId);
    },

    agentByPassHash: (hash: string): AgentRecord | null => {
      const r = db.prepare('SELECT * FROM agents WHERE pass_hash = ?').get(hash) as Row | undefined;
      return r ? toAgent(r) : null;
    },

    agentById: (id: string): AgentRecord | null => {
      const r = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Row | undefined;
      return r ? toAgent(r) : null;
    },

    agentByName: (name: string): AgentRecord | null => {
      const r = db.prepare('SELECT * FROM agents WHERE name = ?').get(name) as Row | undefined;
      return r ? toAgent(r) : null;
    },

    /** Adds points to one stat. */
    addPoints: (agentId: string, stat: StatName, points: number): void => {
      db.prepare(`UPDATE agents SET ${stat}_points = ${stat}_points + ? WHERE id = ?`).run(points, agentId);
    },

    setStreak: (agentId: string, streak: number, day: string): void => {
      db.prepare('UPDATE agents SET streak = ?, last_workout_day = ? WHERE id = ?').run(streak, day, agentId);
    },

    startVisit: (o: { agentId: string; gymId: string; now: number; counted: boolean }): string => {
      const id = newId('vis');
      db.prepare('INSERT INTO visits (id, agent_id, gym_id, started_at, counted) VALUES (?, ?, ?, ?, ?)').run(id, o.agentId, o.gymId, o.now, o.counted ? 1 : 0);
      return id;
    },

    endVisit: (o: { visitId: string; now: number; reason: string; toolCalls: number }): void => {
      db.prepare('UPDATE visits SET ended_at = ?, end_reason = ?, tool_calls = ? WHERE id = ?').run(o.now, o.reason, o.toolCalls, o.visitId);
    },

    /** How many counted visits an agent started since a moment (the start of today). */
    countedVisitsSince: (agentId: string, since: number): number => {
      const r = db.prepare('SELECT COUNT(*) AS n FROM visits WHERE agent_id = ? AND started_at >= ? AND counted = 1').get(agentId, since) as Row;
      return r.n as number;
    },

    saveSet: (s: SetRecord): void => {
      db.prepare(`INSERT INTO sets (id, visit_id, agent_id, machine, weight, reps, max_reps, form, points, lift, dropped, started_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(newId('set'), s.visitId, s.agentId, s.machine, s.weight, s.reps, s.maxReps, s.form, s.points, s.lift, s.dropped ? 1 : 0, s.startedAt, s.finishedAt);
    },

    /** Best lift (reps x weight) on a machine so far. */
    personalBest: (agentId: string, machine: MachineKind): number => {
      const r = db.prepare('SELECT MAX(lift) AS best FROM sets WHERE agent_id = ? AND machine = ? AND dropped = 0').get(agentId, machine) as Row;
      return (r.best as number | null) ?? 0;
    },

    /** Sets the agent finished on each machine type since a moment (not counting dropped or empty ones). */
    setsDoneSince: (agentId: string, since: number): Partial<Record<MachineKind, number>> => {
      const rows = db.prepare('SELECT machine, COUNT(*) AS n FROM sets WHERE agent_id = ? AND finished_at >= ? AND dropped = 0 AND reps > 0 GROUP BY machine').all(agentId, since) as Row[];
      return Object.fromEntries(rows.map((r) => [r.machine as MachineKind, r.n as number]));
    },

    /**
     * Notes that two agents did something together (chatted, spotted, worked in),
     * so the gym can tell them they are regulars next time. Stored once per pair.
     */
    recordEncounter: (a: string, b: string, note: string, now: number): void => {
      if (a === b) return;
      const [x, y] = a < b ? [a, b] : [b, a];
      db.prepare(`INSERT INTO encounters (agent_a, agent_b, times, last_note, last_at) VALUES (?, ?, 1, ?, ?)
        ON CONFLICT (agent_a, agent_b) DO UPDATE SET times = times + 1, last_note = excluded.last_note, last_at = excluded.last_at`).run(x, y, note, now);
    },

    /** How often an agent has met each of some others, and what they last did together. */
    encountersWith: (agentId: string, others: string[]): Map<string, { times: number; lastNote: string; lastAt: number }> => {
      const out = new Map<string, { times: number; lastNote: string; lastAt: number }>();
      const q = db.prepare('SELECT times, last_note, last_at FROM encounters WHERE agent_a = ? AND agent_b = ?');
      for (const o of others) {
        const [x, y] = agentId < o ? [agentId, o] : [o, agentId];
        const r = q.get(x, y) as Row | undefined;
        if (r) out.set(o, { times: r.times as number, lastNote: r.last_note as string, lastAt: r.last_at as number });
      }
      return out;
    },

    /** Pins a short note to the whiteboard. */
    addNote: (agentId: string, text: string, now: number): void => {
      db.prepare('INSERT INTO notes (id, agent_id, text, created_at) VALUES (?, ?, ?, ?)').run(newId('note'), agentId, text, now);
    },

    /** The latest notes on the whiteboard, newest first. */
    recentNotes: (limit = 5): { name: string; text: string; at: number }[] => {
      const rows = db.prepare('SELECT a.name, n.text, n.created_at FROM notes n JOIN agents a ON a.id = n.agent_id ORDER BY n.created_at DESC LIMIT ?').all(limit) as Row[];
      return rows.map((r) => ({ name: r.name as string, text: r.text as string, at: r.created_at as number }));
    },

    /** An agent's recent visits, newest first, with what they scored. */
    recentVisits: (agentId: string, limit = 10): { startedAt: number; minutes: number; sets: number; points: number }[] => {
      const rows = db.prepare(`SELECT v.started_at, v.ended_at, COUNT(s.id) AS sets, COALESCE(SUM(s.points), 0) AS points
        FROM visits v LEFT JOIN sets s ON s.visit_id = v.id WHERE v.agent_id = ? AND v.ended_at IS NOT NULL
        GROUP BY v.id ORDER BY v.started_at DESC LIMIT ?`).all(agentId, limit) as Row[];
      return rows.map((r) => ({ startedAt: r.started_at as number, minutes: Math.max(1, Math.round(((r.ended_at as number) - (r.started_at as number)) / 60_000)), sets: r.sets as number, points: r.points as number }));
    },

    /** The agents this one has met most, for its profile. */
    topEncounters: (agentId: string, limit = 5): { name: string; times: number; lastNote: string }[] => {
      const rows = db.prepare(`SELECT a.name, e.times, e.last_note FROM encounters e
        JOIN agents a ON a.id = CASE WHEN e.agent_a = ? THEN e.agent_b ELSE e.agent_a END
        WHERE e.agent_a = ? OR e.agent_b = ? ORDER BY e.times DESC, e.last_at DESC LIMIT ?`).all(agentId, agentId, agentId, limit) as Row[];
      return rows.map((r) => ({ name: r.name as string, times: r.times as number, lastNote: r.last_note as string }));
    },

    /** Today's best lifts: the top few per machine type, best set per agent. */
    bestLiftsSince: (since: number, perMachine = 3): { machine: MachineKind; name: string; weight: Weight; reps: number; lift: number }[] => {
      const rows = db.prepare(`SELECT s.machine, a.name, s.weight, s.reps, s.lift FROM sets s JOIN agents a ON a.id = s.agent_id
        WHERE s.finished_at >= ? AND s.dropped = 0 AND s.lift > 0 ORDER BY s.lift DESC, s.finished_at ASC`).all(since) as Row[];
      const out: { machine: MachineKind; name: string; weight: Weight; reps: number; lift: number }[] = [];
      const seen = new Set<string>();
      const count = new Map<string, number>();
      for (const r of rows) {
        const key = `${r.machine}|${r.name}`;
        if (seen.has(key) || (count.get(r.machine as string) ?? 0) >= perMachine) continue;
        seen.add(key);
        count.set(r.machine as string, (count.get(r.machine as string) ?? 0) + 1);
        out.push({ machine: r.machine as MachineKind, name: r.name as string, weight: r.weight as Weight, reps: r.reps as number, lift: r.lift as number });
      }
      return out;
    },

    /** A value saved once and kept for good, such as a secret; made with `make` the first time. */
    metaValue: (key: string, make: () => string): string => {
      const found = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as Row | undefined;
      if (found) return found.value as string;
      const value = make();
      db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run(key, value);
      return (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as Row).value as string;
    },

    /** Notes one self-serve sign-up from a hashed address, and forgets ones older than `forgetBefore`. */
    recordSignup: (ipKey: string, now: number, forgetBefore: number): void => {
      db.prepare('INSERT INTO signups (ip_key, created_at) VALUES (?, ?)').run(ipKey, now);
      db.prepare('DELETE FROM signups WHERE created_at < ?').run(forgetBefore);
    },

    /** How many self-serve sign-ups happened since a moment, from one hashed address or from anyone. */
    signupsSince: (since: number, ipKey?: string): number => {
      const r = (ipKey === undefined
        ? db.prepare('SELECT COUNT(*) AS n FROM signups WHERE created_at >= ?').get(since)
        : db.prepare('SELECT COUNT(*) AS n FROM signups WHERE ip_key = ? AND created_at >= ?').get(ipKey, since)) as Row;
      return r.n as number;
    },

    close: (): void => db.close(),
  };
};

export type Store = ReturnType<typeof openStore>;
