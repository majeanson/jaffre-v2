import type { CardData } from '../types.js';
import { cardLabel, SUIT_STYLES } from '../types.js';

export type CardSize = 'sm' | 'md' | 'lg';

/**
 * Fluid sizing: cards scale with the viewport (vmin) so the table reads from
 * a TV across the room and still fits a phone. Chunky-illustrated look:
 * thick ink border, big centered glyph, corner value plates, slight depth.
 */
const SIZE_CLASSES: Record<CardSize, string> = {
  sm: 'w-[clamp(2.1rem,5vmin,3.4rem)] text-[clamp(0.55rem,1.3vmin,0.8rem)]',
  md: 'w-[clamp(3.2rem,8vmin,5.6rem)] text-[clamp(0.75rem,1.9vmin,1.25rem)]',
  lg: 'w-[clamp(4.2rem,10.5vmin,7.5rem)] text-[clamp(0.95rem,2.4vmin,1.6rem)]',
};

export interface PlayingCardProps {
  readonly card: CardData;
  readonly size?: CardSize;
  readonly faceDown?: boolean;
  readonly raised?: boolean;
  readonly dimmed?: boolean;
  /** Small deterministic tilt (degrees) for a hand-held look. */
  readonly tilt?: number;
}

export function PlayingCard({
  card,
  size = 'md',
  faceDown = false,
  raised = false,
  dimmed = false,
  tilt = 0,
}: PlayingCardProps) {
  if (faceDown) {
    return (
      <div
        aria-hidden
        style={tilt !== 0 ? { transform: `rotate(${tilt}deg)` } : undefined}
        className={`${SIZE_CLASSES[size]} aspect-5/7 rounded-(--radius-card) shadow-(--shadow-card) border-[0.18em] border-(--color-ink) bg-(--color-card-back) bg-[repeating-linear-gradient(135deg,var(--color-card-back-line)_0_0.2em,transparent_0.2em_0.55em)]`}
      />
    );
  }

  const suit = SUIT_STYLES[card.suit];
  const isRedZero = card.suit === 'red' && card.value === 0;
  const isBrownZero = card.suit === 'brown' && card.value === 0;
  const bonus = isRedZero ? '+5' : isBrownZero ? '−2' : null;

  return (
    <div
      role="img"
      aria-label={cardLabel(card)}
      style={{
        color: suit.color,
        ...(tilt !== 0 ? { transform: `rotate(${tilt}deg)` } : {}),
      }}
      className={`relative select-none overflow-hidden ${SIZE_CLASSES[size]} aspect-5/7 rounded-(--radius-card) border-[0.18em] border-(--color-ink) bg-linear-to-b from-(--color-card-face) to-(--color-card-face-shade) font-ui transition-[transform,box-shadow] duration-(--duration-flick) ${
        raised ? 'shadow-(--shadow-card-raised) -translate-y-2' : 'shadow-(--shadow-card)'
      } ${dimmed ? 'opacity-45 saturate-50' : ''} ${isBrownZero ? 'brightness-95' : ''}`}
    >
      {/* Special halo: rays for the red zero, cracks-dark vignette for brown */}
      {isRedZero && (
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgb(255_200_60/0.5),transparent_58%)]"
        />
      )}
      {isBrownZero && (
        <span
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,transparent_35%,rgb(40_25_10/0.22)_100%)]"
        />
      )}

      {/* Corner value plates */}
      <span
        className="absolute top-[3%] left-[5%] grid place-items-center rounded-[0.3em] px-[0.28em] py-[0.08em] font-black leading-none tabular-nums text-[1.05em] text-(--color-card-face)"
        style={{ background: suit.color }}
      >
        {card.value}
      </span>
      <span
        className="absolute bottom-[3%] right-[5%] grid rotate-180 place-items-center rounded-[0.3em] px-[0.28em] py-[0.08em] font-black leading-none tabular-nums text-[1.05em] text-(--color-card-face)"
        style={{ background: suit.color }}
      >
        {card.value}
      </span>

      {/* Big center glyph with letterpress depth */}
      <span className="absolute inset-0 grid place-items-center text-[2.6em] leading-none drop-shadow-[0_0.06em_0_rgb(0_0_0/0.3)]">
        {suit.glyph}
      </span>

      {bonus !== null && size !== 'sm' && (
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-[8%] rounded-full border-[0.12em] border-(--color-card-face) px-[0.5em] py-[0.1em] text-[0.78em] font-black tracking-wide text-(--color-card-face)"
          style={{ background: suit.color }}
        >
          {bonus}
        </span>
      )}
    </div>
  );
}
