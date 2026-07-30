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
/** If the swap hasn't reloaded us this long after we ask the new worker to
 * activate, force the reload ourselves. The graceful path hinges on a
 * `controllerchange` event that can silently fail to fire (a lost `waiting`
 * reference, an uncontrolled page, a worker that never claims) — that's the
 * hang the spinner gets stuck on. */
const RELOAD_WATCHDOG_MS = 4000;
/** Don't force-reload again if we just did: a deploy whose worker genuinely
 * can't activate would otherwise loop. Outside this window forcing is allowed
 * again, so the guard self-expires and never blocks a real later update. */
const RELOAD_LOOP_WINDOW_MS = 20_000;
const RELOAD_GUARD_KEY = 'jaffre:sw-forced-reload';

/**
 * Registers the service worker and applies a waiting deploy AUTOMATICALLY:
 * main auto-deploys, so every client must run current code — the user gets a
 * short notice, not a choice. We still use `registerType: 'prompt'` so we own
 * the timing (flash the toast, then reload) instead of an abrupt silent swap,
 * and we poll for updates so a tab left open picks up a deploy within a minute.
 *
 * Applying is resilient: we message the waiting worker directly AND through the
 * plugin, reload the instant it takes control, and — because that signal can
 * fail to arrive — fall back to a watchdog that forces the reload rather than
 * leaving the "updating…" spinner hanging forever.
 *
 * Mount it conditionally (`!navigator.webdriver`) so e2e runs never install
 * a service worker.
 */
export function UpdateToast() {
  const t = T[useLang()];
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      regRef.current = registration;
      // J6: this used to leak — the interval outlived the component with no
      // way to stop it. UpdateToast is mounted once for the app's life
      // (App.tsx never unmounts it) so in practice it never fired, but the
      // scene viewer and any future conditional mount would have stacked a
      // fresh poller on every remount.
      pollRef.current = setInterval(() => void registration.update(), UPDATE_POLL_MS);
    },
  });
  const visible = useBottomSlot(SLOT_UPDATE, needRefresh);

  // Stop polling the moment this unmounts — App.tsx never unmounts it in
  // practice, but a leaked setInterval is a leaked setInterval regardless of
  // whether today's call sites happen to avoid triggering it.
  useEffect(() => {
    return () => {
      if (pollRef.current !== undefined) clearInterval(pollRef.current);
    };
  }, []);

  // A new deploy is waiting → apply it automatically (activate + reload). Guarded
  // so it fires exactly once even if the component re-renders in the meantime.
  const applied = useRef(false);
  useEffect(() => {
    if (!needRefresh || applied.current) return;
    applied.current = true;

    let reloaded = false;
    const reload = (): void => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    // The new worker taking control is the reliable "it's live now" signal.
    navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });

    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const apply = setTimeout(() => {
      // Drive activation directly — the plugin's own `waiting` reference can be
      // stale after a background poll swapped the worker — and via the plugin,
      // reloading the moment the worker reports it has activated.
      const waiting = regRef.current?.waiting;
      if (waiting) {
        waiting.addEventListener('statechange', () => {
          if (waiting.state === 'activated') reload();
        });
        waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      void updateServiceWorker(true);

      // Backstop: if none of the signals above reload us, force it — guarded so
      // a worker that simply cannot activate can't spin us in a reload loop.
      watchdog = setTimeout(() => {
        const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0');
        if (Date.now() - last < RELOAD_LOOP_WINDOW_MS) return;
        try {
          sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
        } catch {
          // sessionStorage unavailable — force anyway; a rare double reload
          // still beats leaving the spinner hung.
        }
        reload();
      }, RELOAD_WATCHDOG_MS);
    }, APPLY_DELAY_MS);

    return () => {
      clearTimeout(apply);
      if (watchdog) clearTimeout(watchdog);
      navigator.serviceWorker?.removeEventListener('controllerchange', reload);
    };
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
