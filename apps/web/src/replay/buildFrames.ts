import { applyAction, createGame, viewFor } from '@jaffre/engine';
import type { Action, RoundSummary, SeatView, Viewer } from '@jaffre/engine';

/**
 * One rendered frame of a replay: the redacted view for the chosen seat, the
 * round summaries accrued so far (so the recap populates at game_over), and a
 * short human label for the control bar.
 */
export interface ReplayFrame {
  readonly view: SeatView;
  readonly summaries: readonly RoundSummary[];
  readonly label: string;
}

/** A pathological log guard — real games are a few hundred actions. */
const MAX_ACTIONS = 10_000;

function labelFor(action: Action): string {
  if (action.type === 'continue') return 'New round';
  const seat = `Seat ${String(action.seat + 1)}`;
  if (action.type === 'place_bid') {
    return action.choice.kind === 'pass'
      ? `${seat} passes`
      : `${seat} bids ${String(action.choice.value)}${action.choice.sansAtout ? ' SA' : ''}`;
  }
  return `${seat} plays ${action.card.suit} ${String(action.card.value)}`;
}

/**
 * Fold the action log over a fresh game, snapshotting the view after every
 * action (frame 0 is the initial deal). Deterministic — the same seed + log
 * reproduces the game exactly, per seat. Stops with an error frame if the log
 * is corrupt rather than throwing mid-replay.
 */
export function buildFrames(
  seed: number,
  actions: readonly Action[],
  viewer: Viewer,
): readonly ReplayFrame[] {
  if (actions.length > MAX_ACTIONS) {
    throw new Error(`Replay too long: ${String(actions.length)} actions`);
  }
  let state = createGame(seed);
  const summaries: RoundSummary[] = [];
  const frames: ReplayFrame[] = [{ view: viewFor(state, viewer), summaries: [], label: 'Deal' }];
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (action === undefined) break;
    const result = applyAction(state, action);
    if (!result.ok) {
      frames.push({
        view: viewFor(state, viewer),
        summaries: [...summaries],
        label: `Corrupt log at action ${String(i + 1)}`,
      });
      break;
    }
    // The engine resolves a trick the instant the 4th card lands, so the
    // post-action state has an empty currentTrick. Re-show the completed
    // trick on this frame so the 4th card is actually visible.
    const completedTrick =
      action.type === 'play_card' && state.currentTrick.length === 3
        ? [...state.currentTrick, { seat: action.seat, card: action.card }]
        : null;
    state = result.state;
    for (const e of result.events) if (e.type === 'round_scored') summaries.push(e.summary);
    const view = viewFor(state, viewer);
    frames.push({
      view: completedTrick === null ? view : { ...view, currentTrick: completedTrick },
      summaries: [...summaries],
      label: labelFor(action),
    });
  }
  return frames;
}
