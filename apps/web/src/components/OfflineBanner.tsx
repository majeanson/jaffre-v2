import { useEffect, useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';

const T: Record<Lang, { message: string; dismiss: string }> = {
  en: { message: "You're offline — practice still works.", dismiss: 'Dismiss' },
  fr: { message: 'T’es hors ligne — la pratique fonctionne encore.', dismiss: 'Fermer' },
};

/**
 * J1 — offline is a state the app admits, not something it pretends can't
 * happen. One `online`/`offline` listener, mounted once at App level, so a
 * dropped connection gets a plain notice wherever you are — the only other
 * connection signal in the app is ConnectionBanner, which is scoped to a
 * live room's socket and says nothing on Home or the meta screens.
 *
 * Dismissible per OFFLINE SPELL, not for the session: going back online
 * resets the dismissal, so the next drop gets its own notice instead of
 * staying silently swallowed by a dismiss from an hour ago.
 */
export function OfflineBanner() {
  const t = T[useLang()];
  const [online, setOnline] = useState(() => navigator.onLine);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setDismissed(false);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online || dismissed) return null;
  return (
    <div
      data-testid="offline-banner"
      role="status"
      aria-live="polite"
      className="pop-in fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-3 border-b-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-4 py-2 text-center font-arcade-ui text-sm font-medium text-(--color-ap-ink)"
    >
      <span>{t.message}</span>
      <button
        type="button"
        aria-label={t.dismiss}
        onClick={() => setDismissed(true)}
        className="shrink-0 hover:opacity-70"
      >
        ✕
      </button>
    </div>
  );
}
