import type { Action, ChallengeDeal, GameState, Rng, Seat } from '@jaffre/engine';
import {
  CHALLENGE_BOT_DIFFICULTY,
  CHALLENGE_SEAT,
  applyAction,
  challengeBotSeed,
  createGame,
  mulberry32,
  viewFor,
} from '@jaffre/engine';
import { chooseAction } from '@jaffre/bots';
import type { ClientAction } from '@jaffre/protocol';
import type { Roster } from '@jaffre/protocol';
import { loadPracticeBots, PRACTICE_BOT_NAMES, type PracticeBots } from '../home/practiceBots.js';
import { playerName } from '../net/socket.js';
import { useGameStore } from '../state/gameStore.js';
import { paced } from '../table/pacePref.js';
import { SKIP_HOLD_EVENT } from '../table/useTrickHold.js';

/**
 * Practice mode: the whole game runs in this tab. The store still only ever
 * sees redacted views + events — exactly the shape the server sends — so the
 * Table screen cannot tell local from online play.
 */

/**
 * Which seat the human occupies. Seat 0 for a normal practice game — but a
 * "check this play" link drops you into a real position, and the seat facing
 * that decision is whichever seat it was. Everything below derives from this
 * rather than assuming 0.
 */
let humanSeat: Seat = 0;

let state: GameState | null = null;
let rng: Rng = mulberry32(0);
/**
 * Every action applied since the game started, in order — the Deal Board's
 * submission. Recorded only in challenge mode: a normal practice game has no
 * use for it, and keeping a log of every casual hand would be pure overhead.
 * The server re-plays this to derive the score (apps/server/src/challenge.ts).
 */
let actionLog: Action[] | null = null;
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

/**
 * Bot slot for a seat: 0-based distance clockwise from the human. Seat
 * `humanSeat` has no slot (it's you), so the three bots are slots 0, 1, 2 in
 * seating order starting after you — which keeps the difficulty preference
 * meaning "the bot to my left / across / to my right" no matter where I sit.
 */
function botSlot(seat: Seat): number {
  return ((seat - humanSeat + 4) % 4) - 1;
}

function localRoster(bots: PracticeBots): Roster {
  const seats = [0, 1, 2, 3].map((i) => {
    const seat = i as Seat;
    if (seat === humanSeat) return { name: playerName(), isBot: false, connected: true };
    const slot = botSlot(seat);
    return {
      name: PRACTICE_BOT_NAMES[slot] as string,
      isBot: true,
      connected: true,
      difficulty: bots[slot] as PracticeBots[number],
    };
  });
  return { seats, spectators: 0, started: true };
}

/**
 * Start a Deal Board challenge: the shared seeded deal, fixed bots, fixed
 * seat, and an action log recorded for submission.
 *
 * Everything here is pinned rather than preference-driven — the bots'
 * difficulty, the seat, and the rng seed — because a challenge is only worth
 * comparing if every player met the identical deal and the identical
 * opposition. The same constants are what the server re-derives to verify a
 * run (see @jaffre/engine's challenge.ts).
 */
export function startChallenge(deal: ChallengeDeal): void {
  stopLocalGame();
  botDifficulties = [CHALLENGE_BOT_DIFFICULTY, CHALLENGE_BOT_DIFFICULTY, CHALLENGE_BOT_DIFFICULTY];
  humanSeat = CHALLENGE_SEAT;
  state = createGame(deal.seed);
  rng = mulberry32(challengeBotSeed(deal.seed));
  actionLog = [];
  begin();
}

/** The challenge run so far, for submission. Null outside challenge mode. */
export function challengeLog(): readonly Action[] | null {
  return actionLog;
}

export function startLocalGame(seed?: number): void {
  stopLocalGame();
  botDifficulties = loadPracticeBots();
  humanSeat = 0;
  actionLog = null;
  const actualSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  state = createGame(actualSeed);
  rng = mulberry32(actualSeed ^ 0xb07);
  begin();
}

