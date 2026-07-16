import { useGameStore } from '../state/gameStore.js';

/**
 * A fixed top-center banner shown while the socket is down and retrying.
 * Online rooms only (practice mode has no socket). The Lobby shows its own
 * connection line; this covers the in-game table, which otherwise gave no
 * sign your own connection had dropped.
 */
export function ConnectionBanner() {
  const connection = useGameStore((s) => s.connection);
  if (connection !== 'reconnecting') return null;
  return (
    <div
      data-testid="connection-banner"
      role="status"
      className="fixed top-2 left-1/2 z-[55] -translate-x-1/2 rounded-full border border-(--color-danger)/50 bg-black/85 px-4 py-1.5 text-sm font-semibold text-white shadow-(--shadow-panel)"
    >
      <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-(--color-danger)" />
      Reconnecting…
    </div>
  );
}
