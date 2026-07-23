import { useEffect, useState, type CSSProperties } from 'react';
import { ICON_BTN_NEUTRAL } from '../components/IconButton.js';
import { IconQuestion } from '../components/icons.js';
import { LangSwitcher } from '../components/LangSwitcher.js';
import { LoginButton } from '../components/LoginSheet.js';
import { SkinLink } from '../components/SkinLink.js';
import { InstallButton } from '../pwa/InstallButton.js';
import { NotificationsToggle } from '../pwa/NotificationsToggle.js';
import { HelpButton } from '../help/HelpButton.js';
import { AttractMode } from '../home/AttractMode.js';
import { HeroBanner } from '../home/HeroBanner.js';
import { PlayMenu } from '../home/PlayMenu.js';
import { PracticeNudge } from '../home/PracticeNudge.js';
import { LevelBadge } from '../home/LevelBadge.js';
import { ProfileCard } from '../home/ProfileCard.js';
import { RecoveryCard, type RecoveryStage } from '../home/RecoveryCard.js';
import { getGuestToken, getProfile, saveProfile, type Profile } from '../net/auth.js';
import { playerName, setPlayerName } from '../net/socket.js';
import { leaveTable, listTables, type TableEntry } from '../net/rooms.js';

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
  // Stateful so quitting a table drops its card without a reload.
  const [storedTables, setStoredTables] = useState<readonly TableEntry[]>(listTables);
  const tables = demoTables ?? storedTables;
  const quitTable = (code: string) => {
    void leaveTable(code); // forgets locally right away, frees the seat async
    setStoredTables(listTables());
  };

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
          desktop. LEFT is the brand moment + your painted identity; RIGHT is the
          play actions and the quiet chrome — kept full-width so PLAY, "Ton coin"
          and the toolbar all share one edge. */}
      <div className="grid w-full max-w-[min(92vw,44rem)] grid-cols-1 items-center gap-[clamp(0.85rem,2.4vmin,1.5rem)] lg:max-w-[min(94vw,64rem)] lg:grid-cols-2 lg:gap-[clamp(2rem,5vmin,4rem)]">
        {/* LEFT — brand fan + painted identity card */}
        <div className="flex flex-col items-center gap-[clamp(0.85rem,2.4vmin,1.5rem)]">
          {/* Your card is dealt into the brand fan — the title screen mirrors you. */}
          <HeroBanner
            name={staged ? identityStage.name : name}
            color={shownColor}
            paint={shownPaint}
            {...(staged ? {} : { onCardClick: openPaint })}
          />

          <ProfileCard
            name={staged ? identityStage.name : name}
            color={shownColor}
            paint={shownPaint}
            editable={!staged}
            onColor={chooseColor}
            onPaint={openPaint}
            nameError={staged ? (identityStage.nameError ?? null) : null}
            defaultOpen={staged}
            {...(staged ? {} : { onName: setName, onNameCommit: saveName })}
          >
            {/* Scene viewer still stages the recovery plates; live players reach
                every login path (Google / email code / 3-word restore) through
                the one "Log in" button in the chrome bar below. */}
            {staged && <RecoveryCard stage={identityStage.recovery} />}
          </ProfileCard>

          {/* Your level + XP bar → the Journey. Live screen only. */}
          {!staged && <LevelBadge />}
        </div>

        {/* RIGHT — play actions, then quiet chrome, all one column width */}
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
            tables={tables}
            {...(staged ? {} : { onLeaveTable: quitTable })}
            // Scene viewer stages "Your tables" — open the door so it shows.
            defaultYoursOpen={demoTables !== undefined}
          />

          {/* Quiet chrome — the SAME icon buttons as the in-game toolbar (? for
              how-to-play, cards for Collection, EN/FR toggle) so the symbols mean
              one thing everywhere. Full-width bar so it lines up under the play
              actions; icons stay centered. Solid panel so axe reads the contrast. */}
          <div
            className="rise-in flex items-center justify-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2 shadow-(--shadow-ap-sm)"
            style={{ '--rise-delay': '280ms' } as CSSProperties}
          >
            <HelpButton defaultOpen={helpOpen} className={ICON_BTN_NEUTRAL}>
              <IconQuestion />
            </HelpButton>
            <SkinLink />
            <InstallButton />
            <NotificationsToggle />
            <LangSwitcher />
            {!staged && <LoginButton />}
          </div>
        </div>
      </div>
    </main>
  );
}
