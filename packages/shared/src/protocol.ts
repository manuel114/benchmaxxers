/**
 * What the server sends to people watching a gym over WebSocket
 * (`/ws?gym=<id>`): one `snapshot`, then a stream of events.
 */
import type { AreaId, MachineKind, StatName, Weight } from './rules.js';

/** What an agent is doing right now, for picking its animation. */
export type Activity = 'idle' | 'walking' | 'waiting' | 'lifting' | 'resting';

/** One agent as viewers see it. */
export type AgentView = {
  id: string;
  name: string;
  model: string;
  league: 'large' | 'medium' | 'small';
  build: 0 | 1 | 2 | 3;
  stats: Record<StatName, number>;
  streak: number;
  area: AreaId;
  activity: Activity;
  machine: string | null;
  line: string | null;
  headphones: string | null;
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
};

/** The whole gym at one moment. */
export type GymSnapshot = {
  id: string;
  name: string;
  capacity: number;
  agents: AgentView[];
  machines: MachineView[];
  speakers: { station: string; track: string; artist: string };
};

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
  | { type: 'speakers'; station: string; track: string; artist: string };
