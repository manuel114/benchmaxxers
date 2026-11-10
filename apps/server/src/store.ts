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

    /** Machines the agent finished a set on since a moment. */
    machinesDoneSince: (agentId: string, since: number): Set<MachineKind> => {
      const rows = db.prepare('SELECT DISTINCT machine FROM sets WHERE agent_id = ? AND finished_at >= ? AND dropped = 0').all(agentId, since) as Row[];
      return new Set(rows.map((r) => r.machine as MachineKind));
    },

    close: (): void => db.close(),
  };
};

export type Store = ReturnType<typeof openStore>;
