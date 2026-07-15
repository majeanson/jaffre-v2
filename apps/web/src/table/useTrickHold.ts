import { useEffect } from 'react';
import { toPosition, useGameStore } from '../state/gameStore.js';

/** How long a finished trick stays face-up before sweeping to the winner. */
export const TRICK_HOLD_MS = 1600;
/** How long the sweep animation runs before the trick is cleared. */
export const SWEEP_MS = 600;

/** Hold a finished trick on the table, then sweep it toward the winner. */
export function useTrickHold(): void {
  const heldTrick = useGameStore((s) => s.heldTrick);
  useEffect(() => {
    if (heldTrick === null) return undefined;
    const store = useGameStore.getState();
    const t1 = setTimeout(
      () => store.setSweep(toPosition(heldTrick.winner, store.viewer)),
      TRICK_HOLD_MS,
    );
    const t2 = setTimeout(() => store.clearHeldTrick(), TRICK_HOLD_MS + SWEEP_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [heldTrick]);
}
