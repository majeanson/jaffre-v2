import { useState, type CSSProperties } from 'react';
import { ThemeSwitcher } from '../components/ThemeSwitcher.js';
import { HelpButton } from '../help/HelpButton.js';
import { HeroBanner } from '../home/HeroBanner.js';
import { NameField } from '../home/NameField.js';
import { PlayMenu } from '../home/PlayMenu.js';
import { RecoveryCard } from '../home/RecoveryCard.js';
import { lastRoom, playerName, setPlayerName } from '../net/socket.js';

export interface HomeProps {
  readonly onPractice: () => void;
  readonly onJoinRoom: (code: string) => void;
  /** Mount with the help sheet already open (scene viewer). */
  readonly helpOpen?: boolean;
  /** Scene viewer only: stage a "Your tables" resume row with a series tally. */
  readonly demoResume?:
    { readonly code: string; readonly series?: readonly [number, number] } | undefined;
}

/** The title screen: brand moment on top, play actions as panels, quiet chrome below. */
export function Home({ onPractice, onJoinRoom, helpOpen = false, demoResume }: HomeProps) {
  const [name, setName] = useState(playerName());
  const resumeCode = demoResume?.code ?? lastRoom();

  const saveName = () => setPlayerName(name.trim() === '' ? 'Player' : name.trim());

  return (
    <main className="table-felt flex min-h-dvh flex-col items-center justify-center gap-[clamp(1.25rem,3.5vmin,2.5rem)] overflow-x-clip p-6 max-sm:p-4">
      <HeroBanner />

      <NameField value={name} onChange={setName} onCommit={saveName} />

      <RecoveryCard />

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

      {/* Solid panel so the chrome text sits on a real background axe can read
          (bare text over the felt gradient mis-flags for contrast). */}
      <div
        className="rise-in flex items-center gap-3 rounded-full border border-white/8 bg-(--color-felt-800) px-4 py-2 shadow-(--shadow-panel)"
        style={{ '--rise-delay': '280ms' } as CSSProperties}
      >
        <HelpButton defaultOpen={helpOpen} />
        <ThemeSwitcher />
      </div>
    </main>
  );
}
