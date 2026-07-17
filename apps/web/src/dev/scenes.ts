import { chooseAction } from '@jaffre/bots';
import type { Action, GameEvent, GameState, RoundSummary, Viewer } from '@jaffre/engine';
import { applyAction, createGame, legalCards, mulberry32, viewFor } from '@jaffre/engine';
import type { ChatEntry, Roster } from '@jaffre/protocol';
import type { HistoryGame, ReplayData, Stats } from '../net/history.js';
import type { Connection } from '../state/gameStore.js';
import { useGameStore } from '../state/gameStore.js';
import type { SceneId, SceneMeta } from './sceneManifest.js';
import { SCENE_METAS } from './sceneManifest.js';

/**
 * Scene viewer data: staged game states reached by fast-forwarding a seeded
 * game with bots — every phase and moment of a game, viewable instantly
 * without playing one. Purely client-side; nothing touches the server.
 */

const SEED = 27; // seed 27: red 0 in round 1, ~5 round game (verified)

const ROSTER: Roster = {
  seats: [
    { name: 'You', isBot: false, connected: true },
    { name: 'Marcel', isBot: true, connected: true },
    { name: 'Ginette', isBot: true, connected: true },
    { name: 'Réal', isBot: true, connected: false },
  ],
  spectators: 1,
  started: true,
  // A standing table mid-series — the game-over scene shows this tally under
  // the final score.
  seriesWins: [2, 1],
};

/** You are ready, one human is not — the summary shows the waiting state. */
const READY_ROSTER: Roster = {
  seats: [
    { name: 'You', isBot: false, connected: true, ready: true },
    { name: 'Marcel', isBot: true, connected: true },
    { name: 'Ginette', isBot: false, connected: true, ready: false },
    { name: 'Réal', isBot: true, connected: false },
  ],
  spectators: 1,
  started: true,
};

/** Seat 0 is someone else ('Marc') — the spectator sees no 'You' anywhere. */
const SPECTATOR_ROSTER: Roster = {
  seats: [
    { name: 'Marc', isBot: false, connected: true },
    { name: 'Marcel', isBot: true, connected: true },
    { name: 'Ginette', isBot: true, connected: true },
    { name: 'Réal', isBot: true, connected: false },
  ],
  spectators: 2,
  started: true,
};

/** A started room with two takeable bot seats (1 and 3) — the visitor scene. */
const VISITOR_ROSTER: Roster = {
  seats: [
    { name: 'Alice', isBot: false, connected: true },
    { name: 'Marcel', isBot: true, connected: true },
    { name: 'Bob', isBot: false, connected: true },
    { name: 'Réal', isBot: true, connected: true },
  ],
  spectators: 1,
  started: true,
};

const LOBBY_OPEN: Roster = {
  seats: [
    { name: 'You', isBot: false, connected: true },
    { name: 'Marcel', isBot: true, connected: true },
    null,
    null,
  ],
  spectators: 0,
  started: false,
};

const LOBBY_FULL: Roster = {
  seats: [
    { name: 'You', isBot: false, connected: true },
    { name: 'Marcel', isBot: true, connected: true },
    { name: 'Ginette', isBot: true, connected: true },
    { name: 'Réal', isBot: true, connected: true },
  ],
  spectators: 0,
  started: false,
};

const CHAT: readonly ChatEntry[] = [{ from: 'Marcel', text: 'Bonne game tout le monde!', at: 0 }];

interface Snapshot {
  readonly state: GameState;
  /** Events produced by the LAST applied action (banner/held-trick source). */
  readonly lastEvents: readonly GameEvent[];
  /** Every round_scored so far (feeds the game recap). */
  readonly summaries: readonly RoundSummary[];
}

/** Fast-forward the seeded game until `until` says stop. */
function drive(until: (state: GameState, lastEvents: readonly GameEvent[]) => boolean): Snapshot {
  const rng = mulberry32(SEED ^ 0xb07);
  let state = createGame(SEED);
  let lastEvents: readonly GameEvent[] = [];
  const summaries: RoundSummary[] = [];
  for (let i = 0; i < 40_000; i++) {
    if (until(state, lastEvents)) return { state, lastEvents, summaries };
    if (state.phase === 'game_over') break; // predicate can no longer be met
    const action =
      state.phase === 'round_over'
        ? ({ type: 'continue' } as const)
        : chooseAction(viewFor(state, state.turn), rng);
    if (action === null) break;
    const result = applyAction(state, action);
    if (!result.ok) break;
    state = result.state;
    lastEvents = result.events;
    for (const e of result.events) if (e.type === 'round_scored') summaries.push(e.summary);
  }
  return { state, lastEvents, summaries };
}

