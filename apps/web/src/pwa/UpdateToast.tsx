import { useRegisterSW } from 'virtual:pwa-register/react';
import type { Lang } from '@jaffre/ui';
import { useLang } from '@jaffre/ui';
import { SLOT_UPDATE, useBottomSlot } from '../components/bottomSlot.js';

const T: Record<Lang, { ready: string; reload: string; dismiss: string }> = {
  en: { ready: 'A new version is ready', reload: 'Refresh', dismiss: 'Later' },
  fr: { ready: 'Une nouvelle version est prête', reload: 'Actualiser', dismiss: 'Plus tard' },
};

/**
 * Registers the service worker and, when a new deploy is waiting, shows a
 * persistent "refresh" toast — main auto-deploys, so without this players
 * would silently run stale code until their next hard reload.
 *
 * Mount it conditionally (`!navigator.webdriver`) so e2e runs never install
 * a service worker.
 */
export function UpdateToast() {
  const t = T[useLang()];
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const visible = useBottomSlot(SLOT_UPDATE, needRefresh);

  if (!needRefresh || !visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pop-in fixed inset-x-0 bottom-6 z-[70] mx-auto flex w-fit items-center gap-3 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-2.5 font-arcade-ui text-sm font-medium text-(--color-ap-text) shadow-(--shadow-ap)"
    >
      <span>{t.ready}</span>
      <button
        type="button"
        className="rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-2.5 py-1 text-xs font-bold text-(--color-ap-ink)"
        onClick={() => void updateServiceWorker(true)}
      >
        {t.reload}
      </button>
      <button
        type="button"
        className="px-1 text-xs opacity-70"
        onClick={() => setNeedRefresh(false)}
      >
        {t.dismiss}
      </button>
    </div>
  );
}
