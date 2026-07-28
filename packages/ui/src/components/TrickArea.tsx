import { AnimatePresence, motion } from 'motion/react';
import { useLang, type Lang } from '../i18n.js';
import type { CardData } from '../types.js';

const T: Record<Lang, { currentTrick: string }> = {
  en: { currentTrick: 'Current trick' },
  fr: { currentTrick: 'Levée en cours' },
};
import { cardKey } from '../types.js';
import { useTrickSweep } from '../trickSweep.js';
import { PlayingCard, type CardSize } from './PlayingCard';

export interface TrickPlayView {
  /** 0 = bottom (you), 1 = left, 2 = top, 3 = right — table-relative. */
  readonly position: 0 | 1 | 2 | 3;
  readonly card: CardData;
}

export interface TrickAreaProps {
  readonly plays: readonly TrickPlayView[];
  /** When set, the trick sweeps away toward this position. */
  readonly sweepTo?: 0 | 1 | 2 | 3 | null;
  /** Highlight the winning card while a resolved trick is held. */
  readonly highlight?: 0 | 1 | 2 | 3 | null;
  /** Played-card size — the table runs 'lg' so the trick is easy to read. */
  readonly size?: CardSize;
}

const SLOT: Record<0 | 1 | 2 | 3, string> = {
  0: 'bottom-0 left-1/2 -translate-x-1/2',
  1: 'left-0 top-1/2 -translate-y-1/2',
  2: 'top-0 left-1/2 -translate-x-1/2',
  3: 'right-0 top-1/2 -translate-y-1/2',
};

const ENTER_FROM: Record<0 | 1 | 2 | 3, { x: number; y: number }> = {
  0: { x: 0, y: 140 },
  1: { x: -140, y: 0 },
  2: { x: 0, y: -140 },
  3: { x: 140, y: 0 },
};

const SWEEP_TO: Record<0 | 1 | 2 | 3, { x: number; y: number }> = {
  0: { x: 0, y: 260 },
  1: { x: -260, y: 0 },
  2: { x: 0, y: -260 },
  3: { x: 260, y: 0 },
};

/** The won-trick sweep-away duration, in seconds — framer-motion transitions
 * need a JS number, so this mirrors (rather than reads) the CSS
 * `--duration-sweep: 900ms` token in tokens.css; keep the two in sync by hand
 * if that token ever moves. Reduced motion still applies: `JaffreMotionConfig`
 * (motion/config.tsx) sets `reducedMotion="user"`, which zeroes every
 * framer-motion transition under `prefers-reduced-motion`, this one included.
 *
 * This is the TOTAL budget any sweep may take: `SWEEP_MS` in useTrickHold.ts
 * clears the trick just after it, and the servers' post-trick bot pause
 * (GameRoom.ts `TRICK_HOLD_MS`) is sized to cover hold + this. Raising it
 * means raising both. */
const SWEEP_DURATION_S = 0.9;

/**
 * The trick fills whatever box its parent gives it: each play sits toward its
 * player's edge, so on a tall phone the cards spread vertically and on a wide
 * desktop they spread horizontally — no wasted stage. Cards fly in from each
 * seat's direction and sweep toward the winner; timing comes from motion
 * tokens; with reduced motion everything is instant (MotionConfig).
 */
export function TrickArea({
  plays,
  sweepTo = null,
  highlight = null,
  size = 'md',
}: TrickAreaProps) {
  const t = T[useLang()];
  const sweep = useTrickSweep();
  return (
    <div role="group" className="relative h-full w-full" aria-label={t.currentTrick}>
      <AnimatePresence>
        {sweepTo === null &&
          plays.map((play) => (
            <motion.div
              key={cardKey(play.card)}
              data-testid="trick-card"
              className={`absolute ${SLOT[play.position]}`}
              initial={{ ...ENTER_FROM[play.position], opacity: 0, rotate: -6 + play.position * 4 }}
              animate={{ x: 0, y: 0, opacity: 1, rotate: -3 + play.position * 2 }}
              exit={{ ...SWEEP_TO[play.position], opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              <PlayingCard card={play.card} size={size} raised={highlight === play.position} />
            </motion.div>
          ))}
        {sweepTo !== null &&
          plays.map((play, i) => {
            // The variant owns WHERE and HOW; this owns the budget. Delays and
            // durations arrive as fractions of SWEEP_DURATION_S so no variant
            // can outlive the window useTrickHold clears the trick in.
            const step = sweep.step(play.position, sweepTo, i);
            return (
              <motion.div
                key={cardKey(play.card)}
                // Same testid as the resting branch, plus a marker for the
                // state: a departing trick had no handle at all, which is why
                // no test could ever watch a sweep happen. Counting probes are
                // unaffected — a sweep always has all four cards, and the one
                // count-based probe (queue-play) looks for 1–3.
                data-testid="trick-card"
                data-sweeping="true"
                className={`absolute ${SLOT[play.position]}`}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={step.animate}
                transition={{
                  duration: SWEEP_DURATION_S * step.durationFraction,
                  delay: SWEEP_DURATION_S * step.delayFraction,
                  ease: [...step.ease],
                }}
              >
                <PlayingCard card={play.card} size={size} />
              </motion.div>
            );
          })}
      </AnimatePresence>
    </div>
  );
}
