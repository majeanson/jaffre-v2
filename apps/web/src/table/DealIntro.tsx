import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { PlayingCard } from '@jaffre/ui';
import { paceScale, paced } from './pacePref.js';
import {
  DEAL_TOTAL_MS,
  DECK_SIZE,
  FLIGHT_MS,
  HAND_SIZE,
  flightDelayMs,
  flightSlot,
} from './dealPace.js';

/** How long the fly-out itself takes before the layer starts fading — the
 * shared deal clock (see dealPace), so the hand and the auction agree. */
const DEAL_MS = DEAL_TOTAL_MS;
/** The fade-to-nothing tail after the cards land. */
const FADE_MS = 350;

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

/** Every card is BOTH a layer of the stack and a flight: `both` fill holds it
 * at the 0% frame (its resting spot in the stack) until its own delay, then it
 * peels off and flies — so the stack visibly shrinks one card per departure
 * and is simply gone when the last card leaves. Arrival is the 70% keyframe
 * (dealPace.ARRIVE_MS = FLIGHT_MS * 0.7 — keep them in step). Cards to the
 * rim hold where they land, a little pile at each avatar; cards to YOUR seat
 * dissolve the instant they arrive, because that same instant the real card
 * pops into your fan below (PlayerHand reads the same clock) — the flight
 * "becomes" the card in your hand instead of piling on top of it. */
const KEYFRAMES = `
@keyframes deal-fly {
  0% { transform: translate(var(--sx), var(--sy)) rotate(var(--sr)); opacity: 1; }
  70%, 100% { transform: translate(var(--dtx), var(--dty)) rotate(var(--dtr)); opacity: 1; }
}
@keyframes deal-fly-merge {
  0% { transform: translate(var(--sx), var(--sy)) rotate(var(--sr)); opacity: 1; }
  70% { transform: translate(var(--dtx), var(--dty)) rotate(var(--dtr)); opacity: 1; }
  100% { transform: translate(var(--dtx), var(--dty)) rotate(var(--dtr)); opacity: 0; }
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
export function DealIntro({ dealKey }: { readonly dealKey: number }) {
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
    // dealPace owns the decision (which deals animate, and when) — this
    // component only draws one. dealKey 0 means no deal has run yet.
    if (dealKey === 0) return;
    setPhase('dealing');
    const dealMs = paced(DEAL_MS);
    const toFade = window.setTimeout(() => setPhase('fading'), dealMs);
    const toIdle = window.setTimeout(() => setPhase('idle'), dealMs + paced(FADE_MS));
    return () => {
      window.clearTimeout(toFade);
      window.clearTimeout(toIdle);
    };
  }, [dealKey]);

  if (phase === 'idle') return null;

  const seats = [0, 1, 2, 3] as const;

  return (
    <div
      aria-hidden
      data-testid="deal-intro"
      className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-[350ms] ${
        phase === 'fading' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <style>{KEYFRAMES}</style>
      {/* The whole deck, top-left inside the felt oval, clear of the centered
          top seat chip. All 32 cards render up front as one thick stack; each
          card holds its stack spot until its own departure slot, then flies
          (see KEYFRAMES) — the stack thins one card per flight and is simply
          gone when the last card leaves. Delays come from dealPace's single
          schedule — the same one your fan below reads — so a card's flight
          and its arrival in the fan are one event. */}
      <div ref={deckRef} className="absolute top-[6%] left-[4%] max-sm:top-[8%] max-sm:left-[3%]">
        {seats.flatMap((seat) =>
          Array.from({ length: HAND_SIZE }, (_, i) => {
            const [tx, ty] = targets[seat];
            // Stagger and flight time ride the same scale as the phase timers
            // above, so the animation still finishes inside its own window.
            const scale = paceScale();
            const slot = flightSlot(seat, i);
            const delay = (flightDelayMs(seat, i) / 1000) * scale;
            // Slot 0 deals first, off the TOP: depth counts up from the
            // bottom of the pile, and z falls with slot so the pile paints
            // top card over the rest.
            const depth = DECK_SIZE - 1 - slot;
            // Landing spread: dead-centre landings would stack all 8 cards
            // into what reads as ONE card — a small sideways fan per flight
            // makes the pile at each seat legibly "a hand of cards".
            const fan = i - (HAND_SIZE - 1) / 2;
            return (
              <div
                key={`${String(seat)}-${String(i)}`}
                className="absolute top-0 left-0"
                style={
                  {
                    // The card's resting spot in the stack: a nudge up and
                    // right per card of depth gives the pile its thickness,
                    // and a touch of deterministic jitter keeps it looking
                    // squared by hand rather than machined.
                    '--sx': `${String(depth * 0.016)}rem`,
                    '--sy': `${String(depth * -0.045)}rem`,
                    '--sr': `${String((((slot * 13) % 7) - 3) * 0.6)}deg`,
                    '--dtx': `calc(${tx} + ${String(fan * 0.34)}rem)`,
                    '--dty': ty,
                    // The fan's rotation ramp, plus a light per-seat lean —
                    // landed hands read as fanned cards, not a machined row.
                    '--dtr': `${String(fan * 5 + seat * 2)}deg`,
                    zIndex: DECK_SIZE - slot,
                    animation: `${seat === 0 ? 'deal-fly-merge' : 'deal-fly'} ${String(
                      (FLIGHT_MS / 1000) * scale,
                    )}s cubic-bezier(0.2, 0.7, 0.3, 1) ${String(delay)}s 1 both`,
                  } as CSSProperties
                }
              >
                <PlayingCard card={BACK_CARD} size="sm" faceDown />
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
