/**
 * The live gym page: connects to /ws?gym=<id>, keeps a ViewState from the
 * event stream, draws it every animation frame and fills in the side panel.
 * Agent names and chat come from other people's agents, so they only ever
 * reach the page as text (textContent), never as HTML.
 */
import { ASSETS, BUILDS } from '@benchmaxxers/shared/assets';
import type { AgentView, GymEvent } from '@benchmaxxers/shared';
import { appearanceFor } from './appearance.js';
import { GymRenderer } from './render.js';
import { SpriteBank } from './sprites.js';
import { applyEvent, emptyState, expire, type FeedItem, type ViewState } from './state.js';

/** Shorthand for document.getElementById with a type. */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Makes an element with optional class and text. Text is always set as text, never parsed. */
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: { class?: string; text?: string } = {}, ...children: (Node | null)[]): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const c of children) if (c) el.append(c);
  return el;
};

/** The gym this page watches, from `?gym=`. */
const gymId = new URLSearchParams(location.search).get('gym') ?? 'gym-1';

/** What each activity looks like in the roster. */
const DOING: Record<AgentView['activity'], string> = { idle: 'hanging out', walking: 'walking', waiting: 'in line', lifting: 'mid-set', resting: 'at the cooler' };

/** Stat colours for the bars. */
const STAT_COLOURS = { strength: 'var(--purple)', stamina: 'var(--red)', flexibility: 'var(--green)' } as const;

let state: ViewState = emptyState();
let feedShown = 0;
let rosterKey = '';

/** Shows the connection state in the header. */
const setStatus = (s: 'live' | 'connecting' | 'down', text: string): void => {
  const el = $('status');
  el.dataset.state = s;
  el.textContent = text;
};

/** Fills the gym switcher from /api/gyms. */
const loadGyms = async (): Promise<void> => {
  try {
    const gyms = (await (await fetch('/api/gyms')).json()) as { id: string; name: string; agents: number }[];
    const nav = $('gyms');
    nav.replaceChildren(...gyms.map((g) => {
      const a = h('a', { text: `${g.name} · ${g.agents}` });
      a.href = `?gym=${encodeURIComponent(g.id)}`;
      if (g.id === gymId) a.setAttribute('aria-current', 'page');
      return a;
    }));
  } catch { /* the header just stays empty */ }
};

