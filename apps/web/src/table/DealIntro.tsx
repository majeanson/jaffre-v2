import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PlayingCard } from '@jaffre/ui';

/** How long the fly-out itself takes before the layer starts fading. */
const DEAL_MS = 1700;
/** The fade-to-nothing tail after the cards land. */
const FADE_MS = 350;
/** Cards dealt toward each seat — just enough to read as "a hand", not the
 * real count (that's redacted game state the deck has no business showing). */
const CARDS_PER_SEAT = 3;

/** A face-down card, always the same rank — its BACK is all that's ever shown,
 * so which card it "is" is irrelevant. */
const BACK_CARD = { suit: 'red', value: 0 } as const;

/**
 * Fly-out targets, one per table-relative seat (0 = you/bottom, 1 = left,
 * 2 = top, 3 = right). These are eyeballed directional offsets toward each
 * rim of the felt — NOT measured SeatChip DOM positions, matching the idiom
 * AttractMode's ghost trick already uses. The deck itself sits top-left, so
 * "up" and "left" are short hops and "down"/"right" are long ones.
 */
const TARGETS: Record<0 | 1 | 2 | 3, readonly [string, string]> = {
  0: ['4vmin', '48vmin'],
  1: ['-8vmin', '22vmin'],
  2: ['26vmin', '2vmin'],
  3: ['46vmin', '20vmin'],
};

const KEYFRAMES = `
@keyframes deal-fly {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  62%, 100% { transform: translate(var(--dtx), var(--dty)) rotate(var(--dtr)); opacity: 1; }
}
`;

type Phase = 'idle' | 'dealing' | 'fading';

/**
 * Replaces the old persistent OpponentFan: instead of a face-down fan sitting
 * behind every seat chip all game (blocking the chips and the felt), a small
 * deck sits top-left and "deals" once — a brief fly-out toward all four seats
 * — at the START of each round, then disappears entirely for the rest of
 * play. Purely decorative: the viewer's own card-skin BACK is what's shown
 * (cosmetics are per-viewer, like the felt), same as the fan used to.
 */
export function DealIntro({ roundIndex }: { readonly roundIndex: number }) {
  const prevRound = useRef<number | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    const isFirstMount = prevRound.current === undefined;
    const changed = prevRound.current !== roundIndex;
    prevRound.current = roundIndex;
    // A mid-game reload or a spectator joining mid-round mounts this with no
    // prior roundIndex to compare against — the deal for the round already
    // happened before we were here, so don't replay it. Only an OBSERVED
    // transition (this component alive across the change) triggers the
    // animation. roundIndex (not phase) is the signal: it increments exactly
    // once per round, at the moment a new deal happens, regardless of how
    // bidding/playing phases cycle within it.
    if (isFirstMount || !changed) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setPhase('dealing');
    const toFade = window.setTimeout(() => setPhase('fading'), DEAL_MS);
    const toIdle = window.setTimeout(() => setPhase('idle'), DEAL_MS + FADE_MS);
    return () => {
      window.clearTimeout(toFade);
      window.clearTimeout(toIdle);
    };
  }, [roundIndex]);

  if (phase === 'idle') return null;

  const seats = [0, 1, 2, 3] as const;

  return (
    <div
      aria-hidden
      data-testid="deal-intro"
      className={`pointer-events-none absolute inset-0 z-30 transition-opacity duration-[350ms] ${
        phase === 'fading' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <style>{KEYFRAMES}</style>
      {/* The deck itself: a few stacked face-down cards, top-left inside the
          felt oval, clear of the top seat chip which is centered. */}
      <div className="absolute top-[6%] left-[4%] max-sm:top-[8%] max-sm:left-[3%]">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: `${String(i * 0.12)}rem`, top: `${String(i * -0.12)}rem` }}
          >
            <PlayingCard card={BACK_CARD} size="sm" faceDown />
          </div>
        ))}
      </div>
      {/* The fly-out: a handful of cards per seat, staggered, arcing from the
          deck's corner out toward that seat's edge of the felt. */}
      {seats.flatMap((seat) =>
        Array.from({ length: CARDS_PER_SEAT }, (_, i) => {
          const [tx, ty] = TARGETS[seat];
          const delay = (seat * CARDS_PER_SEAT + i) * 0.09;
          return (
            <div
              key={`${String(seat)}-${String(i)}`}
              className="absolute top-[8%] left-[5%] max-sm:top-[10%] max-sm:left-[4%]"
              style={
                {
                  '--dtx': tx,
                  '--dty': ty,
                  '--dtr': `${String((i - 1) * 10 + seat * 3)}deg`,
                  opacity: 0,
                  animation: `deal-fly 0.75s ease-out ${String(delay)}s 1 both`,
                } as CSSProperties
              }
            >
              <PlayingCard card={BACK_CARD} size="sm" faceDown />
            </div>
          );
        }),
      )}
    </div>
  );
}
