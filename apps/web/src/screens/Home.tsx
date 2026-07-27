import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PlayerCard, useLang, type Lang } from '@jaffre/ui';
import { ICON_BTN_NEUTRAL } from '../components/IconButton.js';
import { IconQuestion } from '../components/icons.js';
import { LangSwitcher } from '../components/LangSwitcher.js';
import { LoginButton } from '../components/LoginSheet.js';
import { SkinLink } from '../components/SkinLink.js';
import { HelpButton } from '../help/HelpButton.js';
import { AttractMode } from '../home/AttractMode.js';
import { CustomizeSheet } from '../home/CustomizeSheet.js';
import { HeroBanner } from '../home/HeroBanner.js';
import { PlayMenu } from '../home/PlayMenu.js';
import { PracticeNudge } from '../home/PracticeNudge.js';
import { LevelBadge } from '../home/LevelBadge.js';
import { RecoveryCard, type RecoveryStage } from '../home/RecoveryCard.js';
import { getGuestToken, getProfile, saveProfile, type Profile } from '../net/auth.js';
import { playerName, setPlayerName } from '../net/socket.js';
import { leaveTable, listTables, type TableEntry } from '../net/rooms.js';

const T: Record<Lang, { corner: string; customize: string }> = {
  en: { corner: 'Your corner', customize: 'Customize' },
  fr: { corner: 'Ton coin', customize: 'Personnaliser' },
};

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
  /** Scene viewer: force the identity into a staged state. */
  readonly identityStage?: IdentityStage;
  /** Scene viewer: stage the PLAY door's table list without hitting the network. */
  readonly demoTables?: readonly TableEntry[];
  /** Scene viewer: mount the PLAY door already open. */
  readonly playOpen?: boolean;
  /** Scene viewer: stage the PLAY door's initial step (friends) once open. */
  readonly playStep?: 'friends';
  /** Scene viewer: mount with the (editable) Customize sheet open. */
  readonly customizeOpen?: boolean;
  /** Scene viewer: mount with the Login sheet open. */
  readonly loginOpen?: boolean;
}

/** The title screen in the arcade shell: brand moment on top, your painted
 * identity card, then the play actions, quiet chrome below. */
