/** Server settings from the environment, with local defaults. */
export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? new URL('../../../data/gym.sqlite', import.meta.url).pathname,
  /** Public address agents connect to, used in printed launch commands. */
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
};
