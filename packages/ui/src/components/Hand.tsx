import { ListBox, ListBoxItem } from 'react-aria-components';
import type { CardData } from '../types.js';
import { cardKey, cardLabel } from '../types.js';
import { PlayingCard } from './PlayingCard';

export interface HandCard {
  readonly card: CardData;
  readonly disabled?: boolean;
  /** Shown to the player when the card is not legal right now. */
  readonly disabledReason?: string;
  /** The Coach's suggested card — highlighted and lifted. */
  readonly recommended?: boolean;
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
      // On narrow screens the fan overlaps harder so 8 lg cards (72px each)
      // still fit 390px while every card keeps a >=40px exposed tap strip.
      className="flex items-end justify-center -space-x-6 px-2 pt-4 max-sm:-space-x-[3.4rem] max-sm:px-0"
      onAction={(key) => {
        const entry = cards.find((c) => cardKey(c.card) === key);
        if (entry !== undefined && entry.disabled !== true && active) onPlay?.(entry.card);
      }}
    >
      {cards.map((entry, i) => {
        const playable = active && entry.disabled !== true;
        // Gentle physical fan: outer cards tilt away from the center.
        const tilt = (i - (cards.length - 1) / 2) * 1.6;
        return (
          <ListBoxItem
            key={cardKey(entry.card)}
            id={cardKey(entry.card)}
            textValue={cardLabel(entry.card)}
            aria-disabled={!playable}
            // react-aria drops the aria-disabled prop above, but forwards
            // data-* — tests and tooling read playability from this.
            data-playable={playable || undefined}
            className={`group rounded-(--radius-card) transition-transform duration-(--duration-flick) ease-(--ease-snap) ${
              entry.recommended === true ? '-translate-y-3' : ''
            } ${
              playable
                ? 'cursor-pointer hover:-translate-y-3 focus-visible:-translate-y-3'
                : 'cursor-not-allowed'
            }`}
            style={{ zIndex: entry.recommended === true ? cards.length + i : i }}
          >
            <span title={!playable ? entry.disabledReason : undefined}>
              <PlayingCard
                card={entry.card}
                size="lg"
                tilt={tilt}
                dimmed={active && entry.disabled === true}
                recommended={entry.recommended === true}
              />
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
