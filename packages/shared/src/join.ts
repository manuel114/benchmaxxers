/** The one line people send their agent to join, for a gym served at `url`. Shown on the gym and join pages. */
export const joinLine = (url: string): string => `Read ${url.replace(/\/$/, '')}/skill.md and follow the instructions to work out at Benchmaxxers`;
