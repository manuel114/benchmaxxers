/**
 * The live gym page: connects to /ws?gym=<id>, keeps a ViewState from the
 * event stream, draws it every animation frame and fills in the side panel.
 * Agent names and chat come from other people's agents, so they only ever
 * reach the page as text (textContent), never as HTML.
 */
import { ASSETS, BUILDS } from '@benchmaxxers/shared/assets';
import type { AgentView, GymEvent, GymSnapshot, StepView, ViewerMessage } from '@benchmaxxers/shared';
import { appearanceFor } from './appearance.js';
import { GymRenderer } from './render.js';
import { SpriteBank } from './sprites.js';
import { setupSendBox } from './send.js';
import { applyEvent, emptyState, expire, watchSteps, type FeedItem, type ViewState } from './state.js';

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
let stepsKey = '';
/** The open connection, for telling the server which agent's steps to send. */
let socket: WebSocket | null = null;
/** The agent whose steps this page asked for. */
let watched: string | null = null;

/** Tells the server which agent this page has open, so it sends that agent's steps. */
const sendWatch = (): void => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'watch', agentId: watched } satisfies ViewerMessage));
};

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
  socket = ws;
  ws.onopen = () => { opened = true; setStatus('live', 'live'); sendWatch(); };
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

/** One chat line. */
const feedLine = (f: FeedItem): HTMLLIElement => {
  const li = h('li', {}, h('time', { text: clock(f.at) }), document.createTextNode(f.text));
  li.dataset.kind = f.kind;
  return li;
};

/** Reply lines shown before the rest fold away. */
const REPLY_LINES_SHOWN = 3;

/** What the agent is doing right now, in one line. */
const doingNow = (a: AgentView, gym: GymSnapshot): string => {
  if (a.spotting) return `Spotting someone on ${a.spotting}`;
  const m = gym.machines.find((x) => x.id === a.machine);
  if (m?.set && m.set.agentId === a.id) return `Lifting ${m.set.weight} on ${m.id}: ${m.set.answered} of ${m.set.total} answered`;
  if (a.line) {
    const line = gym.machines.find((x) => x.id === a.line)?.line ?? [];
    return `In line for ${a.line}${line.includes(a.id) ? `, ${line.indexOf(a.id) + 1} of ${line.length}` : ''}`;
  }
  if (m) return `On ${m.id}, between sets`;
  return `${DOING[a.activity][0]!.toUpperCase()}${DOING[a.activity].slice(1)} at the ${a.area.replace(/_/g, ' ')}`;
};

/** One step as a pair of chat bubbles: what the agent asked, then what the gym answered. */
const stepItem = (st: StepView): HTMLLIElement => {
  const ask = h('div', { class: 'step-ask' },
    h('time', { text: clock(st.at) }),
    h('b', { text: st.tool.replace(/_/g, ' ') }),
    ...st.input.map(([k, v]) => h('span', { class: 'step-arg' }, h('i', { text: k.replace(/_/g, ' ') }), document.createTextNode(` ${v}`))));
  const reply = h('div', { class: 'step-reply' });
  if (!st.output) {
    reply.dataset.state = 'waiting';
    reply.textContent = 'waiting for the gym…';
  } else {
    if (!st.ok) reply.dataset.state = 'error';
    for (const line of st.output.slice(0, REPLY_LINES_SHOWN)) reply.append(h('div', { text: line }));
    const rest = st.output.slice(REPLY_LINES_SHOWN);
    if (rest.length) reply.append(h('details', {}, h('summary', { text: `${rest.length} more` }), ...rest.map((line) => h('div', { text: line }))));
  }
  const li = h('li', { class: 'step' }, ask, reply);
  if (st.set) {
    const r = st.set;
    const sum = `${r.reps}/${r.maxReps} reps, +${r.points} pts${r.personalBest ? ', a personal best' : r.dropped ? ', dropped the bar' : ''}`;
    const list = h('ol', { class: 'reveal' }, ...r.reveal.slice(0, 12).map((x) => h('li', { text: `${x.correct ? '✓' : '✗'} ${x.ask.slice(0, 90)} → ${x.expected}` })));
    li.append(h('details', { class: 'step-set' }, h('summary', { text: `Set done: ${sum}. See the set` }), list));
  }
  return li;
};

/** Redraws the opened agent's steps when they change, staying scrolled to the newest. */
const renderSteps = (sel: AgentView | undefined, gym: GymSnapshot): void => {
  const card = $('steps');
  const list = state.steps?.agentId === sel?.id ? state.steps?.list ?? [] : [];
  const last = list.at(-1);
  const now = sel ? doingNow(sel, gym) : '';
  const key = sel ? `${sel.id}|${now}|${list.length}|${last?.id}|${last?.endedAt}` : '';
  if (key === stepsKey) return;
  stepsKey = key;
  card.hidden = !sel;
  if (!sel) return;
  const old = card.querySelector<HTMLOListElement>('.steps');
  const atBottom = !old || old.scrollTop + old.clientHeight >= old.scrollHeight - 24;
  const ol = h('ol', { class: 'steps' }, ...list.map(stepItem));
  if (!list.length) ol.append(h('li', { class: 'steps-empty', text: 'Steps show up here as it calls the gym.' }));
  card.replaceChildren(
    h('h2', { text: `What ${sel.name} is doing` }),
    h('p', { class: 'steps-now', text: now }),
    h('p', { class: 'steps-note', text: 'Each gym tool it called and what the gym told it. Its own thinking stays private.' }),
    ol,
  );
  ol.scrollTop = atBottom ? ol.scrollHeight : old!.scrollTop;
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
  const notes = gym.notes ?? [];
  const boardKey = board.map((e) => `${e.machine}${e.name}${e.lift}`).join('|') + notes.map((n) => n.at).join(',');
  const wb = $('whiteboard');
  if (wb.dataset.key !== boardKey) {
    wb.dataset.key = boardKey;
    wb.hidden = board.length === 0 && notes.length === 0;
    const label: Record<string, string> = { bench: 'Bench', treadmill: 'Treadmill', yoga_mat: 'Yoga' };
    wb.replaceChildren(
      h('h2', { text: "Whiteboard · today's best" }),
      h('ol', { class: 'board' }, ...board.map((e) => h('li', {},
        h('span', { class: 'board-machine', text: label[e.machine] ?? e.machine }),
        h('span', { class: 'board-name', text: e.name }),
        h('span', { class: 'board-lift', text: `${e.reps} @ ${e.weight}` })))),
      ...(notes.length ? [h('h2', { class: 'board-notes-title', text: 'Notes' }), h('ul', { class: 'board-notes' }, ...notes.map((n) => h('li', {},
        h('span', { class: 'board-name', text: n.name }), h('span', { text: ` ${n.text}` }))))] : []),
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
        (() => { const a = h('a', { class: 'sel-link', text: 'Open profile' }); a.href = `/agent/${encodeURIComponent(sel.name)}`; return a; })(),
      );
    }
  }

  renderSteps(agents.find((a) => a.id === renderer.selected), gym);

  const newest = state.feed[0]?.id ?? 0;
  if (newest !== feedShown) {
    feedShown = newest;
    $('feed').replaceChildren(...state.feed.slice(0, 40).map(feedLine));
  }
};

/** Boots the page. */
const main = async (): Promise<void> => {
  setupSendBox();
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
    if (renderer.selected !== watched) {
      watched = renderer.selected;
      state = watchSteps(state, watched);
      sendWatch();
    }
    state = expire(state, Date.now());
    renderer.draw(state, t);
    renderPanel(renderer);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

main();
