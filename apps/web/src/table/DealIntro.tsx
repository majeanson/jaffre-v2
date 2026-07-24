import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
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
 * FALLBACK fly-out targets, one per table-relative seat (0 = you/bottom,
 * 1 = left, 2 = top, 3 = right) — eyeballed directional offsets toward each
 * rim of the felt. The real targets are MEASURED from the live seat-chip DOM
 * (`[data-deal-target]` anchors on the Stage wrappers + your UtilityRow chip)
 * so the cards land exactly on the avatars; these directions only cover a
 * missing anchor (e.g. spectating, where "your" chip doesn't render).
 */
const FALLBACK_TARGETS: Record<0 | 1 | 2 | 3, readonly [string, string]> = {
  0: ['4vmin', '48vmin'],
  1: ['-8vmin', '22vmin'],
  2: ['26vmin', '2vmin'],
  3: ['46vmin', '20vmin'],
};

/** The measured px offset from the deck to each seat's avatar (chip centre). */
type Targets = Record<0 | 1 | 2 | 3, readonly [string, string]>;

/** Deck → avatar offsets, measured from the live DOM. The chips live in two
 * different containers (opponents on the Stage rim, your own chip down in the
 * UtilityRow), so viewport rects are the one common coordinate space. */
function measureTargets(deck: HTMLElement): Targets {
  const origin = deck.getBoundingClientRect();
  const out: Partial<Record<0 | 1 | 2 | 3, readonly [string, string]>> = {};
  for (const seat of [0, 1, 2, 3] as const) {
    const chip = document.querySelector(`[data-deal-target="${String(seat)}"]`);
    const rect = chip?.getBoundingClientRect();
    // A zero-size rect means the anchor exists but renders nothing (e.g. a
    // spectator's empty "you" slot) — fall back to the directional guess.
    if (rect === undefined || rect.width === 0) {
      out[seat] = FALLBACK_TARGETS[seat];
      continue;
    }
    const dx = rect.left + rect.width / 2 - (origin.left + origin.width / 2);
    const dy = rect.top + rect.height / 2 - (origin.top + origin.height / 2);
    out[seat] = [`${String(Math.round(dx))}px`, `${String(Math.round(dy))}px`];
  }
  return out as Targets;
}

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
  const deckRef = useRef<HTMLDivElement>(null);
  const [targets, setTargets] = useState<Targets>(FALLBACK_TARGETS);

  // Measure where the avatars ACTUALLY are the moment the deal starts — the
  // deck renders in the same commit that flips the phase, so a layout effect
  // can read both rects before the browser paints the first frame.
  useLayoutEffect(() => {
    if (phase !== 'dealing') return;
    const deck = deckRef.current;
    if (deck !== null) setTargets(measureTargets(deck));
  }, [phase]);

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
      <div ref={deckRef} className="absolute top-[6%] left-[4%] max-sm:top-[8%] max-sm:left-[3%]">
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
          const [tx, ty] = targets[seat];
          const delay = (seat * CARDS_PER_SEAT + i) * 0.09;
          return (
            <div
              key={`${String(seat)}-${String(i)}`}
              // Same anchor as the deck itself — the measured offsets are
              // deck-centre → chip-centre, so the flight starts where they do.
              className="absolute top-[6%] left-[4%] max-sm:top-[8%] max-sm:left-[3%]"
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
