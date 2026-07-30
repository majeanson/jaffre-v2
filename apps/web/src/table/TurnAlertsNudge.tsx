import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang, type Lang } from '@jaffre/ui';
import { hasSeenOnlineIntro, hasSeenTutorial } from './tutorialPref.js';
import { enablePush, fetchVapidKey, pushPrefOn, pushSupported } from '../pwa/pushClient.js';

const LATCH_KEY = 'jaffre:alertsNudge';

/** A beat after the deal settles — joining the stack mid fly-out would land it
 * under the trump callout the instant the auction opens. */
const SHOW_DELAY_MS = 4000;
/** Un-acted, the card folds quietly (and still latches — one-shot means one
 * shot). The Settings bell stays the durable control. */
const TTL_MS = 18_000;

function latched(): boolean {
  try {
    return localStorage.getItem(LATCH_KEY) !== null;
  } catch {
    return true; // no storage → a nudge that can't latch must never show
  }
}

function latch(): void {
  try {
    localStorage.setItem(LATCH_KEY, 'done');
  } catch {
    // Storage unavailable — the latched() guard above already keeps it hidden.
  }
}

const T: Record<Lang, { body: string; enable: string; dismiss: string }> = {
  en: {
    body: 'Get a ping when it’s your turn — even with this tab closed.',
    enable: 'Turn alerts on',
    dismiss: 'Dismiss',
  },
  fr: {
    body: 'Reçois un signe quand c’est ton tour — même l’onglet fermé.',
    enable: 'Activer les alertes',
    dismiss: 'Fermer',
  },
};

/**
 * One-shot turn-alerts offer at an online table. The push toggle shipped
 * buried in Settings (gear → bell) and no flow ever mentioned it, so the one
 * re-engagement hook that already existed was opt-in-by-exploration. This
 * surfaces it once, in the moment it is about: you hold a seat at a live
 * table, where a turn can arrive while you are away.
 *
 * Deliberately NOT on someone's first online game — that game already opens
 * the "First time at a table?" card, and two competing cards teach neither.
 * The gate mirrors that card's own condition, so the nudge waits for the
 * next visit. Every exit (enable, dismiss, timeout) retires it for good.
 *
 * Renders into Stage's #table-toast-stack like every felt notice, so it
 * stacks with — never buries — the trump callout or a coach tip.
 */
export function TurnAlertsNudge() {
  const t = T[useLang()];
  // Mount-time gates, one-shot state: webdriver keeps the e2e suite clean
  // (same convention as the tutorial and the SW); "denied" would make the
  // enable button a dead end; pref-on + granted means there is nothing to
  // offer. The first-game deferral does NOT latch — it comes back.
  const [eligible] = useState(
    () =>
      !navigator.webdriver &&
      !latched() &&
      (hasSeenTutorial() || hasSeenOnlineIntro()) &&
      pushSupported() &&
      Notification.permission !== 'denied' &&
      !(pushPrefOn() && Notification.permission === 'granted'),
  );
  // Server-gated like NotificationsToggle: no VAPID key, no offer — the card
  // must never dangle a feature that can't work.
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!eligible) return undefined;
    let live = true;
    void fetchVapidKey().then((key) => {
      if (live) setVapidKey(key);
    });
    return () => {
      live = false;
    };
  }, [eligible]);

  useEffect(() => {
    if (!eligible || vapidKey === null || gone) return undefined;
    const show = setTimeout(() => setShown(true), SHOW_DELAY_MS);
    const fold = setTimeout(() => {
      latch();
      setGone(true);
    }, SHOW_DELAY_MS + TTL_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(fold);
    };
  }, [eligible, vapidKey, gone]);

  if (!eligible || gone || !shown || vapidKey === null) return null;
  const stack = document.getElementById('table-toast-stack');
  if (stack === null) return null;

  const retire = (): void => {
    latch();
    setGone(true);
  };
  const enable = (): void => {
    // Fire-and-forget: the browser's own permission prompt takes over from
    // here, and a denial leaves the Settings bell as the way back in.
    retire();
    void enablePush(vapidKey);
  };

  return createPortal(
    <div
      data-testid="turn-alerts-nudge"
      className="pointer-events-none w-[min(94vw,30rem)] max-w-full"
    >
      {/* An ink card with a gold spark, same family as the coach-marks —
          permanently dark, so its text is white (not the theme-flipping
          --color-ap-text). */}
      <div
        role="status"
        className="pop-in pointer-events-auto rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-3 shadow-(--shadow-ap-hero)"
      >
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="mt-0.5 text-(--color-ap-gold)">
            ✦
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-arcade-ui text-(length:--text-fluid-sm) leading-snug text-white/90">
              {t.body}
            </p>
            <button
              type="button"
              onClick={enable}
              className="mt-2 cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-3 py-1.5 font-arcade-display text-(length:--text-fluid-xs) uppercase text-(--color-ap-ink) shadow-(--shadow-ap-sm) hover:brightness-105"
            >
              {t.enable}
            </button>
          </div>
          <button
            type="button"
            aria-label={t.dismiss}
            onClick={retire}
            className="-mr-1 -mt-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) text-white/60 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>
    </div>,
    stack,
  );
}
