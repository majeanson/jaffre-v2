import { AnimatePresence, motion } from 'motion/react';
import type { CardData } from '../types.js';
import { cardKey } from '../types.js';
import { PlayingCard } from './PlayingCard';

export interface TrickPlayView {
  /** 0 = bottom (you), 1 = left, 2 = top, 3 = right — table-relative. */
  readonly position: 0 | 1 | 2 | 3;
  readonly card: CardData;
}

export interface TrickAreaProps {
  readonly plays: readonly TrickPlayView[];
  /** When set, the trick sweeps away toward this position. */
  readonly sweepTo?: 0 | 1 | 2 | 3 | null;
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

/**
 * The center of the table: cards fly in from each seat's direction and, once
 * the trick resolves, sweep toward the winner. Timing comes from motion
 * tokens; with reduced motion everything is instant (MotionConfig).
 */
export function TrickArea({ plays, sweepTo = null }: TrickAreaProps) {
  return (
    <div role="group" className="relative size-56 max-sm:size-40" aria-label="Current trick">
      <AnimatePresence>
        {sweepTo === null &&
          plays.map((play) => (
            <motion.div
              key={cardKey(play.card)}
              className={`absolute ${SLOT[play.position]}`}
              initial={{ ...ENTER_FROM[play.position], opacity: 0, rotate: -6 + play.position * 4 }}
              animate={{ x: 0, y: 0, opacity: 1, rotate: -3 + play.position * 2 }}
              exit={{ ...SWEEP_TO[play.position], opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              <PlayingCard card={play.card} size="md" />
            </motion.div>
          ))}
        {sweepTo !== null &&
          plays.map((play, i) => (
            <motion.div
              key={cardKey(play.card)}
              className={`absolute ${SLOT[play.position]}`}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ ...SWEEP_TO[sweepTo], opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.56, delay: i * 0.04, ease: [0.2, 0.9, 0.25, 1] }}
            >
              <PlayingCard card={play.card} size="md" />
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}
