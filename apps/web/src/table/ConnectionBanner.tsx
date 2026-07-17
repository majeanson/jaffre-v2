import { useLang, type Lang } from '@jaffre/ui';
import { useGameStore } from '../state/gameStore.js';

const T: Record<Lang, { reconnecting: string }> = {
  en: { reconnecting: 'Reconnecting…' },
  fr: { reconnecting: 'Reconnexion…' },
};

/**
 * A fixed top-center banner shown while the socket is down and retrying.
 * Online rooms only (practice mode has no socket). The Lobby shows its own
 * connection line; this covers the in-game table, which otherwise gave no
 * sign your own connection had dropped.
 */
export function ConnectionBanner() {
  const t = T[useLang()];
  const connection = useGameStore((s) => s.connection);
  if (connection !== 'reconnecting') return null;
  return (
    <div
      data-testid="connection-banner"
      role="status"
      className="fixed top-2 left-1/2 z-[55] -translate-x-1/2 rounded-(--radius-ap-control) border-2 border-(--color-ap-danger) bg-(--color-ap-ink) px-4 py-1.5 font-arcade-ui text-sm font-semibold text-white shadow-(--shadow-ap)"
    >
      <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-(--color-ap-danger)" />
      {t.reconnecting}
    </div>
  );
}
