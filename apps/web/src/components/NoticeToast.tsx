import { useEffect } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { useGameStore } from '../state/gameStore.js';

const T: Record<Lang, { dismiss: string }> = {
  en: { dismiss: 'Dismiss' },
  fr: { dismiss: 'Fermer' },
};

const AUTO_DISMISS_MS = 5000;

/**
 * A dismissible toast for transient net-layer notices — mainly server
 * rejections (e.g. "Seat 2 is taken") that would otherwise vanish silently.
 * Mounted at both the pre-game Lobby and the in-game Table so a seat-race
 * rejection is visible wherever it can happen. Sits above the hand, below the
 * z-50+ sheets. The server's message is shown verbatim — it's English-only
 * and not ours to translate.
 */
export function NoticeToast() {
  const t = T[useLang()];
  const notice = useGameStore((s) => s.notice);
  const clearNotice = useGameStore((s) => s.clearNotice);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(clearNotice, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice, clearNotice]);

  if (notice === null) return null;
  return (
    <div
      data-testid="notice-toast"
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[48] flex -translate-x-1/2 items-center gap-3 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-2 font-arcade-ui text-sm text-(--color-ap-text) shadow-(--shadow-ap)"
    >
      <span>{notice.text}</span>
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
