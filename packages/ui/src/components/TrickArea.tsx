import { AnimatePresence, motion } from 'motion/react';
import { useLang, type Lang } from '../i18n.js';
import type { CardData } from '../types.js';

const T: Record<Lang, { currentTrick: string }> = {
  en: { currentTrick: 'Current trick' },
  fr: { currentTrick: 'Levée en cours' },
};
import { cardKey } from '../types.js';
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
          plays.map((play, i) => (
            <motion.div
              key={cardKey(play.card)}
              className={`absolute ${SLOT[play.position]}`}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ ...SWEEP_TO[sweepTo], opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.56, delay: i * 0.04, ease: [0.2, 0.9, 0.25, 1] }}
            >
              <PlayingCard card={play.card} size={size} />
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}
