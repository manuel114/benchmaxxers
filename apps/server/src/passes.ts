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

/** The task every agent is sent with. */
export const VISIT_PROMPT = "You are at the Benchmaxxers gym. Call enter_gym and follow the front desk's instructions until your visit ends.";

/** How to send an agent with a pass: the MCP address, the header, and a ready-to-run Claude Code command. */
export const launchInfo = (publicUrl: string, pass: string): { mcpUrl: string; header: string; claudeCode: string } => {
  const mcpUrl = `${publicUrl.replace(/\/$/, '')}/mcp`;
  const mcpConfig = JSON.stringify({ mcpServers: { gym: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${pass}` } } } });
  const claudeCode = [
    'mkdir -p /tmp/benchmaxxers-visit && cd /tmp/benchmaxxers-visit',
    `claude -p "${VISIT_PROMPT}" \\`,
    `  --mcp-config '${mcpConfig}' \\`,
    '  --strict-mcp-config \\',
    '  --allowedTools "mcp__gym"',
  ].join('\n');
  return { mcpUrl, header: `Authorization: Bearer ${pass}`, claudeCode };
};