export function Home({
  onPractice,
  onJoinRoom,
  helpOpen = false,
  identityStage,
  demoTables,
  playOpen,
  playStep,
  customizeOpen: customizeOpenProp = false,
  loginOpen = false,
}: HomeProps) {
  const t = T[useLang()];
  const staged = identityStage !== undefined;
  const [name, setName] = useState(playerName());
  const [profile, setProfile] = useState<Profile>(getProfile());
  // The standing tables feed the PLAY door's "your tables" row and its
  // closed-door count/your-turn pulse.
  const [tables, setTables] = useState<readonly TableEntry[]>(listTables);
  // The Customize sheet: a scene stages an identity open on mount so its
  // probes still find the name field/recovery plates without a click.
  const [customizeOpen, setCustomizeOpen] = useState(staged || customizeOpenProp);
  const customizeTriggerRef = useRef<HTMLButtonElement>(null);

  // Establish identity as soon as the home screen shows (not only once the
  // recovery card mounts — it now lives inside the Customize sheet) so a
  // brand-new browser has a token ready for profile saves and room joins.
  useEffect(() => {
    if (staged) return;
    void getGuestToken(playerName());
  }, [staged]);

  // A table created or finished elsewhere in-session (another tab, another
  // device) shouldn't stay a stale mount-time snapshot — re-read on return.
  useEffect(() => {
    if (demoTables !== undefined) return;
    const refresh = () => setTables(listTables());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [demoTables]);

  const saveName = () => setPlayerName(name.trim() === '' ? 'Player' : name.trim());

  const chooseColor = (hex: string) => {
    setProfile((p) => ({ ...p, color: hex }));
    void saveProfile({ color: hex });
  };
  const openPaint = () => {
    location.hash = '#paint';
  };

  const shownColor = staged ? identityStage.color : profile.color;
  const shownPaint = staged ? identityStage.paint : profile.paint;

  return (
    // `isolate relative` scopes the attract layer's -z-10 so the ghost trick
    // paints above the ground colour but below every real control.
    <main className="isolate relative flex min-h-full flex-col items-center overflow-x-clip bg-(--color-ap-ground) px-6 py-[clamp(1.5rem,4vmin,3rem)] font-arcade-ui text-(--color-ap-text) max-sm:px-4 lg:justify-center">
      {/* Idle long enough and ghost players deal a faint trick behind the UI. */}
      {!staged && <AttractMode />}

      {/* Title console: one centered stack on mobile, two balanced rails on the
          desktop. LEFT is the brand moment + your painted identity card only;
          RIGHT is the play actions, "Ton coin", and the quiet chrome — kept
          full-width so PLAY, "Ton coin" and the toolbar all share one edge. */}
      {/* Single-column cap 30rem: on portrait tablet the old 44rem cap let the
          CREATE/JOIN/PLAY rows stretch ~700px edge-to-edge for one word — 30rem
          matches the per-rail width the lg two-column layout gives them. */}
      <div className="grid w-full max-w-[min(92vw,30rem)] grid-cols-1 items-center gap-[clamp(0.85rem,2.4vmin,1.5rem)] lg:max-w-[min(94vw,64rem)] lg:grid-cols-2 lg:gap-[clamp(2rem,5vmin,4rem)]">
        {/* LEFT — brand fan + your painted identity card, nothing else */}
        <div className="flex flex-col items-center gap-[clamp(0.85rem,2.4vmin,1.5rem)]">
          {/* Your card is dealt into the brand fan — the title screen mirrors you. */}
          <HeroBanner
            name={staged ? identityStage.name : name}
            color={shownColor}
            paint={shownPaint}
            {...(staged ? {} : { onCardClick: openPaint })}
          />

          {/* A small display-only preview — editing (name, colour, paint) lives
              in the Customize sheet, reached from the chrome bar below. */}
          <div className="text-[0.5em]">
            <PlayerCard
              name={staged ? identityStage.name : name}
              {...(shownColor !== null ? { color: shownColor } : {})}
              {...(shownPaint !== null ? { paint: shownPaint } : {})}
            />
          </div>
        </div>

        {/* RIGHT — play actions, "Ton coin", then the quiet chrome, all one
            column width */}
        <div className="flex w-full flex-col items-stretch gap-[clamp(0.85rem,2.4vmin,1.5rem)]">
          {/* First-visit pointer to the coached practice game. Standing tables
              mean the player already knows the way in — skip the tutorial hint. */}
          {!staged && tables.length === 0 && (
            <PracticeNudge
              onPractice={() => {
                saveName();
                onPractice();
              }}
            />
          )}
          <PlayMenu
            onPractice={() => {
              saveName();
              onPractice();
            }}
            onJoinRoom={(code) => {
              saveName();
              onJoinRoom(code);
            }}
            tables={demoTables ?? tables}
            defaultOpen={playOpen ?? false}
            {...(playStep !== undefined ? { defaultStep: playStep } : {})}
            {...(demoTables === undefined
              ? {
                  onQuitTable: (code: string) => {
                    void leaveTable(code);
                    setTables(listTables());
                  },
                }
              : {})}
          />

          {/* Your corner: the profile overview + meta screens — a smaller
              sibling of the PLAY door (same violet panel chrome). */}
          <button
            type="button"
            onClick={() => {
              location.hash = '#corner';
            }}
            className="group/corner flex w-full cursor-pointer items-center justify-center gap-3 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-violet) px-5 py-[clamp(0.6rem,1.8vmin,1rem)] font-arcade-display text-[clamp(1rem,2.2vmin,1.3rem)] uppercase tracking-wide text-(--color-ap-ink) shadow-(--shadow-ap) transition-transform duration-(--duration-flick) active:translate-y-[2px]"
          >
            <span aria-hidden className="text-(--color-ap-gold)">
              ★
            </span>
            {t.corner}
            <span
              aria-hidden
              className="transition-transform duration-(--duration-flick) group-hover/corner:translate-x-1"
            >
              →
            </span>
          </button>

          {/* Quiet chrome — the SAME icon buttons as the in-game toolbar (? for
              how-to-play, cards for Collection, EN/FR toggle) so the symbols mean
              one thing everywhere, plus the Customize trigger (your avatar chip)
              and the Journey's level chip. Full-width bar so it lines up under
              the play actions; icons stay centered. Solid panel so axe reads the
              contrast. Install + turn-alerts are one-time settings, not a door
              you need every visit — they live at the bottom of the Help sheet
              instead. */}
          <div
            data-testid="chrome-bar"
            className="rise-in flex items-center justify-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2 shadow-(--shadow-ap-sm)"
            style={{ '--rise-delay': '280ms' } as CSSProperties}
          >
            <HelpButton defaultOpen={helpOpen} className={ICON_BTN_NEUTRAL}>
              <IconQuestion />
            </HelpButton>
            <button
              ref={customizeTriggerRef}
              type="button"
              aria-label={t.customize}
              title={t.customize}
              onClick={() => setCustomizeOpen(true)}
              className={`${ICON_BTN_NEUTRAL} relative overflow-hidden p-0`}
            >
              {/* The avatar IS the button face — edge to edge, no inner chip
                  border (the button's own square provides the frame). */}
              <span
                aria-hidden
                className="absolute inset-0 grid place-items-center font-arcade-display text-(--color-ap-ink)"
                style={{ background: shownColor ?? 'var(--color-ap-violet)' }}
              >
                {shownPaint !== null && shownPaint !== undefined && shownPaint !== '' ? (
                  <img
                    src={shownPaint}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  ((staged ? identityStage.name : name).trim()[0] ?? '?').toUpperCase()
                )}
              </span>
            </button>
            <LevelBadge />
            <SkinLink />
            {/* Rendered in staged scenes too: the shot sweep must see the
                bar at its real density — hiding the login chip is exactly
                how the linked-email overflow slipped past 505 screenshots. */}
            <LangSwitcher />
            <LoginButton defaultOpen={loginOpen} />
          </div>
        </div>
      </div>

      {customizeOpen && (
        <CustomizeSheet
          name={staged ? identityStage.name : name}
          color={shownColor}
          editable={!staged}
          onColor={chooseColor}
          onPaint={openPaint}
          nameError={staged ? (identityStage.nameError ?? null) : null}
          {...(staged ? {} : { onName: setName, onNameCommit: saveName })}
          onClose={() => {
            setCustomizeOpen(false);
            customizeTriggerRef.current?.focus();
          }}
        >
          {/* Scene viewer still stages the recovery plates; live players reach
              every login path (Google / email code / 3-word restore) through
              the one "Log in" button in the chrome bar below. */}
          {staged && <RecoveryCard stage={identityStage.recovery} />}
        </CustomizeSheet>
      )}
    </main>
  );
}
