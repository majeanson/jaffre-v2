import { useState, type CSSProperties } from 'react';
import { ThemeSwitcher } from '../components/ThemeSwitcher.js';
import { HelpButton } from '../help/HelpButton.js';
import { HeroBanner } from '../home/HeroBanner.js';
import { NameField } from '../home/NameField.js';
import { PlayMenu } from '../home/PlayMenu.js';
import { ProfileCard } from '../home/ProfileCard.js';
import { RecoveryCard, type RecoveryStage } from '../home/RecoveryCard.js';
import { getProfile, saveProfile, type Profile } from '../net/auth.js';
import { lastRoom, playerName, setPlayerName } from '../net/socket.js';

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
  /** Scene viewer only: stage a "Your tables" resume row with a series tally. */
  readonly demoResume?:
    { readonly code: string; readonly series?: readonly [number, number] } | undefined;
  /** Scene viewer: force the identity into a staged state. */
  readonly identityStage?: IdentityStage;
}

/** The title screen in the arcade shell: brand moment on top, your painted
 * identity card, then the play actions, quiet chrome below. */
export function Home({
  onPractice,
  onJoinRoom,
  helpOpen = false,
  demoResume,
  identityStage,
}: HomeProps) {
  const staged = identityStage !== undefined;
  const [name, setName] = useState(playerName());
  const [profile, setProfile] = useState<Profile>(getProfile());
  const resumeCode = demoResume?.code ?? lastRoom();

  const saveName = () => setPlayerName(name.trim() === '' ? 'Player' : name.trim());

  const chooseColor = (hex: string) => {
    setProfile((p) => ({ ...p, color: hex }));
    void saveProfile({ color: hex });
  };
  const savePaint = (dataUrl: string) => {
    setProfile((p) => ({ ...p, paint: dataUrl }));
    void saveProfile({ paint: dataUrl });
  };

  const shownName = staged ? identityStage.name : name.trim() === '' ? 'Player' : name;
  const shownColor = staged ? identityStage.color : profile.color;
  const shownPaint = staged ? identityStage.paint : profile.paint;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-[clamp(1.25rem,3.5vmin,2.5rem)] overflow-x-clip bg-(--color-ap-ground) p-6 font-arcade-ui text-(--color-ap-text) max-sm:p-4">
      <HeroBanner />

      <ProfileCard
        name={shownName}
        color={shownColor}
        paint={shownPaint}
        editable={!staged}
        onColor={chooseColor}
        onPaint={savePaint}
      />

      <NameField
        value={staged ? identityStage.name : name}
        onChange={staged ? () => undefined : setName}
        onCommit={staged ? () => undefined : saveName}
        error={staged ? (identityStage.nameError ?? null) : null}
      />

      <RecoveryCard {...(staged ? { stage: identityStage.recovery } : {})} />

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
          resumeCode={resumeCode}
          resumeSeries={demoResume?.series}
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
