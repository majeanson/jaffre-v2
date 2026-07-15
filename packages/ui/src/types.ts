/**
 * Devkit prop types. Deliberately self-contained: packages/ui imports no
 * engine, store, or network code — components are pure props-in/events-out.
 */
export type SuitId = 'red' | 'brown' | 'green' | 'blue';

export interface CardData {
  readonly suit: SuitId;
  readonly value: number;
}

export interface SuitStyle {
  readonly glyph: string;
  readonly letter: string;
  readonly color: string;
  readonly label: string;
}

/** Suits are never color-alone: each pairs a distinct shape glyph + letter. */
export const SUIT_STYLES: Record<SuitId, SuitStyle> = {
  red: { glyph: '●', letter: 'R', color: 'var(--color-suit-red)', label: 'Red' },
  brown: { glyph: '■', letter: 'B', color: 'var(--color-suit-brown)', label: 'Brown' },
  green: { glyph: '▲', letter: 'G', color: 'var(--color-suit-green)', label: 'Green' },
  blue: { glyph: '◆', letter: 'U', color: 'var(--color-suit-blue)', label: 'Blue' },
};

export function cardKey(card: CardData): string {
  return `${card.suit}-${card.value}`;
}

export function cardLabel(card: CardData): string {
  const special =
    card.suit === 'red' && card.value === 0
      ? ', bonus +5'
      : card.suit === 'brown' && card.value === 0
        ? ', penalty −2'
        : '';
  return `${SUIT_STYLES[card.suit].label} ${card.value}${special}`;
}