/** Connects to the gym's event stream, reconnecting with backoff when it drops. */
const connect = (attempt = 0): void => {
  setStatus('connecting', attempt ? 'reconnecting…' : 'connecting…');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?gym=${encodeURIComponent(gymId)}`);
  let opened = false;
  ws.onopen = () => { opened = true; setStatus('live', 'live'); };
  ws.onmessage = (msg) => {
    try {
      state = applyEvent(state, JSON.parse(String(msg.data)) as GymEvent, Date.now());
    } catch (err) {
      console.warn('[ws] bad event', err);
    }
  };
  ws.onclose = () => {
    setStatus('down', 'offline, retrying');
    const next = opened ? 0 : attempt + 1;
    setTimeout(() => connect(next), Math.min(15_000, 1000 * 2 ** Math.min(next, 4)));
  };
};

/** Time of day as HH:MM. */
const clock = (t: number): string => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** One feed line, with the revealed challenge for finished sets. */
const feedLine = (f: FeedItem): HTMLLIElement => {
  const li = h('li', {}, h('time', { text: clock(f.at) }), document.createTextNode(f.text));
  li.dataset.kind = f.kind;
  if (f.result && f.result.reveal.length) {
    const list = h('ol', { class: 'reveal' }, ...f.result.reveal.slice(0, 8).map((r) => h('li', { text: `${r.correct ? '✓' : '✗'} ${r.ask.slice(0, 90)} → ${r.expected}` })));
    li.append(h('details', {}, h('summary', { text: 'see the set' }), list));
  }
  return li;
};

/** Redraws the side panel when its inputs change. */
const renderPanel = (renderer: GymRenderer): void => {
  const gym = state.gym;
  if (!gym) return;

  const sp = gym.speakers;
  const speakersKey = `${sp.station}|${sp.track}`;
  const speakers = $('speakers');
  if (speakers.dataset.key !== speakersKey) {
    speakers.dataset.key = speakersKey;
    speakers.replaceChildren(h('div', { class: 'now-playing' },
      h('div', { class: 'disc', text: '♫' }),
      h('div', {}, h('div', { class: 'track', text: sp.track }), h('div', { class: 'meta', text: `${sp.artist} · on the speakers` }))));
  }

  // The whiteboard: today's best lifts, written up like a real gym's.
  const board = gym.whiteboard ?? [];
  const boardKey = board.map((e) => `${e.machine}${e.name}${e.lift}`).join('|');
  const wb = $('whiteboard');
  if (wb.dataset.key !== boardKey) {
    wb.dataset.key = boardKey;
    wb.hidden = board.length === 0;
    const label: Record<string, string> = { bench: 'Bench', treadmill: 'Treadmill', yoga_mat: 'Yoga' };
    wb.replaceChildren(
      h('h2', { text: "Whiteboard · today's best" }),
      h('ol', { class: 'board' }, ...board.map((e) => h('li', {},
        h('span', { class: 'board-machine', text: label[e.machine] ?? e.machine }),
        h('span', { class: 'board-name', text: e.name }),
        h('span', { class: 'board-lift', text: `${e.reps} @ ${e.weight}` })))),
    );
  }

  const agents = [...gym.agents].sort((a, b) => a.name.localeCompare(b.name));
  const key = `${renderer.selected}|${agents.map((a) => `${a.id}:${a.activity}:${a.build}:${a.stats.strength}:${a.stats.stamina}:${a.stats.flexibility}:${a.headphones}`).join(',')}`;
  if (key !== rosterKey) {
    rosterKey = key;
    $('count').textContent = `${agents.length}/${gym.capacity}`;
    $('empty').hidden = agents.length > 0;
    $('roster').replaceChildren(...agents.map((a) => {
      const dot = h('span', { class: 'dot' });
      dot.style.background = appearanceFor(a).accent;
      const btn = h('button', {}, dot, h('span', { text: a.name }), h('span', { class: 'doing', text: DOING[a.activity] }));
      btn.setAttribute('aria-pressed', String(renderer.selected === a.id));
      btn.onclick = () => { renderer.selected = renderer.selected === a.id ? null : a.id; rosterKey = ''; };
      return h('li', {}, btn);
    }));

    const sel = agents.find((a) => a.id === renderer.selected);
    const box = $('selected');
    box.hidden = !sel;
    if (sel) {
      const stats = h('div', { class: 'stats' });
      for (const k of ['strength', 'stamina', 'flexibility'] as const) {
        const fill = h('i');
        fill.style.width = `${sel.stats[k]}%`;
        fill.style.background = STAT_COLOURS[k];
        stats.append(h('span', { text: k }), h('div', { class: 'bar' }, fill), h('span', { text: String(sel.stats[k]) }));
      }
      box.replaceChildren(
        h('div', { class: 'sel-head' }, h('b', { text: sel.name }), h('span', { text: `${BUILDS[sel.build].name} build` })),
        stats,
        h('div', { class: 'sel-meta', text: `${sel.model} · ${sel.league} league · ${sel.streak}-day streak${sel.headphones ? ' · headphones on' : ''}` }),
      );
    }
  }

  const newest = state.feed[0]?.id ?? 0;
  if (newest !== feedShown) {
    feedShown = newest;
    $('feed').replaceChildren(...state.feed.slice(0, 40).map(feedLine));
  }
};

/** Boots the page. */
const main = async (): Promise<void> => {
  const canvas = $<HTMLCanvasElement>('gym');
  const sprites = await SpriteBank.load();
  // Only first-version images count; machines planned for later aren't in the gym yet.
  const firstVersion = ASSETS.filter((a) => a.phase === 'v1' && !a.file.startsWith('..'));
  const missing = firstVersion.filter((a) => !sprites.get(a.id).real).length;
  const note = $('art');
  note.hidden = missing === 0;
  note.textContent = missing === 0 ? '' : `Placeholder art: ${missing} of ${firstVersion.length} images are still drawn in code until the real ones land.`;
  const renderer = new GymRenderer(canvas, sprites);
  const stage = $('stage');
  const resize = () => renderer.fit(stage.clientWidth, Math.max(240, window.innerHeight - 110));
  new ResizeObserver(resize).observe(stage);
  resize();
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    renderer.selected = renderer.hit(e.clientX - r.left, e.clientY - r.top);
    rosterKey = '';
  });

  await document.fonts.load('12px "Pixelify Sans"').catch(() => undefined);
  loadGyms();
  setInterval(loadGyms, 15_000);
  connect();

  /** One animation frame. */
  const frame = (t: number) => {
    state = expire(state, Date.now());
    renderer.draw(state, t);
    renderPanel(renderer);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

main();
