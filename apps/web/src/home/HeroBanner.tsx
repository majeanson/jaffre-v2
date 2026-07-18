import { PlayingCard, type CardData } from '@jaffre/ui';
import type { CSSProperties } from 'react';

/** The fan behind the wordmark: YOUR card leads, then both special zeros
 * framed by high cards. `you: true` marks the slot the identity card fills. */
const FAN: readonly { readonly card?: CardData; readonly you?: boolean }[] = [
  { you: true },
  { card: { suit: 'green', value: 7 } },
  { card: { suit: 'red', value: 0 } },
  { card: { suit: 'blue', value: 7 } },
  { card: { suit: 'brown', value: 0 } },
];

/** Your identity card, dealt into the brand fan: your colour as the face,
 * your paint strokes over it, your initial in the corner — the same recipe as
 * the big PlayerCard, at PlayingCard scale. Purely decorative (the fan is
 * aria-hidden), so it's a styled span, not a second PlayerCard. */
function YourFanCard({
  name,
  color,
  paint,
}: {
  name: string;
  color: string | null;
  paint: string | null;
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      className="relative block aspect-5/7 w-[clamp(4.4rem,12vmin,9rem)] overflow-hidden rounded-(--radius-ap-inner) border-[0.14em] border-(--color-ap-ink) text-[clamp(0.95rem,2.3vmin,1.7rem)] shadow-(--shadow-ap)"
      style={{ background: color ?? 'var(--color-ap-violet)' }}
    >
      {paint !== null && paint !== '' && (
        <span
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${paint})` }}
        />
      )}
      <span className="absolute top-[5%] left-[9%] font-arcade-display text-[1.05em] leading-none text-(--color-ap-ink)">
        {initial}
      </span>
    </span>
  );
}

export interface HeroBannerProps {
  /** The viewer's identity — their card gets dealt into the fan. */
  readonly name?: string;
  readonly color?: string | null;
  readonly paint?: string | null;
}

/**
 * Title-screen brand moment: a hand of cards dealt in behind the Jaffre
 * wordmark — with YOUR card (colour, paint, initial) leading the fan, so the
 * brand moment is also a mirror. Purely decorative (aria-hidden); the stagger
 * uses the shared deal-in utility, so reduced-motion users simply see the
 * finished fan.
 */
export function HeroBanner({ name = 'Player', color = null, paint = null }: HeroBannerProps) {
  return (
    <header className="relative flex w-full flex-col items-center">
      {/* Violet spotlight behind the fan. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-[5vmin] mx-auto h-[32vmin] max-h-60 w-[64vmin] max-w-lg rounded-full bg-[radial-gradient(closest-side,var(--color-ap-violet-soft),transparent_70%)] opacity-20"
      />

      <div aria-hidden className="pointer-events-none relative h-[clamp(5rem,13vmin,9rem)] w-full">
        {FAN.map(({ card, you }, i) => {
          const step = i - (FAN.length - 1) / 2;
          return (
            <span
              key={i}
              className="absolute bottom-0 left-1/2"
              style={{
                transform: `translateX(calc(-50% + ${step} * clamp(2rem, 5.5vmin, 4.2rem))) translateY(calc(${Math.abs(step)} * clamp(0.35rem, 1.1vmin, 0.8rem))) rotate(${step * 10}deg)`,
                transformOrigin: '50% 130%',
                zIndex: 10 - Math.abs(step) * 2,
              }}
            >
              <span className="deal-in relative block" style={{ '--deal-i': i } as CSSProperties}>
                {you === true ? (
                  <YourFanCard name={name} color={color} paint={paint} />
                ) : (
                  card !== undefined && <PlayingCard card={card} />
                )}
              </span>
            </span>
          );
        })}
      </div>

      {/* The wordmark is the title screen's highlight — bigger than anything
          below it now that the identity card starts small. */}
      <h1 className="relative z-10 -mt-[clamp(0.15rem,1.4vmin,0.8rem)] font-arcade-display text-[clamp(3.2rem,11vmin,6rem)] leading-none tracking-tight text-(--color-ap-gold) drop-shadow-[4px_4px_0_var(--color-ap-ink)]">
        Jaffre
      </h1>
    </header>
  );
}
