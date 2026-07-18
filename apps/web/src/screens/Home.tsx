import { useLang, type Lang } from '@jaffre/ui';
import { useEffect, useState, type CSSProperties } from 'react';
import { ICON_BTN_NEUTRAL } from '../components/IconButton.js';
import { IconQuestion } from '../components/icons.js';
import { LangSwitcher } from '../components/LangSwitcher.js';
import { SkinLink } from '../components/SkinLink.js';
import { HelpButton } from '../help/HelpButton.js';
import { HeroBanner } from '../home/HeroBanner.js';
import { PlayMenu } from '../home/PlayMenu.js';
import { ProfileCard } from '../home/ProfileCard.js';
import { RecoveryCard, type RecoveryStage } from '../home/RecoveryCard.js';
import { getGuestToken, getProfile, saveProfile, type Profile } from '../net/auth.js';
import { playerName, setPlayerName } from '../net/socket.js';
import { listTables, type TableEntry } from '../net/rooms.js';

const HINT_T: Record<Lang, { hint: string; gotIt: string }> = {
  en: {
    hint: 'Your 3 secret words (under Customize) bring your name & games back on any device.',
    gotIt: 'Got it',
  },
  fr: {
    hint: 'Tes 3 mots secrets (sous Personnaliser) ramènent ton nom et tes parties sur n’importe quel appareil.',
    gotIt: 'Compris',
  },
};

const HINT_KEY = 'jaffre-recovery-hint';

/**
 * A one-line, dismissible pointer at the recovery words — the whole mechanism
 * lives inside the Customize disclosure where new players never look. Muted
 * text, no panel: it informs without disturbing the title screen, and once
 * dismissed it never comes back (localStorage).
 */
function RecoveryHint() {
  const t = HINT_T[useLang()];
  const [seen, setSeen] = useState(() => localStorage.getItem(HINT_KEY) === '1');
  if (seen) return null;
  return (
    <p className="rise-in flex w-full max-w-xs items-start justify-center gap-2 text-center font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
      <span aria-hidden className="text-(--color-ap-gold)">
        ✦
      </span>
      <span>{t.hint}</span>
      <button
        type="button"
        aria-label={t.gotIt}
        title={t.gotIt}
        onClick={() => {
          localStorage.setItem(HINT_KEY, '1');
          setSeen(true);
        }}
        className="shrink-0 cursor-pointer px-1 text-(--color-ap-muted) hover:text-(--color-ap-text)"
      >
        ✕
      </button>
    </p>
  );
}

/** Scene-only: a fully-staged identity (no network) for the viewer. */
export interface IdentityStage {
  readonly name: string;
  readonly color: string | null;
  readonly paint: string | null;
  readonly recovery: RecoveryStage;
  /** Scene-only: surface a name-field error (e.g. a taken name). */
  readonly nameError?: string;
}

export interface HomeProps {
  readonly onPractice: () => void;
  readonly onJoinRoom: (code: string) => void;
  /** Mount with the help sheet already open (scene viewer). */
  readonly helpOpen?: boolean;
  /** Scene viewer only: stage the "Your tables" row (else it reads localStorage). */
  readonly demoTables?: readonly TableEntry[] | undefined;
  /** Scene viewer: force the identity into a staged state. */
  readonly identityStage?: IdentityStage;
}

/** The title screen in the arcade shell: brand moment on top, your painted
 * identity card, then the play actions, quiet chrome below. */
export function Home({
  onPractice,
  onJoinRoom,
  helpOpen = false,
  demoTables,
  identityStage,
}: HomeProps) {
  const staged = identityStage !== undefined;
  const [name, setName] = useState(playerName());
  const [profile, setProfile] = useState<Profile>(getProfile());
  const tables = demoTables ?? listTables();

  // Establish identity as soon as the home screen shows (not only once the
  // recovery card mounts — it now lives inside the Customize disclosure) so a
  // brand-new browser has a token ready for profile saves and room joins.
  useEffect(() => {
    if (staged) return;
    void getGuestToken(playerName());
  }, [staged]);

  const saveName = () => setPlayerName(name.trim() === '' ? 'Player' : name.trim());

  const chooseColor = (hex: string) => {
    setProfile((p) => ({ ...p, color: hex }));
    void saveProfile({ color: hex });
  };
  const savePaint = (dataUrl: string) => {
    setProfile((p) => ({ ...p, paint: dataUrl }));
    void saveProfile({ paint: dataUrl });
  };

  const shownColor = staged ? identityStage.color : profile.color;
  const shownPaint = staged ? identityStage.paint : profile.paint;

  return (
    <main className="flex min-h-dvh flex-col items-center gap-[clamp(0.85rem,2.4vmin,1.5rem)] overflow-x-clip bg-(--color-ap-ground) px-6 py-[clamp(1.5rem,4vmin,3rem)] font-arcade-ui text-(--color-ap-text) max-sm:px-4">
      <HeroBanner />

      <ProfileCard
        name={staged ? identityStage.name : name}
        color={shownColor}
        paint={shownPaint}
        editable={!staged}
        onColor={chooseColor}
        onPaint={savePaint}
        nameError={staged ? (identityStage.nameError ?? null) : null}
        defaultOpen={staged}
        {...(staged ? {} : { onName: setName, onNameCommit: saveName })}
      >
        {staged ? <RecoveryCard stage={identityStage.recovery} /> : <RecoveryCard />}
      </ProfileCard>

      {!staged && <RecoveryHint />}

      <div className="w-full max-w-[min(92vw,44rem)]">
        <PlayMenu
          onPractice={() => {
            saveName();
            onPractice();
          }}
          onJoinRoom={(code) => {
            saveName();
            onJoinRoom(code);
          }}
          tables={tables}
        />
      </div>

      {/* Quiet chrome — the SAME icon buttons as the in-game toolbar (? for
          how-to-play, cards for Collection, EN/FR toggle) so the symbols mean
          one thing everywhere. Solid panel so axe can read the contrast. */}
      <div
        className="rise-in flex items-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2 shadow-(--shadow-ap-sm)"
        style={{ '--rise-delay': '280ms' } as CSSProperties}
      >
        <HelpButton defaultOpen={helpOpen} className={ICON_BTN_NEUTRAL}>
          <IconQuestion />
        </HelpButton>
        <SkinLink />
        <LangSwitcher />
      </div>
    </main>
  );
}
