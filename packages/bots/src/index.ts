import type { Action, Seat, SeatView, Rng } from '@jaffre/engine';
import { easyAction } from './easy.js';
import { pickBid, type BidOpts } from './evaluate.js';
import { heuristicCard } from './heuristics.js';
import { hardCard } from './rollout.js';

export type BotDifficulty = 'easy' | 'normal' | 'hard';
export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard'];

export function isBotDifficulty(x: unknown): x is BotDifficulty {
  return x === 'easy' || x === 'normal' || x === 'hard';
}

const BID_OPTS: Record<Exclude<BotDifficulty, 'easy'>, BidOpts> = {
  // `margin` stays conservative on purpose: a missed contract is −value (the
  // defenders also keep their points), so opening marginal hands is −EV —
  // measured to LOSE games. `bidHigh` is the win-neutral lever: keep the same
  // (correct) opening discipline, but bid the hand's ceiling instead of a bare
  // 7, so a genuine monster bids 8-9 and banks the larger stake. Tuned with
  // scripts/bidab.ts (head-to-head win rate) + botbench.
  normal: {
    margin: 1.0,
    allowSansAtout: false,
    scoreAware: false,
    partnerOutbidMargin: Infinity,
    bidHigh: true,
  },
  // Hard already opens aggressively (margin 0.5) + sans-atout, so bidding to its
  // stretched ceiling overbids and LOSES (measured); it keeps bid-minimum.
  hard: {
    margin: 0.5,
    allowSansAtout: true,
    scoreAware: true,
    partnerOutbidMargin: 2,
  },
};

/**
 * Bot policies operate on a REDACTED SeatView — a bot structurally cannot see
 * hidden cards, so every bot game doubles as a redaction test. Returns null
 * when it is not the bot's turn or nothing is actionable. `difficulty` defaults
 * to 'normal' so every existing caller keeps a sane opponent for free.
 */
export function chooseAction(
  view: SeatView,
  rng: Rng,
  difficulty: BotDifficulty = 'normal',
): Action | null {
  if (view.viewer === 'spectator' || view.turn !== view.viewer) return null;
  if (view.phase === 'round_over') return { type: 'continue' };

  if (difficulty === 'easy') return easyAction(view, rng);

  const seat = view.viewer as Seat;
  if (view.phase === 'bidding') {
    return { type: 'place_bid', seat, choice: pickBid(view, BID_OPTS[difficulty]) };
  }
  if (view.phase === 'playing') {
    const card = difficulty === 'hard' ? hardCard(view, rng) : heuristicCard(view, rng, 'normal');
    return { type: 'play_card', seat, card };
  }
  return null;
}

export {
  bestTrump,
  evalTrump,
  evalSansAtout,
  pickBid,
  type BidOpts,
  type TrumpEval,
} from './evaluate.js';
export {
  certainWinner,
  cheapestWinner,
  inferredVoids,
  isBoss,
  outstanding,
  partnerOf,
  redZeroLive,
  trickCtx,
  trumpsOutstanding,
} from './analysis.js';
export { heuristicCard } from './heuristics.js';
export { suggest, type Advice, type CoachLang } from './coach.js';
