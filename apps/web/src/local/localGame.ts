import type { Action, GameState, Rng, Seat } from '@jaffre/engine';
import { applyAction, createGame, mulberry32, viewFor } from '@jaffre/engine';
import { chooseAction } from '@jaffre/bots';
import type { ClientAction } from '@jaffre/protocol';
import type { Roster } from '@jaffre/protocol';
import { loadPracticeBots, PRACTICE_BOT_NAMES, type PracticeBots } from '../home/practiceBots.js';
import { playerName } from '../net/socket.js';
import { useGameStore } from '../state/gameStore.js';
import { paced } from '../table/pacePref.js';

/**
 * Practice mode: the whole game runs in this tab. The store still only ever
 * sees redacted views + events — exactly the shape the server sends — so the
 * Table screen cannot tell local from online play.
 */

const HUMAN_SEAT = 0 as const;

let state: GameState | null = null;
let rng: Rng = mulberry32(0);
let botTimer: ReturnType<typeof setTimeout> | null = null;
let botDifficulties: PracticeBots = ['normal', 'normal', 'normal'];
// While true, bots hold — the tutorial intro is up and the auction must wait.
let paused = false;

/**
 * Freeze (or resume) the bots. Used by the practice tutorial so the deal's
 * auction doesn't resolve behind the intro overlay. Inert online (no state).
 */
export function setLocalPaused(next: boolean): void {
  if (paused === next) return;
  paused = next;
  if (!paused) scheduleBots();
}

function localRoster(bots: PracticeBots): Roster {
  return {
    seats: [
      { name: playerName(), isBot: false, connected: true },
      { name: PRACTICE_BOT_NAMES[0], isBot: true, connected: true, difficulty: bots[0] },
      { name: PRACTICE_BOT_NAMES[1], isBot: true, connected: true, difficulty: bots[1] },
      { name: PRACTICE_BOT_NAMES[2], isBot: true, connected: true, difficulty: bots[2] },
    ],
    spectators: 0,
    started: true,
  };
}

export function startLocalGame(seed?: number): void {
  stopLocalGame();
  botDifficulties = loadPracticeBots();
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  state = createGame(actualSeed);
  rng = mulberry32(actualSeed ^ 0xb07);
  const store = useGameStore.getState();
  store.reset();
  store.welcome(HUMAN_SEAT, viewFor(state, HUMAN_SEAT), 0, localRoster(botDifficulties), []);
  scheduleBots();
}

export function stopLocalGame(): void {
  if (botTimer !== null) clearTimeout(botTimer);
  botTimer = null;
  paused = false;
  state = null;
}

export function sendLocalAction(action: ClientAction): void {
  if (state === null) return;
  const stamped: Action =
    action.type === 'continue' ? action : ({ ...action, seat: HUMAN_SEAT } as Action);
  apply(stamped);
}

function apply(action: Action): void {
  if (state === null) return;
  const result = applyAction(state, action);
  if (!result.ok) return; // UI only offers legal moves; ignore rejects
  state = result.state;
  const store = useGameStore.getState();
  store.applyEvents(result.events, store.seq + 1, viewFor(state, HUMAN_SEAT));
  scheduleBots(result.events.some((e) => e.type === 'trick_won'));
}

// ── Dev console hooks — manipulate the running PRACTICE game for testing. ──
// All no-op online (state === null there), so they're safe to call anywhere.

/** True when a local (practice) game is running and thus manipulable. */
export function consoleActive(): boolean {
  return state !== null;
}

/** Push the current state to the store as a view update (no event animation). */
function pushView(): void {
  if (state === null) return;
  const store = useGameStore.getState();
  store.applyEvents([], store.seq + 1, viewFor(state, HUMAN_SEAT));
}

/**
 * Auto-play every seat (the human included) until `target` — the current round
 * ends, or a team wins the game. Reuses the bot policy for legal moves, so the
 * jump lands on a real, valid state.
 */
export function jumpTo(target: 'round_over' | 'game_over'): void {
  if (state === null) return;
  if (botTimer !== null) clearTimeout(botTimer);
  botTimer = null;
  for (let guard = 0; guard < 4000; guard++) {
    if (state.phase === 'game_over') break;
    if (state.phase === 'round_over') {
      if (target === 'round_over') break;
      const cont = applyAction(state, { type: 'continue' } as Action); // next deal
      if (!cont.ok) break;
      state = cont.state;
      continue;
    }
    const seat = state.turn as Seat;
    const action = chooseAction(viewFor(state, seat), rng, botDifficulties[seat - 1]);
    if (action === null) break;
    const result = applyAction(state, action);
    if (!result.ok) break;
    state = result.state;
  }
  pushView();
  scheduleBots();
}

/** Overwrite the running scores (e.g. set a team on the brink of 41). */
export function setScores(scores: readonly [number, number]): void {
  if (state === null) return;
  state = { ...state, scores };
  pushView();
}

/** The current scores, for the console's editor. */
export function currentScores(): readonly [number, number] {
  return state?.scores ?? [0, 0];
}

/** Fresh deal. `seed` 27 is known to put a red 0 in play in round 1. */
export function redeal(seed?: number): void {
  startLocalGame(seed);
}

function scheduleBots(afterTrick = false): void {
  if (botTimer !== null) clearTimeout(botTimer);
  botTimer = null;
  if (paused) return;
  if (state === null || state.phase === 'game_over') return;
  // round_over waits for the human's Ready click — bots are always ready.
  if (state.phase === 'round_over') return;
  if (state.turn === HUMAN_SEAT) return;
  botTimer = setTimeout(
    () => {
      if (state === null || (state.phase !== 'playing' && state.phase !== 'bidding')) return;
      const seat = state.turn as Seat;
      const action = chooseAction(viewFor(state, seat), rng, botDifficulties[seat - 1]);
      if (action !== null) apply(action);
    },
    // Leave room for the trick-hold + sweep animation before the next play —
    // both of which scale with the pacing preference, so this must too.
    paced(afterTrick ? 2600 : 750),
  );
}
