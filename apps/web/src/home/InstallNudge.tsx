import { useEffect, useState, type CSSProperties } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { funnelReached } from '../net/telemetry.js';
import { InstallButton } from '../pwa/InstallButton.js';
import {
  canPromptInstall,
  isIOS,
  isStandalone,
  onInstallAvailabilityChange,
} from '../pwa/install.js';

const STORAGE_KEY = 'jaffre:installNudge';

function latched(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return true; // no storage → a nudge that can't latch must never show
  }
}

function latch(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'done');
  } catch {
    // Storage unavailable — the latched() guard above already hides it.
  }
}

const T: Record<Lang, { line: string; dismiss: string }> = {
  en: {
    line: 'Keep Jaffre on your home screen — one tap and it opens like an app.',
    dismiss: 'Dismiss',
  },
  fr: {
    line: 'Garde Jaffre sur ton écran d’accueil — une touche et ça ouvre comme une app.',
    dismiss: 'Fermer',
  },
};

/**
 * The one moment install is offered rather than waited for. Install is a
 * one-time setting living in the Settings sheet, which nobody opens until
 * something is wrong — so a player who'd happily keep the game never hears
 * it's possible. This says it ONCE, on Home, and only to someone it can mean
 * anything to: a finished game behind them (the funnel's 'finish' — asking a
 * first-time visitor to install is asking them to move in off one hand), an
 * install path actually available (captured prompt or iOS), not already
 * standalone, and never again after its ✕.
 *
 * Deliberately NOT in the "start here" slot — that belongs to game doors
 * (PracticeNudge/DailyDoor, one at a time, see Home). This sits under the
 * chrome bar in the quiet tier, and the action itself is the same
 * InstallButton Settings mounts, so the two paths cannot drift.
 *
 * Invisible to e2e by construction: the funnel never records under
 * webdriver, so 'finish' is unreachable there — same convention as the
 * tutorial and the SW.
 */
export function InstallNudge() {
  const t = T[useLang()];
  const [, bump] = useState(0);
  const [due, setDue] = useState(() => !latched() && funnelReached('finish'));
  // beforeinstallprompt can fire at any moment after mount — re-evaluate the
  // availability gates below when it does, same subscription as InstallButton.
  useEffect(() => onInstallAvailabilityChange(() => bump((n) => n + 1)), []);

  if (!due || isStandalone()) return null;
  // No way to install from this browser (also true post-install, when the
  // used-up prompt leaves canPromptInstall false) — nothing to offer.
  if (!canPromptInstall() && !isIOS()) return null;

  return (
    <div
      data-testid="install-nudge"
      className="rise-in flex items-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) py-1 pr-1 pl-3 shadow-(--shadow-ap-sm)"
      style={{ '--rise-delay': '320ms' } as CSSProperties}
    >
      <span aria-hidden className="shrink-0 text-(--color-ap-gold)">
        ↓
      </span>
      <span className="min-w-0 flex-1 py-1.5 font-arcade-ui text-(length:--text-fluid-xs) leading-snug text-(--color-ap-text)">
        {t.line}
      </span>
      <InstallButton />
      <button
        type="button"
        onClick={() => {
          latch();
          setDue(false);
        }}
        aria-label={t.dismiss}
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) text-(--color-ap-muted) hover:bg-(--color-ap-panel-hover) hover:text-(--color-ap-text)"
      >
        ✕
      </button>
    </div>
  );
}
