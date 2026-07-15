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
      {/* Lamplight pool behind the fan. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-[6vmin] mx-auto h-[38vmin] max-h-72 w-[70vmin] max-w-xl rounded-full bg-[radial-gradient(closest-side,var(--color-lamplight),transparent_70%)] opacity-15"
      />

      <div
        aria-hidden
        className="pointer-events-none relative h-[clamp(6.5rem,17vmin,12.5rem)] w-full"
      >
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

      <h1 className="relative z-10 -mt-[clamp(1.6rem,4.5vmin,3.2rem)] font-display text-[clamp(3.75rem,11vmin,7rem)] leading-none font-semibold tracking-tight text-(--color-lamplight) drop-shadow-[0_2px_0_rgb(0_0_0/0.35)] [text-shadow:0_0.03em_24px_rgb(0_0_0/0.45)]">
        Jaffre
      </h1>
      <p className="relative z-10 mt-2 max-w-md text-center text-[clamp(0.8rem,1.8vmin,1rem)] text-(--color-ivory)/65">
        Trick-taking for four. Bid, land the contract, first team to 41.
      </p>
    </header>
  );
}
