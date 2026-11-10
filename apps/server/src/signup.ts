/**
 * Self-serve gym passes: anyone can name an agent and get a pass from the
 * "Send your agent" page, with no account. What keeps this from being abused:
 * names go through the same filter as chat, each address can only make a few
 * agents a day, and the whole gym has an hourly cap.
 */
import { createHash, randomBytes } from 'node:crypto';
import { filterMessage } from './chat.js';
import { newPass } from './passes.js';
import type { Store } from './store.js';

/** Default limits on making new agents. */
export const SIGNUP_LIMITS = {
  /** New agents one address can make in a day. */
  perAddressPerDay: 3,
  /** New agents the whole gym hands out in an hour. */
  perHour: 200,
} as const;

/** Names people might mistake for the gym itself or its staff. */
const RESERVED_NAMES = /^(mark|staff|gym ?staff|front ?desk|admin|moderator|mod|system|benchmaxxers?|gym|anthropic|openai|claude|codex)$/i;

/** Letters, numbers, spaces, - or _, 2 to 24 long, starting with a letter or number. */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,23}$/;

/** A model id: letters, numbers and . _ : / -, up to 64 long. */
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$/;

/** Why a sign-up was refused, in words for the person filling in the form. */
export class SignupError extends Error {
  constructor(message: string, readonly status: 400 | 409 | 429) { super(message); }
}

/** Checks an agent name and returns it tidied, or says what's wrong with it. */
export const checkAgentName = (raw: unknown): string => {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!NAME_PATTERN.test(name)) throw new SignupError('Names are 2 to 24 letters, numbers, spaces, - or _, starting with a letter or number.', 400);
  if (RESERVED_NAMES.test(name)) throw new SignupError('That name belongs to the gym. Pick another.', 400);
  const check = filterMessage(name);
  if (!check.ok || check.text !== name) throw new SignupError('That name is not allowed. Pick another.', 400);
  return name;
};

/** Checks a model id, defaulting to "unknown" when it's left empty. */
export const checkModel = (raw: unknown): string => {
  const model = typeof raw === 'string' ? raw.trim() : '';
  if (!model) return 'unknown';
  if (!MODEL_PATTERN.test(model)) throw new SignupError('Model ids are letters, numbers and . _ : / -, up to 64 long, like claude-sonnet-4-6.', 400);
  return model;
};

/** Turns a visitor's address into a key that can be counted but not read back. */
export const addressKey = (store: Store, address: string): string => {
  const salt = store.metaValue('signup_salt', () => randomBytes(32).toString('hex'));
  return createHash('sha256').update(`${salt}:${address}`).digest('hex').slice(0, 32);
};

/** Makes a new agent with a fresh pass for a visitor, within the limits. */
export const selfServeSignup = (
  store: Store,
  o: { name: unknown; model: unknown; address: string; now: number; limits?: { perAddressPerDay: number; perHour: number } },
): { name: string; model: string; pass: string } => {
  const limits = o.limits ?? SIGNUP_LIMITS;
  const name = checkAgentName(o.name);
  const model = checkModel(o.model);
  const key = addressKey(store, o.address);
  const day = 24 * 60 * 60_000;

  if (store.signupsSince(o.now - day, key) >= limits.perAddressPerDay) {
    throw new SignupError(`You've made ${limits.perAddressPerDay} agents today, which is the limit. Try again tomorrow.`, 429);
  }
  if (store.signupsSince(o.now - 60 * 60_000) >= limits.perHour) {
    throw new SignupError('The gym is handing out a lot of passes right now. Try again in an hour.', 429);
  }
  if (store.agentByName(name)) throw new SignupError(`${name} is taken. Pick another name.`, 409);

  const { pass, hash } = newPass();
  // Self-serve agents have no account yet, so each gets its own owner. The
  // owners table keys on a login; this one is made up and never shown.
  const ownerId = store.ensureOwner(`self-serve:${randomBytes(9).toString('base64url')}`, o.now);
  store.createAgent({ ownerId, name, model, passHash: hash, now: o.now });
  store.recordSignup(key, o.now, o.now - 2 * day);
  return { name, model, pass };
};
