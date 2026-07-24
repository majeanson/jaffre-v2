import { useEffect, useState } from 'react';

/**
 * Seconds remaining until `deadline` (epoch ms), ticking once a second, or
 * null when there is no deadline. Clamped at 0 — never negative. The interval
 * only runs while a deadline is set, so idle seats cost nothing.
 *
 * Deadlines are SERVER epochs — pass `skewMs` (server clock minus local, see
 * gameStore.clockSkew) so a device clock minutes off doesn't run the count
 * down early or late.
 */
export function useCountdown(deadline: number | null, skewMs = 0): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - (now + skewMs)) / 1000));
}

/** "0:37" from a whole number of seconds. */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}
