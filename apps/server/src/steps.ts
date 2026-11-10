/**
 * Turns an agent's tool call into a step people watching can read: what it
 * sent and what the gym replied. Everyone can open any agent, so nothing
 * goes out raw: chat is shown as the chat filter let it through, whispers
 * keep their text hidden (the reply and the call), anything that looks like
 * a secret is cut, and long text (set prompts, answers) is shortened.
 */
import { filterMessage, redactSecrets } from './chat.js';

/** Longest value shown for one input field. */
const INPUT_MAX = 120;

/** Longest line shown for one reply field. */
const LINE_MAX = 220;

/** Most reply lines shown for one step. */
const LINES_MAX = 14;

/** Longest string kept inside a reply before it's cut (set prompts run to thousands of characters). */
const STRING_MAX = 160;

/** Tools whose `text` goes out as chat, so it is shown as the filter let it through. */
const CHAT_TOOLS = new Set(['say', 'shout', 'leave_note']);

/** Cuts text to `max` characters, saying how much was left out. */
export const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}… (${text.length - max} more characters)`;

/** One input value as text. */
const inputValue = (tool: string, key: string, value: unknown): string => {
  if (key === 'text' && tool === 'whisper') return '(whispered, only they can read it)';
  if (key === 'text' && CHAT_TOOLS.has(tool)) {
    const f = filterMessage(String(value));
    return f.ok ? f.text : `(blocked by the chat filter: ${f.reason})`;
  }
  if (key === 'goal') {
    const f = filterMessage(String(value));
    return f.ok ? f.text : '(hidden)';
  }
  if (Array.isArray(value)) return value.map((v, i) => `${i + 1}) ${clip(redactSecrets(String(v)), INPUT_MAX)}`).join('  ');
  if (value && typeof value === 'object') return clip(redactSecrets(JSON.stringify(value)), INPUT_MAX);
  return clip(redactSecrets(String(value)), INPUT_MAX);
};

/** What the agent sent, as [field, value] pairs. */
export const describeInput = (tool: string, input: Record<string, unknown>): [string, string][] =>
  Object.entries(input).filter(([, v]) => v !== undefined).map(([k, v]) => [k, inputValue(tool, k, v)]);

/** A copy of a reply that is safe to show: whispers hidden, secrets cut, long strings shortened. */
const scrub = (value: unknown): unknown => {
  if (typeof value === 'string') return clip(redactSecrets(value), STRING_MAX);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const whisper = obj.how === 'whisper' || obj.kind === 'whisper';
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, whisper && (k === 'said' || k === 'text') ? '(whisper)' : scrub(v)]));
  }
  return value;
};

/** What the gym replied, one short line per field. The status line every reply carries is left out. */
export const describeOutput = (result: unknown): string[] => {
  if (typeof result === 'string') return [clip(redactSecrets(result), LINE_MAX)];
  if (!result || typeof result !== 'object') return [String(result)];
  const lines = Object.entries(scrub(result) as Record<string, unknown>)
    .filter(([k]) => k !== '_status')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${clip(typeof v === 'string' ? v : JSON.stringify(v), LINE_MAX)}`);
  return lines.length > LINES_MAX ? [...lines.slice(0, LINES_MAX), `…and ${lines.length - LINES_MAX} more`] : lines;
};
