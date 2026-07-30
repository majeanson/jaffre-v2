import { useLang, type Lang } from '@jaffre/ui';
import { reconnectAttempts } from '../net/socket.js';
import { useGameStore } from '../state/gameStore.js';

const T: Record<Lang, { reconnecting: string; lost: string; backToMenu: string }> = {
  en: {
    reconnecting: 'Reconnecting…',
    lost: 'Connection lost — retrying…',
    backToMenu: 'Back to menu',
  },
  fr: {
    reconnecting: 'Reconnexion…',
    lost: 'Connexion perdue — nouvelle tentative…',
    backToMenu: 'Retour au menu',
  },
};

/** Attempts past which "still retrying" stops reading as a blip and starts
 * reading as stuck — mirrors socket.ts's own reconnect-loop beacon threshold,
 * so the player is offered a way out at the same point the app itself starts
 * treating the streak as worth knowing about. */
const STUCK_ATTEMPTS = 5;

/**
 * A fixed banner shown while the socket is down and retrying — or, past
 * enough failed attempts, plainly closed. Online rooms only (practice mode
 * has no socket). The Lobby shows its own connection line; this covers the
 * in-game table, which otherwise gave no sign your own connection had
 * dropped. It floats in the upper felt, below the score strip and the turn
 * indicator, so it never sits on top of the HUD score readout. z sits above
 * the round-summary wait screen (reconnecting matters most while everyone is
 * waiting) but below the z-50+ sheets, whose own surfaces — and the expanded
 * score popover — would otherwise be overlapped at this offset.
 */
export function ConnectionBanner({ inline = false }: { readonly inline?: boolean }) {
  const t = T[useLang()];
  const connection = useGameStore((s) => s.connection);
  if (connection !== 'reconnecting' && connection !== 'closed') return null;
  const stuck = reconnectAttempts() > STUCK_ATTEMPTS;
  return (
    <div
      data-testid="connection-banner"
      role="status"
      className={`flex items-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-danger) bg-(--color-ap-ink) px-4 py-1.5 font-arcade-ui text-sm font-semibold text-white shadow-(--shadow-ap) ${
        inline
          ? 'self-center'
          : 'fixed top-[calc(9rem+env(safe-area-inset-top))] left-1/2 z-[48] -translate-x-1/2'
      }`}
    >
      <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-(--color-ap-danger)" />
      {connection === 'closed' ? t.lost : t.reconnecting}
      {stuck && (
        <button
          type="button"
          onClick={() => {
            location.hash = '';
          }}
          className="ml-1 underline decoration-white/50 underline-offset-2 hover:decoration-white"
        >
          {t.backToMenu}
        </button>
      )}
    </div>
  );
}
