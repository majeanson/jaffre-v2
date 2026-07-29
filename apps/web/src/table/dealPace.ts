import { useEffect, useRef, useState } from 'react';
import { paced } from './pacePref.js';

/** Gap between two flights leaving the deck — the round-robin's cadence. */
export const DEAL_STEP_MS = 70;
/** A flight is a 0.75s ease-out (DealIntro's `deal-fly` keyframes), holding
 * "arrived" from the 62% keyframe onward — so a card visually lands at
 * 0.75 * 0.62 = 0.465s into its own flight, not at flight-start or -end. */
export const ARRIVE_MS = 465;

/** Dealing order: the rim before you, every pass — like a real deal going
 * around the table (seat 0 is always dealt to last). */
const DEAL_ORDER = [1, 2, 3, 0] as const;
type Seat = 0 | 1 | 2 | 3;

function orderIndex(seat: Seat): number {
  return DEAL_ORDER.indexOf(seat);
}

/** Flights per rim seat (visual shorthand, not the real hand size) and per
 * your own seat (the real count — your fan has to end up with 8 cards). */
export const RIM_FLIGHTS = 3;
export const YOUR_FLIGHTS = 8;

/**
 * When flight `i` toward `seat` leaves the deck, in ms, UNSCALED — callers
 * apply `paced()`/`paceScale()` themselves so this stays the one shared
 * clock. The rim gets 3 round-robin passes (slot = pass*4 + this seat's
 * order in the pass); your remaining 5 cards (i = 3..7) just keep going at
 * the same cadence once the rim is done, in slots 12..16.
 */
export function flightDelayMs(seat: Seat, i: number): number {
  const slot =
    seat === 0 && i >= RIM_FLIGHTS
      ? RIM_FLIGHTS * DEAL_ORDER.length + (i - RIM_FLIGHTS)
      : i * DEAL_ORDER.length + orderIndex(seat);
  return slot * DEAL_STEP_MS;
}

/** Your fan card `i` appears the instant its own flight arrives — not before
 * (nothing to show yet) and not later (the card would sit there unclaimed
 * while a flight that's already landed waits on it). */
export function fanShowMs(i: number): number {
  return flightDelayMs(0, i) + ARRIVE_MS;
}

/** The whole deal, start to last card settled, plus a short tail so the deck
 * itself doesn't vanish the instant the last card lands. Everything that
 * gates on "is a deal still happening" — the fly-out's own fade, your fan's
 * fill, and the auction (see localGame.ts#scheduleBots) — reads this one
 * number, so all three agree on when the deal is actually over. */
export const DEAL_TOTAL_MS = fanShowMs(YOUR_FLIGHTS - 1) + 100;

export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export interface DealRun {
  /** Bumped once per animated deal; 0 until the first one runs. Use it as the
   * effect dependency that (re)starts a deal-driven animation. */
  readonly dealKey: number;
  /** True while that deal is still in the air — the auction waits on it. */
  readonly dealing: boolean;
}

/** The Date.now()-comparable timestamp the deal currently in flight finishes,
 * or 0 when none is. Module-level rather than store state: only local bots
 * (localGame.ts#scheduleBots) read it, and they aren't React — a plain
 * variable set from useDealRun is the cheapest way to hand it across. Never
 * set by reduced motion, scenes, or replay (none of them animate a deal), so
 * their timing — and e2e specs outside chromium-motion — is untouched. */
let activeUntil = 0;

/** See `activeUntil`: 0 means no deal is currently in the air. */
export function dealActiveUntil(): number {
  return activeUntil;
}

/**
 * The one clock every round-start deal animation runs on: the deck's fly-out
 * (DealIntro), your hand filling a card at a time (PlayerHand), and the bid
 * panel waiting its turn (Table). Before, only the fly-out had a trigger and
 * it deliberately skipped the FIRST deal — so a new game opened with a full
 * hand and the auction already up, having shown you no deal at all.
 *
 * Two triggers: an OBSERVED roundIndex change (this hook alive across it), and
 * mount on a round nothing has happened in yet (`freshAtMount`) — which is
 * exactly the game's first deal. A mid-round reload passes neither, so it
 * never replays a deal that already happened.
 */
export function useDealRun(roundIndex: number | null, freshAtMount: boolean): DealRun {
  const prevRound = useRef<number | null>(null);
  const [dealKey, setDealKey] = useState(0);
  const [dealing, setDealing] = useState(false);
  // Read only on the first pass — a later flip must not re-trigger a deal.
  const freshRef = useRef(freshAtMount);
  freshRef.current = prevRound.current === null ? freshAtMount : freshRef.current;

  useEffect(() => {
    if (roundIndex === null) return undefined;
    // The first render with a real round is this hook's "mount": only an
    // untouched round (nothing bid, nothing played) is a deal we just missed.
    const first = prevRound.current === null;
    const changed = prevRound.current !== roundIndex;
    prevRound.current = roundIndex;
    if (first ? !freshRef.current : !changed) return undefined;
    if (reducedMotion()) return undefined;
    setDealKey((k) => k + 1);
    setDealing(true);
    const totalMs = paced(DEAL_TOTAL_MS);
    activeUntil = Date.now() + totalMs;
    const done = window.setTimeout(() => setDealing(false), totalMs);
    return () => window.clearTimeout(done);
  }, [roundIndex]);

  return { dealKey, dealing };
}
