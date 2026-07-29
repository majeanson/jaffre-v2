import { useEffect, useRef, useState } from 'react';
import { paced } from './pacePref.js';

/** Gap between two flights leaving the deck — the round-robin's cadence.
 * 32 real cards leave now, so each step is brisk: the whole unwind rides
 * this one number. */
export const DEAL_STEP_MS = 55;
/** A beat with the FULL stack on screen before the first card peels off —
 * without it the deck starts emptying on its very first painted frame and
 * "a big stack was dealt out" never reads. */
export const DEAL_LEAD_MS = 250;
/** One card's flight time, deck to seat (DealIntro's `deal-fly` keyframes). */
export const FLIGHT_MS = 500;
/** The flight holds "arrived" from its 70% keyframe onward — so a card
 * visually lands at 0.5 * 0.7 = 0.35s into its own flight, not at
 * flight-start or -end. */
export const ARRIVE_MS = 350;

/** Dealing order: the rim before you, every pass — like a real deal going
 * around the table (seat 0 is always dealt to last). */
export const DEAL_ORDER = [1, 2, 3, 0] as const;
type Seat = 0 | 1 | 2 | 3;

function orderIndex(seat: Seat): number {
  return DEAL_ORDER.indexOf(seat);
}

/** Every seat's real deal — 8 cards each. Public knowledge (the round always
 * opens with full hands), so the deck can honestly show all of it. */
export const HAND_SIZE = 8;
/** The whole deck: what the stack starts at, and what flies out of it. */
export const DECK_SIZE = HAND_SIZE * DEAL_ORDER.length;

/** Which departure slot (0 = first card off the top of the deck) flight `i`
 * toward `seat` occupies: a plain round-robin — pass `i` fills slots
 * i*4..i*4+3 in DEAL_ORDER, one card per seat per pass, DECK_SIZE slots for
 * the whole deck. DealIntro also reads this as stack position: slot 0 IS the
 * top card. */
export function flightSlot(seat: Seat, i: number): number {
  return i * DEAL_ORDER.length + orderIndex(seat);
}

/**
 * When flight `i` toward `seat` leaves the deck, in ms, UNSCALED — callers
 * apply `paced()`/`paceScale()` themselves so this stays the one shared
 * clock.
 */
export function flightDelayMs(seat: Seat, i: number): number {
  return DEAL_LEAD_MS + flightSlot(seat, i) * DEAL_STEP_MS;
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
export const DEAL_TOTAL_MS = fanShowMs(HAND_SIZE - 1) + 100;

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
