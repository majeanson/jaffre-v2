import { createContext, useContext, type ReactNode } from 'react';

/**
 * Trick-sweep variants — a cosmetic axis made of MOTION rather than tokens.
 *
 * When a trick resolves, the four cards leave the felt toward whoever took it.
 * That happens eight times a hand, and until now there was exactly one way it
 * could look. A sweep variant changes the departure without touching what a
 * card IS, so it composes freely with every card skin, felt and theme.
 *
 * Deliberately NOT a `[data-*]` token block like the other axes: there are no
 * colours here, only a target transform and a transition. It rides a context
 * provided ABOVE every animated card (exactly like CardSkinProvider), so
 * swapping one re-renders in place and never remounts a card mid-flight.
 *
 * THE BUDGET RULE: a variant's animation must finish within
 * `SWEEP_DURATION_S` (TrickArea.tsx). That number is not decorative — the web
 * app's `SWEEP_MS` clears the trick just after it, and both bot pacers are
 * sized to cover hold + sweep. A variant that runs long gets cut off, or worse,
 * still on screen when the next card lands. Stagger and delay count against the
 * budget too: `delay + duration <= 1`, expressed as fractions of it.
 *
 * Reduced motion needs no handling here — `JaffreMotionConfig` sets
 * `reducedMotion="user"`, which zeroes every framer-motion transition,
 * including whatever a variant returns.
 */

/** Table-relative seat position: 0 = bottom (you), 1 = left, 2 = top, 3 = right. */
export type TablePosition = 0 | 1 | 2 | 3;

/** Where each seat's card sits, and how far a sweep throws it. */
const TOWARD: Record<TablePosition, { x: number; y: number }> = {
  0: { x: 0, y: 260 },
  1: { x: -260, y: 0 },
  2: { x: 0, y: -260 },
  3: { x: 260, y: 0 },
};

/** What a variant computes for one card of a resolving trick. */
export interface SweepStep {
  /** The framer-motion `animate` target. */
  readonly animate: Record<string, number>;
  /** Fraction of the total sweep budget this card waits before moving (0–1). */
  readonly delayFraction: number;
  /** Fraction of the total sweep budget this card's motion takes (0–1). */
  readonly durationFraction: number;
  /** Easing curve, as a framer-motion cubic-bezier array. */
  readonly ease: readonly [number, number, number, number];
}

export interface TrickSweepVariant {
  readonly id: string;
  /**
   * @param position the seat this card was played from
   * @param winner   the seat the trick is going to
   * @param index    the card's index within the trick (0–3), for stagger
   */
  readonly step: (position: TablePosition, winner: TablePosition, index: number) => SweepStep;
}

const SNAP = [0.2, 0.9, 0.25, 1] as const;
const GLIDE = [0.33, 0, 0.15, 1] as const;
const DRIFT = [0.4, 0, 0.6, 1] as const;

/**
 * Sweep — the original, and the default. Every card slides to the winner in a
 * tight staggered line. Reads as "that pile is theirs now".
 */
const SWEEP: TrickSweepVariant = {
  id: 'sweep',
  step: (_position, winner, index) => ({
    animate: { ...TOWARD[winner], opacity: 0, scale: 0.85 },
    delayFraction: index * 0.045,
    durationFraction: 0.82,
    ease: SNAP,
  }),
};

/**
 * Fold — the cards gather to the middle of the table first, square up into a
 * pile, then the whole pile leaves as one. The tidy dealer's sweep.
 */
const FOLD: TrickSweepVariant = {
  id: 'fold',
  step: (_position, winner, index) => ({
    animate: {
      x: TOWARD[winner].x * 0.42,
      y: TOWARD[winner].y * 0.42,
      opacity: 0,
      scale: 0.55,
      rotate: 0,
    },
    // The stagger runs BACKWARD (last card played moves first), so the pile
    // squares up in the order it was built.
    delayFraction: (3 - index) * 0.05,
    durationFraction: 0.78,
    ease: GLIDE,
  }),
};

/**
 * Snow-drift — the cards don't slide, they get blown off: a slow drift toward
 * the winner with a lazy tumble, each card carried a little differently.
 */
const SNOW_DRIFT: TrickSweepVariant = {
  id: 'snow-drift',
  step: (position, winner, index) => ({
    animate: {
      x: TOWARD[winner].x * 0.8 + (position % 2 === 0 ? 26 : -26),
      y: TOWARD[winner].y * 0.8 + 40,
      opacity: 0,
      scale: 0.92,
      rotate: index % 2 === 0 ? 22 : -18,
    },
    delayFraction: index * 0.07,
    // The longest variant, but still inside the budget with its stagger:
    // 3 * 0.07 + 0.79 = 1.0 exactly.
    durationFraction: 0.79,
    ease: DRIFT,
  }),
};

/**
 * Riffle — the cards leave ONE AT A TIME, each snapped off hard, like someone
 * raking them in without waiting.
 *
 * The distinguishing feature is the sequence, not the decoration. Classic
 * Sweep moves the whole trick as one slab with a 45ms trickle between cards;
 * this gives each card a fifth of the window to itself, so you read four
 * separate departures instead of one shove. Each flight is short (0.28) and
 * hard-eased, and every card spins the same way as it goes — a flick, not a
 * fan. Without that, a "faster sweep with a tilt" is what it was, and that is
 * not a second gesture.
 */
const RIFFLE: TrickSweepVariant = {
  id: 'riffle',
  step: (_position, winner, index) => ({
    animate: {
      x: TOWARD[winner].x * 1.18,
      y: TOWARD[winner].y * 1.18,
      opacity: 0,
      scale: 0.7,
      // One consistent spin direction: each card is flicked the same way, so
      // the eye reads a repeated action rather than a spreading fan.
      rotate: 52,
    },
    // The whole point: 3 × 0.24 + 0.28 = 1.0 — the last card only starts as the
    // first is long gone, using the entire budget as a sequence.
    delayFraction: index * 0.24,
    durationFraction: 0.28,
    ease: SNAP,
  }),
};

/** Every shipped variant, in catalog order. `sweep` must stay first: it is the
 * default and the fallback for an unknown id. */
export const TRICK_SWEEPS: readonly TrickSweepVariant[] = [SWEEP, FOLD, SNOW_DRIFT, RIFFLE];

export const DEFAULT_TRICK_SWEEP = SWEEP.id;

export function trickSweepById(id: string): TrickSweepVariant {
  return TRICK_SWEEPS.find((v) => v.id === id) ?? SWEEP;
}

const TrickSweepContext = createContext<TrickSweepVariant>(SWEEP);

export function TrickSweepProvider({
  value,
  children,
}: {
  readonly value: TrickSweepVariant;
  readonly children: ReactNode;
}) {
  return <TrickSweepContext.Provider value={value}>{children}</TrickSweepContext.Provider>;
}

export function useTrickSweep(): TrickSweepVariant {
  return useContext(TrickSweepContext);
}
