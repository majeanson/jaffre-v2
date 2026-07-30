import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang, type Lang } from '@jaffre/ui';
import { applyLang, LANGS } from '../lang.js';
import { playClick, setSoundEnabled, soundEnabled } from '../audio/clicks.js';
import { loadCoachPref, saveCoachPref } from '../table/coachPref.js';
import { setSnappyPace, snappyPace } from '../table/pacePref.js';
import { ReplayTutorialButton } from './ReplayTutorialButton.js';
import { InstallButton } from '../pwa/InstallButton.js';
import { NotificationsToggle } from '../pwa/NotificationsToggle.js';
import { LoginButton } from './LoginSheet.js';
import { useScrollLock } from './useScrollLock.js';
import { useDismissLayer } from '../keys/layers.js';

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
    pace: string;
    paceHint: string;
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
    keys: string;
    keysHint: string;
    keysList: readonly [string, string][];
  }
> = {
  en: {
    settings: 'Settings',
    close: 'Close settings',
    language: 'Language',
    sound: 'Sound',
    soundHint: 'Card sounds & haptics.',
    coach: 'Coach',
    coachHint: 'Suggests a bid or card on your turn. On by default in practice.',
    pace: 'Snappy animations',
    paceHint: 'Shorter deal, trick hold and bot pauses.',
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
    keys: 'Keyboard',
    keysHint: 'Anywhere in the app, and at the table.',
    keysList: [
      ['↑ ↓ ← →', 'move around'],
      ['Enter', 'choose what you landed on'],
      ['Esc', 'close, or step back'],
      ['1–8', 'play that card (or queue it)'],
      ['1–6', 'bid 7–12 during the auction'],
      ['P', 'pass'],
      ['L / C', 'game log / chat'],
    ],
  },
  fr: {
    settings: 'Réglages',
    close: 'Fermer les réglages',
    language: 'Langue',
    sound: 'Sons',
    soundHint: 'Sons de cartes et vibrations.',
    coach: 'Coach',
    coachHint: 'Suggère une mise ou une carte à ton tour. Activé par défaut à l’entraînement.',
    pace: 'Animations rapides',
    paceHint: 'Distribution, levées et pauses des bots plus courtes.',
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
    keys: 'Clavier',
    keysHint: 'Partout dans l’app, et à la table.',
    keysList: [
      ['↑ ↓ ← →', 'te déplacer'],
      ['Entrée', 'choisir ce que tu as atteint'],
      ['Échap', 'fermer, ou revenir'],
      ['1–8', 'joue cette carte (ou la met en attente)'],
      ['1–6', 'mise 7–12 pendant les mises'],
      ['P', 'passe'],
      ['L / C', 'journal / clavardage'],
    ],
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
  /** How to reach the gallery from here. At the table this opens the
   * CollectionSheet modal — navigating to '#collection' would tear the room
   * route down mid-game. Elsewhere it's omitted and the route is used. */
  readonly onOpenCollection?: () => void;
}

/**
 * THE settings surface. Language, sound, coach, install + turn alerts, theme
 * shortcut, tutorial replay and account status in one sheet — previously
 * scattered over the chrome bar, the table's Options drawer, the Help sheet's
 * footer and the lobby. Same overlay idiom as Customize/Login (portal,
 * backdrop + Escape + ✕ close).
 */
export function SettingsSheet({ onClose, coach, onOpenCollection }: SettingsSheetProps) {
  const lang = useLang();
  const t = T[lang];
  useScrollLock();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [sound, setSound] = useState(soundEnabled);
  const [coachOn, setCoachOn] = useState(() => coach?.on ?? loadCoachPref(false));
  const [snappy, setSnappy] = useState(snappyPace);

  // Escape, the Tab trap and the return trip to the gear all come from the
  // app-wide stack; focus still lands on the ✕ so the way out is announced
  // first.
  const panel = useRef<HTMLDivElement>(null);
  useDismissLayer(panel, onClose, { trap: true, initialFocus: () => closeRef.current });

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panel}
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

        <Row title={t.pace} hint={t.paceHint}>
          <Switch
            label={t.pace}
            checked={snappy}
            onChange={(next) => {
              setSnappyPace(next);
              setSnappy(next);
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
              if (onOpenCollection !== undefined) onOpenCollection();
              else location.hash = '#collection';
            }}
            className="cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2 font-arcade-display text-xs uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
          >
            {t.themeGo}
          </button>
        </Row>

        <Row title={t.tutorial} hint={t.tutorialHint}>
          <ReplayTutorialButton label={t.tutorialGo} onConfirm={onClose} />
        </Row>

        <Row title={t.account} hint={t.accountHint}>
          <LoginButton />
        </Row>

        {/* Reference, not a control — the one place the table's shortcuts are
            written down. Hidden on touch-only devices, where they're noise. */}
        <div className="hidden flex-col gap-1.5 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-3 shadow-(--shadow-ap-sm) [@media(hover:hover)]:flex">
          <span className="flex items-baseline gap-2">
            <span className="font-arcade-display text-sm uppercase tracking-wide text-(--color-ap-text)">
              {t.keys}
            </span>
            <span className="text-xs text-(--color-ap-muted)">{t.keysHint}</span>
          </span>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {t.keysList.map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt className="font-arcade-display uppercase text-(--color-ap-gold)">{keys}</dt>
                <dd className="text-(--color-ap-muted)">{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>,
    document.body,
  );
}
