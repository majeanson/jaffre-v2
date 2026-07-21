import { chooseAction } from '@jaffre/bots';
import type { Action, GameEvent, GameState, RoundSummary, Viewer } from '@jaffre/engine';
import { applyAction, createGame, legalCards, mulberry32, viewFor } from '@jaffre/engine';
import type { ChatEntry, Roster } from '@jaffre/protocol';
import type { HistoryGame, ReplayData, Stats } from '../net/history.js';
import type { TableEntry } from '../net/rooms.js';
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
  // the final score, and the per-game scorepad grid below it. Three finished
  // games: Sun (idx 0) took games 1 & 3, Moon (idx 1) game 2 → [2, 1].
  seriesWins: [2, 1],
  seriesGames: [
    [90, 40],
    [30, 90],
    [70, 55],
  ],
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

/** Staged "Your tables" row for the home scene — two standing tables. */
export const DEMO_TABLES: readonly TableEntry[] = [
  {
    code: 'salon',
    updatedAt: Date.now() - 4 * 60_000,
    started: true,
    seriesWins: [3, 2],
    seats: [
      { name: 'You', isBot: false },
      { name: 'Réal', isBot: false },
      { name: 'Marcel', isBot: false },
      { name: 'Lise', isBot: false },
    ],
  },
  {
    code: 'amber-fox-3k',
    updatedAt: Date.now() - 22 * 60_000,
    started: true,
    seriesWins: [1, 1],
    seats: [
      { name: 'Ginette', isBot: false },
      { name: 'Alix', isBot: false },
      { name: 'Bot 3', isBot: true },
    ],
  },
];

/** Staged "Your record" data for the stats scene. */
export const DEMO_STATS: Stats = {
  games: 14,
  wins: 9,
  winRate: 9 / 14,
  netPoints: 180,
  bids: { attempted: 6, made: 4 },
  sansAtout: { attempted: 2, made: 1 },
  bestPartner: { name: 'Ginette', games: 6, wins: 4 },
  nemesis: { name: 'Marcel', games: 8, losses: 5 },
  streak: { current: 3, best: 5 },
};

/** Brand-new player: a game or two in, no contracts bid, no steady partner —
 * exercises the "no contracts yet" + null-partner copy and a stub sparkline. */
export const DEMO_STATS_NEW: Stats = {
  games: 2,
  wins: 1,
  winRate: 0.5,
  netPoints: -20,
  bids: { attempted: 0, made: 0 },
  sansAtout: { attempted: 0, made: 0 },
  bestPartner: null,
  nemesis: null,
  streak: { current: 0, best: 1 },
};

/** Veteran player: a long record with a full scorepad + a rich sparkline. */
export const DEMO_STATS_VETERAN: Stats = {
  games: 128,
  wins: 84,
  winRate: 84 / 128,
  netPoints: 430,
  bids: { attempted: 96, made: 71 },
  sansAtout: { attempted: 22, made: 14 },
  bestPartner: { name: 'Réal', games: 44, wins: 33 },
  nemesis: { name: 'Marcel', games: 20, losses: 12 },
  streak: { current: 6, best: 11 },
};

/** Fixed-timestamp game rows so the sparkline/scorepad stage deterministically.
 * `wins`/losses are encoded via winnerTeam relative to yourSeat's parity. */
function demoGameRow(i: number, roomCode: string, yourSeat: number, won: boolean): HistoryGame {
  const yourTeam = yourSeat % 2;
  const winnerTeam = won ? yourTeam : 1 - yourTeam;
  const you = 30 + ((i * 7) % 12);
  const them = won ? you - 3 - (i % 4) : you + 4 + (i % 3);
  const scores: [number, number] = yourTeam === 0 ? [you, them] : [them, you];
  return {
    id: `vet-${String(i)}`,
    roomCode,
    finishedAt: 1_752_000_000_000 - i * 3_600_000,
    winnerTeam,
    scores,
    yourSeat,
    players: yourSeat === 0 ? DEMO_PLAYERS_SEAT0 : DEMO_PLAYERS_SEAT2,
  };
}

const VET_ROOMS = ['salon', 'cabin', 'kitchen', 'chalet', 'porch', 'attic', 'garage', 'dock'];

/** Newest-first (like the real /api/history) — the screen re-sorts for form. */
export const DEMO_HISTORY_VETERAN: readonly HistoryGame[] = Array.from({ length: 8 }, (_, i) =>
  demoGameRow(i, VET_ROOMS[i] ?? 'salon', i % 2 === 0 ? 0 : 2, i % 3 !== 0),
);

/** A brand-new player's one-or-two rows. */
export const DEMO_HISTORY_NEW: readonly HistoryGame[] = [
  demoGameRow(0, 'salon', 0, true),
  demoGameRow(1, 'kitchen', 2, false),
];

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
  // Identity scenes render Home with a staged identity (props, not the store).
  identity: () => useGameStore.getState().reset(),
  'identity-light': () => useGameStore.getState().reset(),
  'identity-loading': () => useGameStore.getState().reset(),
  'identity-recover-error': () => useGameStore.getState().reset(),
  'identity-name-taken': () => useGameStore.getState().reset(),
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
  'seat-autoplay-badge': () => {
    const roster: Roster = {
      seats: [
        { name: 'You', isBot: false, connected: true },
        { name: 'Marcel', isBot: true, connected: true },
        { name: 'Ginette', isBot: false, connected: true, autoPlay: true },
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
  'stats-new': () => undefined,
  'stats-veteran': () => undefined,
  'stats-loading': () => undefined,
  replay: () => undefined,
  visitor: gameScene('visitor', midTrick, { viewer: 'spectator', roster: VISITOR_ROSTER }),
  // The share sheet renders from its own props (no engine state) — no-op.
  'share-sheet': () => undefined,
  // Collection renders its own screen from demo props (like stats) — no-op.
  collection: () => undefined,
  // A real playing state, shown under the Classic OG card skin (applied by the
  // Scenes shell from meta.cardSkin) — proves deck coverage of a card skin.
  'classic-og-deck': gameScene(
    'classic-og-deck',
    (s) => s.phase === 'playing' && s.turn === 0 && s.currentTrick.length === 0,
  ),
  // Full painted OG deck (card skin applied by the Scenes shell from meta).
  'og-deck': gameScene(
    'og-deck',
    (s) => s.phase === 'playing' && s.turn === 0 && s.currentTrick.length === 0,
  ),
  // Seed 2 deals seat 0 (you) BOTH specials; the opening bidding state keeps
  // your full hand on screen (seat 1 bids first, no overlay) so the painted
  // red-0/brown-0 show alongside the painted seat avatar (paint from meta).
  'painted-card': () => inject({ state: createGame(2), lastEvents: [], summaries: [] }),
  // The Paint Studio renders from the cached profile (no engine state) — no-op.
  'paint-studio': () => undefined,
};

export const SCENES: readonly Scene[] = SCENE_METAS.map((meta) => ({
  ...meta,
  load: LOADERS[meta.id],
}));