/**
 * Start a practice game from an ARBITRARY state — the "check this play" path:
 * a position folded out of a finished game's action log, handed over so the
 * player can take that seat and play it out themselves.
 *
 * The engine is a pure fold, so a state reached this way is indistinguishable
 * from one reached by playing: everything downstream (bots, the store, the
 * Table screen) works unchanged. Only the seat differs, and that is now a
 * variable rather than an assumption.
 */
export function startLocalGameFrom(from: GameState, seat: Seat): void {
  stopLocalGame();
  botDifficulties = loadPracticeBots();
  humanSeat = seat;
  actionLog = null;
  state = from;
  // Derive the bot rng from the game's own seed AND the position, so replaying
  // the same link twice gives the same bots — the whole point of a challenge
  // is that two people meet the same opposition.
  rng = mulberry32((from.seed ^ 0xb07) + from.roundIndex * 31 + from.currentTrick.length);
  begin();
}

/** Shared tail of both entry points: publish the state and wake the bots. */
function begin(): void {
  if (state === null) return;
  const store = useGameStore.getState();
  store.reset();
  store.welcome(humanSeat, viewFor(state, humanSeat), 0, localRoster(botDifficulties), []);
  scheduleBots();
}

export function stopLocalGame(): void {
  if (botTimer !== null) clearTimeout(botTimer);
  botTimer = null;
  paused = false;
  state = null;
  actionLog = null;
}

export function sendLocalAction(action: ClientAction): void {
  if (state === null) return;
  const stamped: Action =
    action.type === 'continue' ? action : ({ ...action, seat: humanSeat } as Action);
  apply(stamped);
}

function apply(action: Action): void {
  if (state === null) return;
  const result = applyAction(state, action);
  if (!result.ok) return; // UI only offers legal moves; ignore rejects
  // Record only what the engine ACCEPTED, so the log is replayable by
  // construction — a rejected action never happened.
  actionLog?.push(action);
  state = result.state;
  const store = useGameStore.getState();
  store.applyEvents(result.events, store.seq + 1, viewFor(state, humanSeat));
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
  store.applyEvents([], store.seq + 1, viewFor(state, humanSeat));
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
    const action = chooseAction(viewFor(state, seat), rng, botDifficulties[botSlot(seat)]);
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

/** Post-trick pause: long enough to clear the hold + sweep before the next
 * play (TRICK_HOLD_MS 1900 + SWEEP_MS 960 = 2860, plus margin). When the
 * player skips the hold, only the sweep is left to wait for. */
const AFTER_TRICK_MS = 3300;
const AFTER_SKIP_MS = 1100;

function scheduleBots(afterTrick = false, skipped = false): void {
  if (botTimer !== null) clearTimeout(botTimer);
  botTimer = null;
  if (paused) return;
  if (state === null || state.phase === 'game_over') return;
  // round_over waits for the human's Ready click — bots are always ready.
  if (state.phase === 'round_over') return;
  if (state.turn === humanSeat) return;
  botTimer = setTimeout(
    () => {
      if (state === null || (state.phase !== 'playing' && state.phase !== 'bidding')) return;
      const seat = state.turn as Seat;
      const action = chooseAction(viewFor(state, seat), rng, botDifficulties[botSlot(seat)]);
      if (action !== null) apply(action);
    },
    // Leave room for the trick-hold + sweep animation before the next play —
    // both of which scale with the pacing preference, so this must too.
    paced(afterTrick ? (skipped ? AFTER_SKIP_MS : AFTER_TRICK_MS) : 750),
  );
}

/**
 * The player skipped the trick hold: pull the bots' post-trick pause in to
 * match. Without this, skipping just trades a held trick you were looking at
 * for a blank felt you're waiting on — the same delay, less to see.
 * Registered once at module load; inert unless a local game is mid-trick.
 */
if (typeof window !== 'undefined') {
  window.addEventListener(SKIP_HOLD_EVENT, () => {
    if (botTimer === null || state === null || state.phase !== 'playing') return;
    if (state.turn === humanSeat) return;
    scheduleBots(true, true);
  });
}
