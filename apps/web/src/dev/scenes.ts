import { chooseAction } from '@jaffre/bots';
import type { GameEvent, GameState, RoundSummary } from '@jaffre/engine';
import { applyAction, createGame, mulberry32, viewFor } from '@jaffre/engine';
import type { Roster } from '@jaffre/protocol';
import { useGameStore } from '../state/gameStore.js';

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
};

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

export interface Scene {
  readonly id: string;
  readonly label: string;
  /** True when the trick-hold banner should stay frozen on screen. */
  readonly frozenHold: boolean;
  readonly load: () => void;
}

const cache = new Map<string, Snapshot>();
function cached(id: string, until: Parameters<typeof drive>[0]): Snapshot {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  const snap = drive(until);
  cache.set(id, snap);
  return snap;
}

/** Push a snapshot into the game store exactly as the network layer would. */
function inject(snap: Snapshot, withLastEvents: boolean): void {
  const store = useGameStore.getState();
  store.reset();
  store.welcome(0, viewFor(snap.state, 0), 0, ROSTER, [
    { from: 'Marcel', text: 'Bonne game tout le monde!', at: 0 },
  ]);
  // Replay all round summaries so the recap/history is populated.
  const scored = snap.summaries.map((s) => ({ type: 'round_scored' as const, summary: s }));
  if (scored.length > 0) useGameStore.getState().applyEvents(scored, 0);
  if (withLastEvents && snap.lastEvents.length > 0) {
    useGameStore.getState().applyEvents(snap.lastEvents, 1, viewFor(snap.state, 0));
  }
}

function scene(
  id: string,
  label: string,
  until: Parameters<typeof drive>[0],
  opts: { withLastEvents?: boolean; frozenHold?: boolean } = {},
): Scene {
  return {
    id,
    label,
    frozenHold: opts.frozenHold ?? false,
    load: () => inject(cached(id, until), opts.withLastEvents ?? false),
  };
}

export const SCENES: readonly Scene[] = [
  scene('auction-you', 'Auction — your turn', (s) => s.phase === 'bidding' && s.turn === 0),
  scene('auction-wait', 'Auction — waiting', (s) => s.phase === 'bidding' && s.turn !== 0),
  scene(
    'your-lead',
    'Play — your lead',
    (s) => s.phase === 'playing' && s.turn === 0 && s.currentTrick.length === 0,
  ),
  scene(
    'mid-trick',
    'Play — mid trick',
    (s) => s.phase === 'playing' && s.currentTrick.length === 2,
  ),
  scene(
    'trick-held',
    'Trick resolved (held)',
    (_s, ev) => ev.some((e) => e.type === 'trick_won' && e.specials.length === 0),
    { withLastEvents: true, frozenHold: true },
  ),
  scene(
    'trick-red-zero',
    'Trick resolved — RED 0!',
    (_s, ev) => ev.some((e) => e.type === 'trick_won' && e.specials.includes('red_zero')),
    { withLastEvents: true, frozenHold: true },
  ),
  scene('round-over', 'Round summary', (s) => s.phase === 'round_over'),
  scene('game-over', 'Game over — recap', (s) => s.phase === 'game_over'),
];
