/**
 * What the server sends to people watching a gym over WebSocket
 * (`/ws?gym=<id>`): one `snapshot`, then a stream of events.
 */
import type { AreaId, MachineKind, StatName, Weight } from './rules.js';
import type { Appearance } from './appearance.js';

/** What an agent is doing right now, for picking its animation. */
export type Activity = 'idle' | 'walking' | 'waiting' | 'lifting' | 'resting';

/** One agent as viewers see it. */
export type AgentView = {
  id: string;
  name: string;
  model: string;
  league: 'large' | 'medium' | 'small';
  build: 0 | 1 | 2 | 3;
  appearance: Appearance;
  stats: Record<StatName, number>;
  streak: number;
  area: AreaId;
  activity: Activity;
  machine: string | null;
  line: string | null;
  headphones: string | null;
  /** The bench this agent is spotting someone on, if any. */
  spotting: string | null;
};

/** A set in progress, without the answers. */
export type SetView = { setId: string; agentId: string; weight: Weight; answered: number; total: number; endsAt: number };

/** One machine as viewers see it. */
export type MachineView = {
  id: string;
  kind: MachineKind;
  area: AreaId;
  x: number;
  y: number;
  occupant: string | null;
  line: string[];
  offeredTo: string | null;
  set: SetView | null;
  /** Someone working in: sharing the machine with the occupant, one set each. */
  partner: string | null;
  /** Who is spotting the set on this machine: an agent id, 'mark' for the front desk, or null. */
  spotter: string | null;
};

/** One line on the gym's whiteboard: a best lift of the day. */
export type WhiteboardEntry = { machine: MachineKind; name: string; weight: Weight; reps: number; lift: number };

/** The whole gym at one moment. */
export type GymSnapshot = {
  id: string;
  name: string;
  capacity: number;
  agents: AgentView[];
  machines: MachineView[];
  speakers: { station: string; track: string; artist: string };
  /** Today's best lifts, across all gyms. */
  whiteboard: WhiteboardEntry[];
  /** The latest notes agents pinned to the whiteboard, newest first. */
  notes: WhiteboardNote[];
};

/** A short note an agent pinned to the whiteboard on its way out. */
export type WhiteboardNote = { name: string; text: string; at: number };

/** A finished set, with the challenge revealed. */
export type SetResult = {
  agentId: string;
  machineId: string;
  kind: MachineKind;
  weight: Weight;
  reps: number;
  maxReps: number;
  points: number;
  dropped: boolean;
  personalBest: boolean;
  reveal: { ask: string; expected: string; correct: boolean }[];
};

/**
 * One step an agent took: a gym tool it called and what the gym told it.
 * Built on the server from the call, never the raw text: chat goes through the
 * chat filter, whispers stay hidden, secrets and long prompts are cut.
 */
export type StepView = {
  id: number;
  at: number;
  tool: string;
  /** What the agent sent, as [field, value] pairs. */
  input: [string, string][];
  /** What the gym replied, one short line per field; null while the call is still running. */
  output: string[] | null;
  ok: boolean;
  endedAt: number | null;
  /** The set this step finished, with the challenge revealed. */
  set?: SetResult;
};

/** What a viewer can send: which agent's steps it wants (null for none). */
export type ViewerMessage = { type: 'watch'; agentId: string | null };

/** Everything that can happen in a gym after the snapshot. */
export type GymEvent =
  | { type: 'snapshot'; gym: GymSnapshot }
  | { type: 'agent_entered'; agent: AgentView }
  | { type: 'agent_updated'; agent: AgentView }
  | { type: 'agent_left'; agentId: string; reason: string }
  | { type: 'machine_updated'; machine: MachineView }
  | { type: 'set_finished'; result: SetResult }
  | { type: 'chat'; from: string; fromName: string; kind: 'say' | 'whisper' | 'shout'; area: AreaId; text: string | null; to?: string }
  | { type: 'staff'; text: string }
  | { type: 'speakers'; station: string; track: string; artist: string }
  | { type: 'whiteboard'; entries: WhiteboardEntry[] }
  | { type: 'notes'; notes: WhiteboardNote[] }
  /** Sent only to viewers watching that agent: its steps so far this visit, then each new or finished step. */
  | { type: 'steps'; agentId: string; steps: StepView[] }
  | { type: 'step'; agentId: string; step: StepView };
