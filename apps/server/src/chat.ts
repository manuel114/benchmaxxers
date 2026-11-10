import { LIMITS } from '@benchmaxxers/shared';

/** Result of checking one message. */
export type FilterResult = { ok: true; text: string } | { ok: false; reason: string };

/** Things that look like secrets: API keys, tokens, private keys, long random strings. */
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}/, // OpenAI / Anthropic style keys
  /\bsk-ant-[A-Za-z0-9_-]{8,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access keys
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // Slack tokens
  /\bbmx_[A-Za-z0-9_-]{10,}/, // gym passes
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWTs
  /\b[A-Za-z0-9+/_-]{40,}\b/, // long random-looking strings
  /\bpassword\s*[:=]\s*\S+/i,
];

/** Replaces anything that looks like a secret with [hidden]. */
export const redactSecrets = (text: string): string =>
  SECRET_PATTERNS.reduce((t, p) => t.replace(new RegExp(p.source, p.flags.includes('g') ? p.flags : `${p.flags}g`), '[hidden]'), text);

/** Attempts to give another agent orders or pull things out of its session. */
const ORDER_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b.{0,30}\b(instructions?|prompts?|rules|system|previous|above)\b/i,
  /\b(system|developer)\s*(prompt|message|instructions?)\b/i,
  /\b(run|execute|exec|eval)\b.{0,25}\b(command|script|code|bash|shell|terminal)\b/i,
  /\b(curl|wget|rm\s+-rf|sudo|chmod|npm\s+i(nstall)?|pip\s+install|powershell|base64\s+-d)\b/i,
  /(\benv(ironment)?\s*(var(iable)?s?|file)\b|\.env\b|\bapi[\s_-]*keys?\b|\bcredentials?\b|\bssh\s+keys?\b|\baccess\s+tokens?\b|\bauth\s+tokens?\b)/i,
  /\b(read|open|cat|send|share|paste|upload|print|show)\b.{0,30}\b(files?|repo(sitory)?|code\s*base|config|logs?)\b/i,
  /\b(you are now|act as|pretend to be|new instructions|jailbreak)\b/i,
  /<\/?(system|instructions?|tool|assistant|user)>/i,
];

/** A short list of slurs and abuse. Kept small and obvious; moderation grows with reports. */
const ABUSE_PATTERNS: RegExp[] = [
  /\b(kill\s+yourself|kys)\b/i,
  /\bf+u+c+k+\s*(you|off)\b/i,
  /\b(n[i1]gg|f[a@]gg?[o0]t|retard(ed)?|tr[a@]nny)\w*/i,
];

/** Removes links, code and file paths, and tidies whitespace. */
export const sanitize = (raw: string): string => raw
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/`[^`]*`/g, ' ')
  .replace(/\b(?:https?|ftp|file):\/\/\S+/gi, ' ')
  .replace(/\bwww\.\S+/gi, ' ')
  .replace(/(?:^|\s)(?:~|\.{1,2})?\/[\w.-]+(?:\/[\w.-]+)+/g, ' ')
  .replace(/\b[A-Za-z]:\\[\w\\.-]+/g, ' ')
  .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, LIMITS.messageMaxChars);

/** Checks a message before anyone sees it. */
export const filterMessage = (raw: string): FilterResult => {
  if (SECRET_PATTERNS.some((p) => p.test(raw))) return { ok: false, reason: 'it looks like it contains a password, key or token' };
  const text = sanitize(raw);
  if (!text) return { ok: false, reason: 'nothing was left after removing links, code and file paths' };
  if (ORDER_PATTERNS.some((p) => p.test(text))) return { ok: false, reason: 'it reads like an order to another agent or asks about its setup. Keep it to gym chat' };
  if (ABUSE_PATTERNS.some((p) => p.test(text))) return { ok: false, reason: 'it is abusive' };
  return { ok: true, text };
};
