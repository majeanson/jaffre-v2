import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang, type Lang } from '@jaffre/ui';
import { applyLang, LANGS } from '../lang.js';
import { playClick, setSoundEnabled, soundEnabled } from '../audio/clicks.js';
import { loadCoachPref, saveCoachPref } from '../table/coachPref.js';
import { resetTutorial } from '../table/tutorialPref.js';
import { InstallButton } from '../pwa/InstallButton.js';
import { NotificationsToggle } from '../pwa/NotificationsToggle.js';
import { LoginButton } from './LoginSheet.js';
import { useScrollLock } from './useScrollLock.js';

const T: Record<
  Lang,
  {
    settings: string;
    close: string;
    language: string;
    sound: string;
    soundHint: string;
    coach: string;
    coachHint: string;
    app: string;
    appHint: string;
    theme: string;
    themeHint: string;
    themeGo: string;
    tutorial: string;
    tutorialHint: string;
    tutorialGo: string;
    account: string;
    accountHint: string;
  }
> = {
  en: {
    settings: 'Settings',
    close: 'Close settings',
    language: 'Language',
    sound: 'Sound',
    soundHint: 'Card sounds & haptics.',
    coach: 'Coach',
    coachHint: 'Suggests a bid or card on your turn.',
    app: 'App',
    appHint: 'Install Jaffre and get "your turn" alerts.',
    theme: 'Theme & skins',
    themeHint: 'Colours and card skins live in the Collection.',
    themeGo: 'Open Collection',
    tutorial: 'Tutorial',
    tutorialHint: 'Replay the guided first practice game.',
    tutorialGo: '♺ Replay tutorial',
    account: 'Account',
    accountHint: 'Log in so your games follow you.',
  },
  fr: {
    settings: 'Réglages',
    close: 'Fermer les réglages',
    language: 'Langue',
    sound: 'Sons',
    soundHint: 'Sons de cartes et vibrations.',
    coach: 'Coach',
    coachHint: 'Suggère une mise ou une carte à ton tour.',
    app: 'App',
    appHint: 'Installe Jaffre et reçois les alertes « à ton tour ».',
    theme: 'Thème et habillages',
    themeHint: 'Les couleurs et habillages vivent dans la Collection.',
    themeGo: 'Ouvrir la Collection',
    tutorial: 'Tutoriel',
    tutorialHint: 'Rejoue la première partie d’entraînement guidée.',
    tutorialGo: '♺ Rejouer le tutoriel',
    account: 'Compte',
    accountHint: 'Connecte-toi pour que tes parties te suivent.',
  },
};

/** One labelled row of the sheet: title + hint on the left, control right. */
function Row({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-3 shadow-(--shadow-ap-sm)">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-arcade-display text-sm uppercase tracking-wide text-(--color-ap-text)">
          {title}
        </span>
        <span className="text-xs leading-snug text-(--color-ap-muted)">{hint}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">{children}</span>
    </div>
  );
}

/** The switch idiom shared with the lobby's house rules. */
function Switch({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="size-5 shrink-0 cursor-pointer accent-(--color-ap-gold)"
    />
  );
}

export interface SettingsSheetProps {
  readonly onClose: () => void;
  /** Live coach state when opened at the table, so the sheet and the drawer
   * toggle stay in sync; omitted elsewhere (the persisted pref is edited). */
  readonly coach?: { readonly on: boolean; readonly onToggle: () => void };
}

/**
 * THE settings surface. Language, sound, coach, install + turn alerts, theme
 * shortcut, tutorial replay and account status in one sheet — previously
 * scattered over the chrome bar, the table's Options drawer, the Help sheet's
 * footer and the lobby. Same overlay idiom as Customize/Login (portal,
 * backdrop + Escape + ✕ close).
 */
export function SettingsSheet({ onClose, coach }: SettingsSheetProps) {
  const lang = useLang();
  const t = T[lang];
  useScrollLock();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [sound, setSound] = useState(soundEnabled);
  const [coachOn, setCoachOn] = useState(() => coach?.on ?? loadCoachPref(false));

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.settings}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-sm flex-col gap-3 overflow-y-auto overscroll-contain rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-5 font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-lg) sm:max-w-md"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-arcade-display text-[1.5em] uppercase tracking-wide text-(--color-ap-gold)">
            {t.settings}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
          >
            ✕
          </button>
        </div>

        <Row title={t.language} hint="English / Français">
          <span role="group" aria-label={t.language} className="flex items-stretch gap-1.5">
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={lang === l.id}
                onClick={() => applyLang(l.id)}
                className={`cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-2.5 py-1.5 font-arcade-display text-xs uppercase shadow-(--shadow-ap-sm) ${
                  lang === l.id
                    ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
                    : 'bg-(--color-ap-panel) text-(--color-ap-muted) hover:bg-(--color-ap-panel-hover)'
                }`}
              >
                {l.id.toUpperCase()}
              </button>
            ))}
          </span>
        </Row>

        <Row title={t.sound} hint={t.soundHint}>
          <Switch
            label={t.sound}
            checked={sound}
            onChange={(next) => {
              setSoundEnabled(next);
              setSound(next);
              if (next) playClick('select');
            }}
          />
        </Row>

        <Row title={t.coach} hint={t.coachHint}>
          <Switch
            label={t.coach}
            checked={coachOn}
            onChange={(next) => {
              setCoachOn(next);
              if (coach !== undefined) coach.onToggle();
              else saveCoachPref(next);
            }}
          />
        </Row>

        {/* Install + alerts each render only where they can actually work. */}
        <Row title={t.app} hint={t.appHint}>
          <InstallButton />
          <NotificationsToggle />
        </Row>

        <Row title={t.theme} hint={t.themeHint}>
          <button
            type="button"
            onClick={() => {
              onClose();
              location.hash = '#collection';
            }}
            className="cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2 font-arcade-display text-xs uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
          >
            {t.themeGo}
          </button>
        </Row>

        <Row title={t.tutorial} hint={t.tutorialHint}>
          <button
            type="button"
            onClick={() => {
              resetTutorial();
              onClose();
              location.hash = '#practice';
            }}
            className="cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2 font-arcade-display text-xs uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
          >
            {t.tutorialGo}
          </button>
        </Row>

        <Row title={t.account} hint={t.accountHint}>
          <LoginButton />
        </Row>
      </div>
    </div>,
    document.body,
  );
}
