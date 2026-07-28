import { useEffect, useRef, useState } from 'react';
import { toPosition, useGameStore } from '../state/gameStore.js';
import { playSweepSound } from '../sweeps.js';
import { paced } from './pacePref.js';

/** How long a finished trick stays face-up before sweeping to the winner. */
export const TRICK_HOLD_MS = 1900;
/**
 * How long the sweep animation runs before the trick is cleared. Must stay
 * ABOVE `SWEEP_DURATION_S` in TrickArea.tsx (900ms) so the clear lands after
 * the animation finishes rather than cutting it off.
 *
 * `TRICK_HOLD_MS + SWEEP_MS` is the window during which no new card may be
 * played, so both bot pacers are sized to cover it: `AFTER_TRICK_MS`
 * (local/localGame.ts) for practice and `TRICK_HOLD_MS` (server GameRoom.ts)
 * for online. Raising either constant here means raising both of those.
 */
export const SWEEP_MS = 960;

/** Same-tab signal that the player tapped the held trick to move on. Exported
 * so practice mode can pull its bot timer in to match (the bots' post-trick
 * pause is sized to clear the full hold + sweep). */
export const SKIP_HOLD_EVENT = 'jaffre:skip-hold';

/**
 * Cut the current trick hold short — the sweep runs immediately instead of
 * after the full pause. Used by the felt's tap-to-continue: after the last
 * trick of a round the recap waits on this hold, and an expert shouldn't have
 * to sit through it.
 */
export function skipTrickHold(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SKIP_HOLD_EVENT));
}

/**
 * Hold a finished trick on the table, then sweep it toward the winner.
 * `frozen` (scene viewer) keeps the held trick on screen indefinitely.
 * Both durations scale with the player's pacing preference, and a skip
 * collapses the hold to zero for the trick that's up right now.
 */
export function useTrickHold(frozen = false): void {
  const heldTrick = useGameStore((s) => s.heldTrick);
  // Re-arming on skip is what makes it safe: the effect's cleanup cancels the
  // in-flight timers, so a stale clear can't land on the NEXT trick's hold.
  const [skipToken, setSkipToken] = useState(0);
  const skippedRef = useRef<unknown>(null);

  useEffect(() => {
    const onSkip = (): void => {
      const store = useGameStore.getState();
      const held = store.heldTrick;
      if (held === null) return;
      // Idempotent per trick. Re-arming on a second tap would cancel the
      // in-flight clear timer and start a FRESH sweep window — so mashing a
      // button labelled "Continue" used to delay the very thing it promises
      // (and, after the last trick, the round summary waiting on it).
      if (skippedRef.current === held) return;
      skippedRef.current = held;
      setSkipToken((n) => n + 1);
    };
    window.addEventListener(SKIP_HOLD_EVENT, onSkip);
    return () => window.removeEventListener(SKIP_HOLD_EVENT, onSkip);
  }, []);

  useEffect(() => {
    if (heldTrick === null || frozen) return undefined;
    const store = useGameStore.getState();
    // Zero only for the exact trick that was skipped — a fresh trick that
    // arrives after a skip gets its normal hold back.
    const hold = skippedRef.current === heldTrick ? 0 : paced(TRICK_HOLD_MS);
    const t1 = setTimeout(() => {
      // Sound and motion start together — the equipped sweep's sound is part
      // of the gesture, not a generic "trick over" beep. No-ops when sound is
      // off or the audio context was never unlocked by a gesture.
      playSweepSound();
      store.setSweep(toPosition(heldTrick.winner, store.viewer));
    }, hold);
    const t2 = setTimeout(() => store.clearHeldTrick(), hold + paced(SWEEP_MS));
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [heldTrick, frozen, skipToken]);
}
