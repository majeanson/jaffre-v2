import { useLang } from '../i18n.js';
import { useCardSkin } from '../cardSkin.js';
import type { CardData } from '../types.js';
import { cardLabel, SUIT_STYLES } from '../types.js';
import { SuitShape } from './SuitShape.js';
import { Bonhomme } from './Bonhomme.js';

export type CardSize = 'sm' | 'md' | 'lg';

/**
 * Fluid sizing: cards scale with the viewport (vmin) so the table reads from
 * a TV across the room and still fits a phone. Arcade look: ivory face, 3px
 * ink border, zero-blur hard shadow, Silkscreen rank in the corners, and the
 * suit's geometric mark (never colour alone) centred.
 */
const SIZE_CLASSES: Record<CardSize, string> = {
  sm: 'w-[clamp(2.1rem,5vmin,3.4rem)] text-[clamp(0.55rem,1.3vmin,0.8rem)]',
  md: 'w-[clamp(4.4rem,12vmin,9rem)] text-[clamp(0.95rem,2.3vmin,1.7rem)]',
  lg: 'w-[clamp(6rem,15vmin,12rem)] text-[clamp(1rem,2.6vmin,2rem)]',
};

export interface PlayingCardProps {
  readonly card: CardData;
  readonly size?: CardSize;
  readonly faceDown?: boolean;
  readonly raised?: boolean;
  readonly dimmed?: boolean;
  /** The Coach's suggested card — draws a violet ring around it. */
  readonly recommended?: boolean;
  /** Queued to auto-play next turn — draws a gold ring around it. */
  readonly queued?: boolean;
  /** Small deterministic tilt (degrees) for a hand-held look. */
  readonly tilt?: number;
}

export function PlayingCard({
  card,
  size = 'md',
  faceDown = false,
  raised = false,
  dimmed = false,
  recommended = false,
  queued = false,
  tilt = 0,
}: PlayingCardProps) {
  const lang = useLang();
  const { renderers } = useCardSkin();
  if (faceDown) {
    // A skin may print its own back art (e.g. the OG emblem) over the card-face
    // colour; otherwise the default is the striped card-back.
    if (renderers.back !== undefined) {
      return (
        <div
          aria-hidden
          style={tilt !== 0 ? { transform: `rotate(${tilt}deg)` } : undefined}
          className={`${SIZE_CLASSES[size]} grid aspect-5/7 place-items-center overflow-hidden rounded-(--radius-ap-inner) border-[0.14em] border-(--color-ap-ink) bg-(--color-card-face) shadow-(--shadow-ap)`}
        >
          {renderers.back()}
        </div>
      );
    }
    return (
      <div
        aria-hidden
        style={tilt !== 0 ? { transform: `rotate(${tilt}deg)` } : undefined}
        className={`${SIZE_CLASSES[size]} aspect-5/7 rounded-(--radius-ap-inner) shadow-(--shadow-ap) border-[0.14em] border-(--color-ap-ink) bg-(--color-card-back) bg-[repeating-linear-gradient(135deg,var(--color-card-back-line)_0_0.22em,transparent_0.22em_0.6em)]`}
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
      aria-label={cardLabel(card, lang)}
      style={tilt !== 0 ? { transform: `rotate(${tilt}deg)` } : undefined}
      className={`relative select-none overflow-hidden ${SIZE_CLASSES[size]} aspect-5/7 rounded-(--radius-ap-inner) border-[0.14em] border-(--color-ap-ink) bg-(--color-card-face) transition-[transform,box-shadow] duration-(--duration-flick) ${
        raised ? 'shadow-(--shadow-ap-lg) -translate-y-2' : 'shadow-(--shadow-ap)'
      } ${
        queued
          ? 'outline outline-[0.16em] outline-(--color-ap-gold-deep) outline-offset-[0.12em]'
          : recommended
            ? 'outline outline-[0.16em] outline-(--color-ap-violet) outline-offset-[0.12em]'
            : ''
      } ${dimmed ? 'scale-[0.94] saturate-[0.7]' : ''}`}
    >
      {/* Corner ranks — Silkscreen numerals in the suit colour. */}
      <span
        className="absolute top-[5%] left-[7%] font-arcade-display leading-none tabular-nums text-[1.05em]"
        style={{ color: suit.color }}
      >
        {card.value}
      </span>
      <span
        className="absolute bottom-[5%] right-[7%] rotate-180 font-arcade-display leading-none tabular-nums text-[1.05em]"
        style={{ color: suit.color }}
      >
        {card.value}
      </span>

      {/* Centre mark: a card skin may override it; the default gives the two
          specials their OG bonhomme and everyone else the geometric suit shape.
          The bonhomme cards also carry a small suit shape beneath the figure so
          the suit stays identifiable even in a low-colour skin (e.g. noir). */}
      <span className="absolute inset-0 grid place-items-center">
        {renderers.centerMark ? (
          renderers.centerMark(card, '2em')
        ) : isRedZero || isBrownZero ? (
          <span className="flex flex-col items-center gap-[0.12em]">
            <Bonhomme kind={isRedZero ? 'joffre' : 'allemagne'} size="2.6em" />
            <SuitShape suit={card.suit} size="0.62em" />
          </span>
        ) : (
          <SuitShape suit={card.suit} size="2em" />
        )}
      </span>

      {/* Special tokens: red 0 = +5 (ok), brown 0 = −2 (dark red). Top-right,
          mirroring the rank corner, so the bonhomme keeps the centre. */}
      {bonus !== null && size !== 'sm' && (
        <span
          className={`absolute top-[4%] right-[5%] rounded-full border-[0.12em] border-(--color-ap-ink) px-[0.5em] py-[0.06em] font-arcade-display text-[0.72em] leading-none shadow-(--shadow-ap-sm) ${
            isRedZero ? 'bg-(--color-ap-ok) text-(--color-ap-ink)' : 'bg-[#7a2230] text-white'
          }`}
        >
          {bonus}
        </span>
      )}

      {/* Not playable now: sink the card into the felt (skin-adaptive) so it
          reads "parked" but stays crisp and legible. */}
      {dimmed && <span aria-hidden className="absolute inset-0 bg-(--color-felt-950)/45" />}
    </div>
  );
}
