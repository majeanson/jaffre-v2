import type { Card, Suit } from '@jaffre/engine';
import { Hand } from '@jaffre/ui';
import { useEffect, useRef } from 'react';
import { feedback } from '../audio/clicks.js';

const DEAL_STAGGER_MS = 90; // matches the deal-in keyframe stagger in tokens.css

export interface PlayerHandProps {
  readonly cards: readonly Card[];
  /** Cards you may legally play right now. */
  readonly legal: readonly Card[];
  readonly ledSuit: Suit | null;
  /** True when it's your turn to play a card. */
  readonly active: boolean;
  readonly onPlay: (card: Card) => void;
  /** The Coach's suggested card, highlighted in the fan (null when off). */
  readonly recommended?: Card | null;
}

/** Owns your hand along the bottom edge, with legality + disabled-reason hints. */
export function PlayerHand({
  cards,
  legal,
  ledSuit,
  active,
  onPlay,
  recommended = null,
}: PlayerHandProps) {
  // A fresh full hand (a new round's deal) ticks each card in as it lands —
  // synced to the visual deal-in stagger. Skips the cascade under reduced
  // motion (cards appear at once, so a single tick is enough).
  const hadFull = useRef(false);
  useEffect(() => {
    const nowFull = cards.length === 8;
    if (nowFull && !hadFull.current) {
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        feedback('deal', 5);
      } else {
        const timers = cards.map((_, i) =>
          setTimeout(() => feedback('deal', 5), i * DEAL_STAGGER_MS),
        );
        hadFull.current = true;
        return () => timers.forEach(clearTimeout);
      }
    }
    hadFull.current = nowFull;
    return undefined;
  }, [cards.length]);

  return (
    <div className="shrink-0 pb-1">
      <Hand
        active={active}
        cards={cards.map((card) => ({
          card,
          disabled: !active || !legal.some((c) => c.suit === card.suit && c.value === card.value),
          disabledReason:
            ledSuit !== null && card.suit !== ledSuit
              ? `You must follow ${ledSuit}`
              : 'Not your turn',
          recommended:
            recommended !== null &&
            recommended.suit === card.suit &&
            recommended.value === card.value,
        }))}
        onPlay={(card) => {
          feedback('play');
          onPlay(card as Card);
        }}
      />
    </div>
  );
}
