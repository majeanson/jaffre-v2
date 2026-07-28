import { applyAction, createGame, type Action, type GameState, type Seat } from '@jaffre/engine';

/**
 * A POSITION — one moment in one finished game, addressable by a link.
 *
 * This is the single primitive behind both "share this hand" (open the replay
 * paused here) and "check this play" (play it out yourself from here). One
 * primitive, two verbs: they differ only in what the receiving screen does
 * with it.
 *
 * Identified by ACTION INDEX rather than (round, trick). The replay is a pure
 * fold of (seed, actions), so the index is exact, stable and needs no search —
 * and `buildFrames` already produces one frame per action, with frame 0 as the
 * deal, so `frameIndex === actionIndex`. Round/trick would have to be resolved
 * back to an index anyway, and is ambiguous the moment a round is replayed.
 */
export interface HandPosition {
  readonly gameId: string;
  /** How many actions to apply. 0 = the deal, before anyone has bid. */
  readonly actionIndex: number;
  /** Whose eyes to show it through — and, for "check", whose seat you take. */
  readonly seat: Seat;
}

/** Hash route for a position. `#hand/<gameId>/<actionIndex>/<seat>`. */
export function positionHash(p: HandPosition): string {
  return `#hand/${p.gameId}/${String(p.actionIndex)}/${String(p.seat)}`;
}

/** Absolute link to a position, for the share sheet. */
export function positionUrl(p: HandPosition, origin: string): string {
  return `${origin}/${positionHash(p)}`;
}

const HAND_RE = /^#hand\/([A-Za-z0-9-]{1,64})\/(\d{1,5})\/([0-3])$/;

/** Parse a `#hand/...` hash, or null when it isn't one / is malformed. */
export function parsePositionHash(hash: string): HandPosition | null {
  const m = HAND_RE.exec(hash);
  if (m === null) return null;
  return {
    gameId: m[1] as string,
    actionIndex: Number(m[2]),
    seat: Number(m[3]) as Seat,
  };
}

/**
 * Fold an action log forward to a position, returning the state at that point.
 *
 * Clamps rather than throws: an index past the end of the log yields the final
 * state, which is the sane thing for a link that outlived an edit to the log.
 * Returns null only if the log is corrupt before reaching the position — in
 * which case there is no honest state to show.
 */
export function stateAt(
  seed: number,
  actions: readonly Action[],
  actionIndex: number,
): GameState | null {
  let state = createGame(seed);
  const upTo = Math.min(Math.max(0, actionIndex), actions.length);
  for (let i = 0; i < upTo; i++) {
    const action = actions[i];
    if (action === undefined) break;
    const result = applyAction(state, action);
    if (!result.ok) return null;
    state = result.state;
  }
  return state;
}

/**
 * The action index at which the trick CONTAINING `actionIndex` began — i.e.
 * rewind to just before the first card of this trick.
 *
 * "Check this play" wants the whole trick, not its tail: dropping someone in
 * after three cards are down is a quiz about one card, while starting the
 * trick is a question about how you'd have played it. Bidding actions have no
 * trick, so those positions are returned unchanged.
 */
export function trickStartIndex(
  seed: number,
  actions: readonly Action[],
  actionIndex: number,
): number {
  let state = createGame(seed);
  const upTo = Math.min(Math.max(0, actionIndex), actions.length);
  // The index at which the current trick's first card was played.
  let trickStart = upTo;
  for (let i = 0; i < upTo; i++) {
    const action = actions[i];
    if (action === undefined) break;
    // Before applying: an empty currentTrick means this action starts one.
    if (action.type === 'play_card' && state.currentTrick.length === 0) trickStart = i;
    const result = applyAction(state, action);
    if (!result.ok) return upTo;
    state = result.state;
  }
  // Mid-bidding (or exactly on a trick boundary) — nothing to rewind into.
  if (state.phase !== 'playing' || state.currentTrick.length === 0) return upTo;
  return trickStart;
}

/** Whose turn it is at a position — the natural seat to hand a "check" link
 * to, since it is the seat facing the decision. */
export function seatToPlayAt(state: GameState): Seat {
  return state.turn;
}

/**
 * Hand a position to someone. Uses the native share sheet where there is one
 * (phones, where this is actually used), and falls back to the clipboard.
 *
 * `onCopied` fires only for the clipboard path — the native sheet already
 * gives its own feedback, and a "Copied" tick on top of it would be a lie.
 */
export async function shareHand(p: HandPosition, onCopied: () => void): Promise<void> {
  const url = positionUrl(p, location.origin);
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ url });
      return;
    } catch {
      // Dismissed, or unavailable despite the feature check — fall through to
      // the clipboard rather than leaving the tap with no effect at all.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    onCopied();
  } catch {
    // No clipboard permission: nothing useful left to try, and failing loudly
    // here would interrupt a replay for a secondary action.
  }
}
