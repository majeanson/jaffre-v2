import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The app has one fixed bottom-center toast position shared by independent
 * components (SW-update toast, iOS install card, transient status toasts).
 * They mount in different subtrees, so without coordination they render on
 * the same pixels. This registry lets each claimant ask "am I the one that
 * should show right now?" — highest priority wins, the rest stay hidden
 * until the slot frees up.
 */
export const SLOT_INSTALL = 3; // user-initiated dialog — hiding it would read as a dead tap
export const SLOT_UPDATE = 2;
export const SLOT_STATUS = 1;

const active = new Map<symbol, number>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Claim the bottom toast slot while `wants` is true. Returns true when this
 * claimant currently outranks every other active claimant — only then should
 * it render. Equal priorities all show (they are user-triggered one-offs that
 * can't realistically coincide).
 */
export function useBottomSlot(priority: number, wants: boolean): boolean {
  const keyRef = useRef<symbol | null>(null);
  if (keyRef.current === null) keyRef.current = Symbol('bottom-slot');
  const key = keyRef.current;

  useEffect(() => {
    if (!wants) return undefined;
    active.set(key, priority);
    emit();
    return () => {
      active.delete(key);
      emit();
    };
  }, [key, priority, wants]);

  return useSyncExternalStore(subscribe, () => {
    if (!wants) return false;
    for (const [k, p] of active) {
      if (k !== key && p > priority) return false;
    }
    return true;
  });
}
