import type { CardData } from '../types.js';
import { cardLabel, SUIT_STYLES } from '../types.js';

export type CardSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<CardSize, string> = {
  sm: 'w-9 h-13 text-[10px]',
  md: 'w-14 h-20 text-sm',
  lg: 'w-18 h-26 text-base',
};

const CENTER_GLYPH: Record<CardSize, string> = {
  sm: 'text-lg',
  md: 'text-3xl',
  lg: 'text-4xl',
};

export interface PlayingCardProps {
  readonly card: CardData;
  readonly size?: CardSize;
  readonly faceDown?: boolean;
  readonly raised?: boolean;
  readonly dimmed?: boolean;
}

/** A single card face — pure presentation; interactivity belongs to Hand. */
export function PlayingCard({
  card,
  size = 'md',
  faceDown = false,
  raised = false,
  dimmed = false,
}: PlayingCardProps) {
  if (faceDown) {
    return (
      <div
        aria-hidden
        className={`${SIZE_CLASSES[size]} rounded-(--radius-card) shadow-(--shadow-card) border border-black/40 bg-(--color-card-back) bg-[repeating-linear-gradient(135deg,var(--color-card-back-line)_0_3px,transparent_3px_9px)]`}
      />
    );
  }

  const suit = SUIT_STYLES[card.suit];
  const bonus =
    card.suit === 'red' && card.value === 0
      ? '+5'
      : card.suit === 'brown' && card.value === 0
        ? '−2'
        : null;

  return (
    <div
      role="img"
      aria-label={cardLabel(card)}
      className={`relative select-none ${SIZE_CLASSES[size]} rounded-(--radius-card) border border-black/25 bg-linear-to-b from-(--color-ivory) to-(--color-ivory-shade) font-ui transition-[transform,box-shadow] duration-(--duration-flick) ${
        raised ? 'shadow-(--shadow-card-raised) -translate-y-2' : 'shadow-(--shadow-card)'
      } ${dimmed ? 'opacity-45 saturate-50' : ''}`}
      style={{ color: suit.color }}
    >
      <span className="absolute top-1 left-1.5 leading-none font-bold tabular-nums">
        {card.value}
        <span className="block text-[0.7em]">{suit.glyph}</span>
      </span>
      <span className="absolute bottom-1 right-1.5 leading-none font-bold tabular-nums rotate-180">
        {card.value}
        <span className="block text-[0.7em]">{suit.glyph}</span>
      </span>
      <span
        className={`absolute inset-0 grid place-items-center ${CENTER_GLYPH[size]} drop-shadow-[0_1px_0_rgb(0_0_0/0.15)]`}
      >
        {suit.glyph}
      </span>
      {bonus !== null && size !== 'sm' && (
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-[18%] rounded-full px-1.5 py-px text-[0.62em] font-bold tracking-wide text-(--color-ivory)"
          style={{ background: suit.color }}
        >
          {bonus}
        </span>
      )}
    </div>
  );
}
