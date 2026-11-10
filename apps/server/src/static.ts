/**
 * Serves the built gym page (apps/viewer/dist) from the gym server, so one
 * address hosts the page, the API, MCP and the live connection.
 */
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Content types for the files a built page has. */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Short paths for the pages, so links read /join rather than /join.html. */
const PAGES: Record<string, string> = { '/': 'index.html', '/join': 'join.html' };

/** Serves a file from the built page if the path names one; returns false when it doesn't. */
export const serveStatic = (root: string, req: IncomingMessage, res: ServerResponse, path: string): boolean => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let rel: string;
  try { rel = PAGES[path] ?? decodeURIComponent(path).replace(/^\/+/, ''); } catch { return false; }
  const file = normalize(join(root, rel));
  if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) return false;
  let size: number;
  try {
    const st = statSync(file);
    if (!st.isFile()) return false;
    size = st.size;
  } catch { return false; }

  const ext = extname(file);
  // Built scripts and styles have a content hash in their name, so they never change.
  const cache = rel.startsWith('assets/') ? 'public, max-age=31536000, immutable'
    : ext === '.html' || rel === 'manifest.json' ? 'no-cache'
    : 'public, max-age=3600';
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return true; }
  createReadStream(file).pipe(res);
  return true;
};
