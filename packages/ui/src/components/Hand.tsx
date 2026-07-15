import { ListBox, ListBoxItem } from 'react-aria-components';
import type { CardData } from '../types.js';
import { cardKey, cardLabel } from '../types.js';
import { PlayingCard } from './PlayingCard';

export interface HandCard {
  readonly card: CardData;
  readonly disabled?: boolean;
  /** Shown to the player when the card is not legal right now. */
  readonly disabledReason?: string;
}

export interface HandProps {
  readonly cards: readonly HandCard[];
  readonly onPlay?: (card: CardData) => void;
  /** When false the hand renders but nothing is playable (not your turn). */
  readonly active?: boolean;
  readonly label?: string;
}

/**
 * The player's fanned hand. A keyboard-first listbox: arrows rove, Enter
 * plays. Illegal cards stay focusable so their reason can be announced.
 */
export function Hand({ cards, onPlay, active = true, label = 'Your hand' }: HandProps) {
  return (
    <ListBox
      aria-label={label}
      orientation="horizontal"
      selectionMode="none"
      className="flex items-end justify-center -space-x-3 px-4 pt-4 pb-2"
      onAction={(key) => {
        const entry = cards.find((c) => cardKey(c.card) === key);
        if (entry !== undefined && entry.disabled !== true && active) onPlay?.(entry.card);
      }}
    >
      {cards.map((entry, i) => {
        const playable = active && entry.disabled !== true;
        return (
          <ListBoxItem
            key={cardKey(entry.card)}
            id={cardKey(entry.card)}
            textValue={cardLabel(entry.card)}
            aria-disabled={!playable}
            className={`group rounded-(--radius-card) transition-transform duration-(--duration-flick) ease-(--ease-snap) ${
              playable
                ? 'cursor-pointer hover:-translate-y-3 focus-visible:-translate-y-3'
                : 'cursor-not-allowed'
            }`}
            style={{ zIndex: i }}
          >
            <span title={!playable ? entry.disabledReason : undefined}>
              <PlayingCard card={entry.card} size="lg" dimmed={active && entry.disabled === true} />
              {!playable && entry.disabledReason !== undefined && (
                <span className="sr-only">{entry.disabledReason}</span>
              )}
            </span>
          </ListBoxItem>
        );
      })}
    </ListBox>
  );
}
