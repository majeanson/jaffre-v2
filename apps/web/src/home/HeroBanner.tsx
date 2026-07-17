import { PlayingCard, type CardData } from '@jaffre/ui';
import type { CSSProperties } from 'react';

/** The fan behind the wordmark: both special zeros framed by high cards. */
const FAN: readonly { readonly card: CardData; readonly faceDown?: boolean }[] = [
  { card: { suit: 'blue', value: 7 }, faceDown: true },
  { card: { suit: 'green', value: 7 } },
  { card: { suit: 'red', value: 0 } },
  { card: { suit: 'blue', value: 7 } },
  { card: { suit: 'brown', value: 0 } },
];

/**
 * Title-screen brand moment: a hand of cards dealt in behind the Jaffre
 * wordmark. Purely decorative (aria-hidden); the stagger uses the shared
 * deal-in utility, so reduced-motion users simply see the finished fan.
 */
export function HeroBanner() {
  return (
    <header className="relative flex w-full flex-col items-center">
      {/* Violet spotlight behind the fan. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-[5vmin] mx-auto h-[32vmin] max-h-60 w-[64vmin] max-w-lg rounded-full bg-[radial-gradient(closest-side,var(--color-ap-violet-soft),transparent_70%)] opacity-20"
      />

      <div aria-hidden className="pointer-events-none relative h-[clamp(5rem,13vmin,9rem)] w-full">
        {FAN.map(({ card, faceDown }, i) => {
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
              <span className="deal-in block" style={{ '--deal-i': i } as CSSProperties}>
                <PlayingCard card={card} faceDown={faceDown ?? false} />
              </span>
            </span>
          );
        })}
      </div>

      <h1 className="relative z-10 -mt-[clamp(0.15rem,1.4vmin,0.8rem)] font-arcade-display text-[clamp(2.4rem,7.5vmin,4.5rem)] leading-none tracking-tight text-(--color-ap-gold) drop-shadow-[3px_3px_0_var(--color-ap-ink)]">
        Jaffre
      </h1>
    </header>
  );
}
