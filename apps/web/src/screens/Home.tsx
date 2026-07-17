import { useEffect, useState, type CSSProperties } from 'react';
import { ThemeSwitcher } from '../components/ThemeSwitcher.js';
import { HelpButton } from '../help/HelpButton.js';
import { HeroBanner } from '../home/HeroBanner.js';
import { PlayMenu } from '../home/PlayMenu.js';
import { ProfileCard } from '../home/ProfileCard.js';
import { RecoveryCard, type RecoveryStage } from '../home/RecoveryCard.js';
import { getGuestToken, getProfile, saveProfile, type Profile } from '../net/auth.js';
import { playerName, setPlayerName } from '../net/socket.js';
import { listTables, type TableEntry } from '../net/rooms.js';

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

      {/* Solid panel so the chrome text sits on a real background axe can read. */}
      <div
        className="rise-in flex items-center gap-3 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-2 shadow-(--shadow-ap-sm)"
        style={{ '--rise-delay': '280ms' } as CSSProperties}
      >
        <HelpButton defaultOpen={helpOpen} />
        <ThemeSwitcher />
      </div>
    </main>
  );
}
