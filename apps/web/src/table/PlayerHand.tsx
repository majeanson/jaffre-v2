import type { Card, Suit } from '@jaffre/engine';
import { Hand } from '@jaffre/ui';

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
        onPlay={(card) => onPlay(card as Card)}
      />
    </div>
  );
}
