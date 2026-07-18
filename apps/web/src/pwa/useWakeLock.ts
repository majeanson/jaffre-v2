import { useEffect } from 'react';

/**
 * Keep the screen awake while mounted (the table): a player thinking through a
 * bid shouldn't come back to a locked phone and a timed-out seat. The lock is
 * released by the OS on tab hide, so re-acquire on visibilitychange. Silently
 * a no-op where unsupported (older Safari) or denied (low battery).
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;

    const acquire = () => {
      if (!live || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (live) lock = l;
          else void l.release();
        },
        () => {},
      );
    };

    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, []);
}