/** A full seeded game as a (seed, actions) log — feeds the replay scene. */
function buildDemoReplay(): ReplayData {
  const rng = mulberry32(SEED ^ 0xb07);
  let state = createGame(SEED);
  const actions: Action[] = [];
  for (let i = 0; i < 5000 && state.phase !== 'game_over'; i++) {
    const action =
      state.phase === 'round_over'
        ? ({ type: 'continue' } as const)
        : chooseAction(viewFor(state, state.turn), rng);
    if (action === null) break;
    const result = applyAction(state, action);
    if (!result.ok) break;
    actions.push(action);
    state = result.state;
  }
  return { seed: SEED, actions };
}

const DEMO_PLAYERS_SEAT0 = [
  { seat: 0, name: 'You', isBot: false },
  { seat: 1, name: 'Marcel', isBot: true },
  { seat: 2, name: 'Ginette', isBot: false },
  { seat: 3, name: 'Réal', isBot: true },
];

const DEMO_PLAYERS_SEAT2 = [
  { seat: 0, name: 'Marcel', isBot: true },
  { seat: 1, name: 'Réal', isBot: true },
  { seat: 2, name: 'You', isBot: false },
  { seat: 3, name: 'Ginette', isBot: false },
];

/** Staged history rows for the "Your games" scene (fixed dates → deterministic). */
export const DEMO_HISTORY: readonly HistoryGame[] = [
  {
    id: 'demo-1',
    roomCode: 'salon',
    finishedAt: 1_752_000_000_000,
    winnerTeam: 0,
    scores: [41, 33],
    yourSeat: 0,
    players: DEMO_PLAYERS_SEAT0,
  },
  {
    id: 'demo-2',
    roomCode: 'kitchen',
    finishedAt: 1_751_800_000_000,
    winnerTeam: 1,
    scores: [28, 44],
    yourSeat: 0,
    players: DEMO_PLAYERS_SEAT0,
  },
  {
    id: 'demo-3',
    roomCode: 'cabin',
    finishedAt: 1_751_600_000_000,
    winnerTeam: 0,
    scores: [42, 19],
    yourSeat: 2,
    players: DEMO_PLAYERS_SEAT2,
  },
];

export const DEMO_REPLAY: ReplayData = { ...buildDemoReplay(), players: DEMO_PLAYERS_SEAT0 };

/** Staged "Your record" data for the stats scene. */
export const DEMO_STATS: Stats = {
  games: 14,
  wins: 9,
  winRate: 9 / 14,
  bids: { attempted: 6, made: 4 },
  sansAtout: { attempted: 2, made: 1 },
  bestPartner: { name: 'Ginette', games: 6, wins: 4 },
  streak: { current: 3, best: 5 },
};

export type Scene = SceneMeta & { readonly load: () => void };

const cache = new Map<string, Snapshot>();
function cached(id: string, until: Parameters<typeof drive>[0]): Snapshot {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  const snap = drive(until);
  cache.set(id, snap);
  return snap;
}

interface InjectOpts {
  readonly viewer?: Viewer;
  readonly roster?: Roster;
  readonly withLastEvents?: boolean;
}

/** Push a snapshot into the game store exactly as the network layer would. */
function inject(snap: Snapshot, opts: InjectOpts = {}): void {
  const viewer = opts.viewer ?? 0;
  const roster = opts.roster ?? ROSTER;
  const store = useGameStore.getState();
  store.reset();
  store.welcome(viewer, viewFor(snap.state, viewer), 0, roster, CHAT);
  // Replay all round summaries so the recap/history is populated.
  const scored = snap.summaries.map((s) => ({ type: 'round_scored' as const, summary: s }));
  if (scored.length > 0) useGameStore.getState().applyEvents(scored, 0);
  if ((opts.withLastEvents ?? false) && snap.lastEvents.length > 0) {
    useGameStore.getState().applyEvents(snap.lastEvents, 1, viewFor(snap.state, viewer));
  }
}

/** Stage a pre-game lobby (no view, roster not started). */
function injectLobby(roster: Roster, connection: Connection): void {
  const store = useGameStore.getState();
  store.reset();
  store.welcome(0, null, 0, roster, CHAT);
  // welcome() hard-sets connection to 'open', so this must come after it.
  store.setConnection(connection);
}

