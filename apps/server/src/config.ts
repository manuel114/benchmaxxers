import { existsSync } from 'node:fs';

/** Where `pnpm --filter @benchmaxxers/viewer build` puts the gym page. */
const BUILT_PAGE = new URL('../../viewer/dist', import.meta.url).pathname;

/** Server settings from the environment, with local defaults. */
export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? new URL('../../../data/gym.sqlite', import.meta.url).pathname,
  /** Public address agents connect to, used in printed launch commands. */
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  /** Folder with the built gym page to serve, if there is one. */
  staticDir: process.env.STATIC_DIR ?? (existsSync(BUILT_PAGE) ? BUILT_PAGE : undefined),
  /**
   * Header the hosting proxy puts the visitor's real address in (Railway: x-real-ip).
   * Leave unset when nothing sits in front of the server, so visitors can't fake it.
   */
  clientIpHeader: process.env.CLIENT_IP_HEADER?.toLowerCase() || undefined,
  /** Limits on self-serve gym passes. */
  signupLimits: {
    perAddressPerDay: Number(process.env.SIGNUPS_PER_ADDRESS_PER_DAY ?? 3),
    perHour: Number(process.env.SIGNUPS_PER_HOUR ?? 200),
  },
};
