import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { Lang } from '@jaffre/ui';
import { useLang } from '@jaffre/ui';
import { SLOT_UPDATE, useBottomSlot } from '../components/bottomSlot.js';

const T: Record<Lang, { updating: string }> = {
  en: { updating: 'New version — updating…' },
  fr: { updating: 'Nouvelle version — mise à jour…' },
};

/** How often a running tab re-checks for a fresh deploy, so a long-lived
 * session upgrades on its own rather than only at the next cold load. */
const UPDATE_POLL_MS = 60_000;
/** A brief beat so the "updating" notice paints before the reload — long
 * enough to read, short enough to feel instant. */
const APPLY_DELAY_MS = 1500;

/**
 * Registers the service worker and applies a waiting deploy AUTOMATICALLY:
 * main auto-deploys, so every client must run current code — the user gets a
 * short notice, not a choice. We still use `registerType: 'prompt'` so we own
 * the timing (flash the toast, then reload) instead of an abrupt silent swap,
 * and we poll for updates so a tab left open picks up a deploy within a minute.
 *
 * Mount it conditionally (`!navigator.webdriver`) so e2e runs never install
 * a service worker.
 */
export function UpdateToast() {
  const t = T[useLang()];
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), UPDATE_POLL_MS);
    },
  });
  const visible = useBottomSlot(SLOT_UPDATE, needRefresh);

  // A new deploy is waiting → apply it automatically (activate + reload). Guarded
  // so it fires exactly once even if the component re-renders in the meantime.
  const applied = useRef(false);
  useEffect(() => {
    if (!needRefresh || applied.current) return;
    applied.current = true;
    const id = setTimeout(() => void updateServiceWorker(true), APPLY_DELAY_MS);
    return () => clearTimeout(id);
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh || !visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pop-in fixed inset-x-0 bottom-6 z-[70] mx-auto flex w-fit items-center gap-3 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-2.5 font-arcade-ui text-sm font-medium text-(--color-ap-text) shadow-(--shadow-ap)"
    >
      <span
        aria-hidden
        className="size-4 shrink-0 animate-spin rounded-full border-2 border-(--color-ap-ink) border-t-(--color-ap-gold)"
      />
      <span>{t.updating}</span>
    </div>
  );
}
