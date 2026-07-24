import { useEffect, useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { useGameStore } from '../state/gameStore.js';
import { TOAST_DWELL_MS } from './toastTiming.js';

const T: Record<Lang, { dismiss: string }> = {
  en: { dismiss: 'Dismiss' },
  fr: { dismiss: 'Fermer' },
};

const AUTO_DISMISS_MS = TOAST_DWELL_MS;

// Module-level claim: NoticeToast is mounted app-wide (App.tsx, above every
// screen) AND still locally in Table.tsx/Lobby.tsx (not this task's files to
// change). Rendering all three would triple the toast. The first instance to
// render claims `claimed`; every other instance renders nothing. App.tsx
// mounts its NoticeToast before AppRoutes and never unmounts it, so in
// practice the app-wide instance wins the claim on first paint and holds it
// for the life of the app — the per-screen instances are inert no-ops.
let claimed = false;

function claimOwnership(): boolean {
  if (claimed) return false;
  claimed = true;
  return true;
}

/**
 * A dismissible toast for transient net-layer notices — mainly server
 * rejections (e.g. "Seat 2 is taken") that would otherwise vanish silently —
 * and, since kind: 'award', award-earned celebrations fired from anywhere in
 * the app. Sits above the hand, below the z-50+ sheets. Common server error
 * `code`s are localized before they ever reach the store (see
 * net/noticeCodes.ts, applied in net/socket.ts); an unmapped code shows the
 * server's raw English message as-is. Award notices are pre-localized by the
 * caller.
 */
export function NoticeToast() {
  const t = T[useLang()];
  const notice = useGameStore((s) => s.notice);
  const clearNotice = useGameStore((s) => s.clearNotice);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!claimOwnership()) return;
    setIsOwner(true);
    return () => {
      claimed = false;
    };
  }, []);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(clearNotice, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice, clearNotice]);

  if (!isOwner || notice === null) return null;
  const isAward = notice.kind === 'award';
  return (
    <div
      data-testid="notice-toast"
      role="status"
      aria-live="polite"
      className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[48] flex -translate-x-1/2 items-center gap-3 rounded-(--radius-ap-control) border-2 bg-(--color-ap-panel) px-4 py-2 font-arcade-ui text-sm shadow-(--shadow-ap) ${
        isAward
          ? 'border-(--color-ap-gold) text-(--color-ap-gold)'
          : 'border-(--color-ap-ink) text-(--color-ap-text)'
      }`}
    >
      <span>
        {isAward ? '🏅 ' : ''}
        {notice.text}
      </span>
      <button
        type="button"
        aria-label={t.dismiss}
        onClick={clearNotice}
        className="shrink-0 text-(--color-ap-muted) hover:text-(--color-ap-text)"
      >
        ✕
      </button>
    </div>
  );
}
