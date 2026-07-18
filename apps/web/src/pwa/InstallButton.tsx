import { useEffect, useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { ICON_BTN_NEUTRAL } from '../components/IconButton.js';
import { IconDownload } from '../components/icons.js';
import {
  canPromptInstall,
  isIOS,
  isStandalone,
  onInstallAvailabilityChange,
  promptInstall,
} from './install.js';

const T: Record<Lang, { install: string; iosTitle: string; iosSteps: string; close: string }> = {
  en: {
    install: 'Install app',
    iosTitle: 'Add Jaffre to your home screen',
    iosSteps: 'In Safari: tap the Share button, then “Add to Home Screen”.',
    close: 'Close',
  },
  fr: {
    install: 'Installer l’app',
    iosTitle: 'Ajoute Jaffre à ton écran d’accueil',
    iosSteps: 'Dans Safari : touche le bouton Partager, puis « Sur l’écran d’accueil ».',
    close: 'Fermer',
  },
};

/**
 * Home-chrome install affordance. Renders only when installing is actually
 * possible from here: the captured native prompt (Android/desktop), or iOS
 * Safari where the path is the share sheet — shown as a short instruction
 * card since no API exists. Hidden once running standalone.
 */
export function InstallButton() {
  const t = T[useLang()];
  const [, bump] = useState(0);
  const [iosOpen, setIosOpen] = useState(false);
  useEffect(() => onInstallAvailabilityChange(() => bump((n) => n + 1)), []);

  if (isStandalone()) return null;
  const native = canPromptInstall();
  if (!native && !isIOS()) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t.install}
        title={t.install}
        className={ICON_BTN_NEUTRAL}
        onClick={() => {
          if (native) void promptInstall();
          else setIosOpen(true);
        }}
      >
        <IconDownload />
      </button>
      {iosOpen && (
        <div
          role="dialog"
          aria-label={t.iosTitle}
          className="pop-in fixed inset-x-0 bottom-6 z-[70] mx-auto w-fit max-w-[88vw] rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-3 font-arcade-ui text-sm text-(--color-ap-text) shadow-(--shadow-ap)"
        >
          <p className="font-bold">{t.iosTitle}</p>
          <p className="mt-1 opacity-80">{t.iosSteps}</p>
          <button
            type="button"
            className="mt-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel-hover) px-2.5 py-1 text-xs font-bold"
            onClick={() => setIosOpen(false)}
          >
            {t.close}
          </button>
        </div>
      )}
    </>
  );
}