function gameScene(id: SceneId, until: Parameters<typeof drive>[0], opts: InjectOpts = {}) {
  return () => inject(cached(id, until), opts);
}

const midTrick = (s: GameState) => s.phase === 'playing' && s.currentTrick.length === 2;

/** One loader per scene — the Record keeps catalog and loaders in lockstep. */
const LOADERS: Record<SceneId, () => void> = {
  home: () => useGameStore.getState().reset(),
  'home-help': () => useGameStore.getState().reset(),
  'your-tables': () => useGameStore.getState().reset(),
  'lobby-open': () => injectLobby(LOBBY_OPEN, 'open'),
  'lobby-full': () => injectLobby(LOBBY_FULL, 'open'),
  'lobby-reconnecting': () => injectLobby(LOBBY_FULL, 'reconnecting'),
  waiting: () => useGameStore.getState().reset(),
  'auction-you': gameScene('auction-you', (s) => s.phase === 'bidding' && s.turn === 0),
  'auction-wait': gameScene('auction-wait', (s) => s.phase === 'bidding' && s.turn !== 0),
  'your-lead': gameScene(
    'your-lead',
    (s) => s.phase === 'playing' && s.turn === 0 && s.currentTrick.length === 0,
  ),
  'mid-trick': gameScene('mid-trick', midTrick),
  // Seat 0 on turn, following a led suit, holding a mix of legal and locked
  // cards — the state that shows the dimmed/unplayable styling.
  'follow-suit': gameScene('follow-suit', (s) => {
    if (s.phase !== 'playing' || s.turn !== 0 || s.currentTrick.length === 0) return false;
    const v = viewFor(s, 0);
    const led = v.currentTrick[0]?.card.suit ?? null;
    const legal = legalCards(v.hand, led);
    return legal.length > 0 && legal.length < v.hand.length;
  }),
  'trick-held': gameScene(
    'trick-held',
    (_s, ev) => ev.some((e) => e.type === 'trick_won' && e.specials.length === 0),
    { withLastEvents: true },
  ),
  'trick-red-zero': gameScene(
    'trick-red-zero',
    (_s, ev) => ev.some((e) => e.type === 'trick_won' && e.specials.includes('red_zero')),
    { withLastEvents: true },
  ),
  'last-trick-peek': gameScene(
    'last-trick-peek',
    (s) => s.phase === 'playing' && s.capturedTricks.length >= 1 && s.currentTrick.length === 0,
  ),
  'log-open': gameScene('log-open', midTrick),
  'score-details': gameScene('score-details', midTrick),
  'comms-open': gameScene('comms-open', midTrick),
  'table-reconnecting': () => {
    inject(cached('mid-trick', midTrick));
    // welcome() (inside inject) hard-sets 'open', so this must come after it.
    useGameStore.getState().setConnection('reconnecting');
  },
  'seat-disconnected-countdown': () => {
    // botSwapAt is computed at load time so the countdown is always in the
    // future (the probe targets the testid, not the ticking text).
    const roster: Roster = {
      seats: [
        { name: 'You', isBot: false, connected: true },
        { name: 'Marcel', isBot: true, connected: true },
        { name: 'Ginette', isBot: false, connected: false, botSwapAt: Date.now() + 30_000 },
        { name: 'Réal', isBot: true, connected: true },
      ],
      spectators: 0,
      started: true,
    };
    inject(cached('mid-trick', midTrick), { roster });
  },
  spectator: gameScene('spectator', midTrick, {
    viewer: 'spectator',
    roster: SPECTATOR_ROSTER,
  }),
  'round-over': gameScene('round-over', (s) => s.phase === 'round_over'),
  'round-over-ready': gameScene('round-over-ready', (s) => s.phase === 'round_over', {
    roster: READY_ROSTER,
  }),
  'game-over': gameScene('game-over', (s) => s.phase === 'game_over'),
  // History/Stats/Replay render their own screens from demo props (not the
  // store), so their loaders are no-ops — resetting here would race Replay's
  // own frame injection (child effects run before this parent effect).
  history: () => undefined,
  'history-empty': () => undefined,
  stats: () => undefined,
  'stats-empty': () => undefined,
  replay: () => undefined,
  visitor: gameScene('visitor', midTrick, { viewer: 'spectator', roster: VISITOR_ROSTER }),
};

export const SCENES: readonly Scene[] = SCENE_METAS.map((meta) => ({
  ...meta,
  load: LOADERS[meta.id],
}));
