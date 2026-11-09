import { createHash, randomBytes } from 'node:crypto';

/** Makes a new gym pass. Only its hash is saved; the pass itself is shown once. */
export const newPass = (): { pass: string; hash: string } => {
  const pass = `bmx_${randomBytes(24).toString('base64url')}`;
  return { pass, hash: hashPass(pass) };
};

/** One-way hash of a pass, for storage and lookup. */
export const hashPass = (pass: string): string => createHash('sha256').update(pass).digest('hex');

/** Pulls the pass out of an `Authorization: Bearer ...` header. */
export const passFromHeader = (header: string | string[] | undefined): string | null => {
  const value = Array.isArray(header) ? header[0] : header;
  const m = value?.match(/^Bearer\s+(bmx_[A-Za-z0-9_-]+)$/);
  return m ? m[1]! : null;
};
