import type { Card, Suit } from '@jaffre/engine';
import { cardKey, Hand, sortByColour } from '@jaffre/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feedback, playClick } from '../audio/clicks.js';
import { GHOST_BTN_SM } from '../components/buttonStyles.js';

const DEAL_STAGGER_MS = 90; // matches the deal-in keyframe stagger in tokens.css
const SORT_STAGGER_MS = 45; // the satisfying cascade when tidying the hand

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
  // A client-only display order (card keys). New rounds bring new keys, so the
  // stale order naturally falls back to the dealt order; the sort button and
  // (future) drag rearrange it. Never touches game state.
  const [order, setOrder] = useState<readonly string[]>([]);

  const displayCards = useMemo<readonly Card[]>(() => {
    const byKey = new Map(cards.map((c) => [cardKey(c), c]));
    const known = new Set(order);
    const ordered = order.map((k) => byKey.get(k)).filter((c): c is Card => c !== undefined);
    const fresh = cards.filter((c) => !known.has(cardKey(c)));
    return [...ordered, ...fresh];
  }, [cards, order]);

  // A fresh full hand (a new round's deal) ticks each card in as it lands —
  // synced to the visual deal-in stagger. Skips the cascade under reduced motion.
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

  const sortHand = () => {
    setOrder(sortByColour(cards).map(cardKey));
    // A little cascade of clicks as the cards slide into place.
    displayCards.forEach((_, i) => setTimeout(() => playClick('sort'), i * SORT_STAGGER_MS));
    feedback('sort', 6);
  };

  return (
    <div className="shrink-0 pb-1">
      {cards.length > 1 && (
        <div className="flex justify-end px-2">
          <button
            type="button"
            onClick={sortHand}
            title="Sort your hand by colour"
            className={`mb-0.5 ${GHOST_BTN_SM}`}
          >
            ⇅ Sort
          </button>
        </div>
      )}
      <Hand
        active={active}
        cards={displayCards.map((card) => ({
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
