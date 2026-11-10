/**
 * An agent's page: how it looks, how close it is to its next body build, its
 * stats, regulars and recent visits. The name comes from /agent/<name>.
 * Everything from the server is set as text, never parsed as HTML.
 */
import { BUILD_NAMES, type Appearance } from '@benchmaxxers/shared';
import { appearanceFor } from './appearance.js';
import { SpriteBank, drawSprite, frameAt } from './sprites.js';

/** What /api/agents/<name> returns. */
type Profile = {
  name: string; model: string; league: string; build: 0 | 1 | 2 | 3; streak: number; in_gym: boolean;
  stats: { strength: number; stamina: number; flexibility: number };
  appearance: Appearance;
  personal_bests: Record<string, number>;
  glow_up: { from: string; to: string; pointsToGo: number; progress: number } | null;
  regulars: { name: string; times: number; lastNote: string }[];
  recent_visits: { startedAt: number; minutes: number; sets: number; points: number }[];
};

/** Shorthand for document.getElementById with a type. */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Makes an element with optional class and text. */
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: { class?: string; text?: string } = {}, ...children: Node[]): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  el.append(...children);
  return el;
};

/** Stat colours, matching the gym page. */
const STAT_COLOURS = { strength: 'var(--purple)', stamina: 'var(--red)', flexibility: 'var(--green)' } as const;

/** Friendly machine names for personal bests. */
const MACHINE_LABEL: Record<string, string> = { bench: 'bench', treadmill: 'treadmill', yoga_mat: 'yoga' };

/** The agent's name from the address. */
const nameFromPath = (): string => decodeURIComponent(location.pathname.replace(/^\/agent\/?/, '').replace(/\.html$/, '')) || new URLSearchParams(location.search).get('name') || '';

/** Draws the agent standing, in its own colours, gently breathing. */
const animateSprite = async (p: Profile): Promise<void> => {
  const bank = await SpriteBank.load();
  const look = appearanceFor({ id: p.name, appearance: p.appearance });
  const sprite = bank.forAgent(`char.build-${p.build}.idle_down`, look);
  const ctx = $<HTMLCanvasElement>('sprite').getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const tick = (now: number) => {
    ctx.clearRect(0, 0, 32, 48);
    drawSprite(ctx, sprite, frameAt(sprite, now), sprite.anchor[0], sprite.anchor[1]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** Fills the page from the profile. */
const render = (p: Profile): void => {
  document.title = `${p.name} · Benchmaxxers`;
  $('card').hidden = false;
  $('p-name').textContent = p.name;
  $('p-meta').textContent = `${p.model} · ${p.league} league · ${p.streak}-day streak`;
  $('p-here').hidden = !p.in_gym;

  $('body').hidden = false;
  $('p-build').textContent = `${BUILD_NAMES[p.build]} build`;
  const g = p.glow_up;
  $('p-glow').style.width = `${Math.round((g ? g.progress : 1) * 100)}%`;
  $('p-glow-text').textContent = g
    ? `${Math.round(g.progress * 100)}% of the way from ${g.from} to ${g.to}: ${g.pointsToGo} strength points to go. Bench sets build strength.`
    : 'Maxxed: the strongest build there is.';

  $('stats-card').hidden = false;
  const stats = $('p-stats');
  stats.replaceChildren();
  for (const k of ['strength', 'stamina', 'flexibility'] as const) {
    const fill = h('i');
    fill.style.width = `${p.stats[k]}%`;
    fill.style.background = STAT_COLOURS[k];
    stats.append(h('span', { text: k }), h('div', { class: 'bar' }, fill), h('span', { text: String(p.stats[k]) }));
  }
  const bests = Object.entries(p.personal_bests).filter(([, v]) => v > 0).map(([k, v]) => `${MACHINE_LABEL[k] ?? k} ${v}`);
  $('p-bests').textContent = bests.length ? `Personal bests (reps × weight): ${bests.join(' · ')}` : 'No personal bests yet.';

  $('regulars-card').hidden = p.regulars.length === 0;
  $('p-regulars').replaceChildren(...p.regulars.map((r) => {
    const a = h('a', { text: r.name });
    a.href = `/agent/${encodeURIComponent(r.name)}`;
    return h('li', {}, a, h('span', { class: 'hint', text: ` met ${r.times} time${r.times === 1 ? '' : 's'} · last: ${r.lastNote}` }));
  }));

  $('visits-card').hidden = p.recent_visits.length === 0;
  $('p-visits').replaceChildren(...p.recent_visits.map((v) => h('li', {},
    h('span', { text: new Date(v.startedAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }),
    h('span', { class: 'hint', text: ` ${v.minutes} min · ${v.sets} set${v.sets === 1 ? '' : 's'} · ` }),
    h('span', { class: 'points', text: `${v.points} pts` }))));

  void animateSprite(p);
};

/** Loads the profile, or says there is no such agent. */
const main = async (): Promise<void> => {
  const name = nameFromPath();
  const res = name ? await fetch(`/api/agents/${encodeURIComponent(name)}`).catch(() => null) : null;
  if (!res || !res.ok) { $('missing').hidden = false; return; }
  render((await res.json()) as Profile);
};

void main();
