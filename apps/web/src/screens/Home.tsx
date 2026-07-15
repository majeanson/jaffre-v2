import { useState, type CSSProperties } from 'react';
import { ThemeSwitcher } from '../components/ThemeSwitcher.js';
import { HelpButton } from '../help/HelpButton.js';
import { HeroBanner } from '../home/HeroBanner.js';
import { NameField } from '../home/NameField.js';
import { PlayMenu } from '../home/PlayMenu.js';
import { lastRoom, playerName, setPlayerName } from '../net/socket.js';

export interface HomeProps {
  readonly onPractice: () => void;
  readonly onJoinRoom: (code: string) => void;
}

/** The title screen: brand moment on top, play actions as panels, quiet chrome below. */
export function Home({ onPractice, onJoinRoom }: HomeProps) {
  const [name, setName] = useState(playerName());
  const resumeCode = lastRoom();

  const saveName = () => setPlayerName(name.trim() === '' ? 'Player' : name.trim());

  return (
    <main className="table-felt flex min-h-dvh flex-col items-center justify-center gap-[clamp(1.25rem,3.5vmin,2.5rem)] overflow-x-clip p-6 max-sm:p-4">
      <HeroBanner />

      <NameField value={name} onChange={setName} onCommit={saveName} />

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
        />
      </div>

      <div
        className="rise-in flex items-center gap-3"
        style={{ '--rise-delay': '280ms' } as CSSProperties}
      >
        <HelpButton />
        <ThemeSwitcher />
      </div>
    </main>
  );
}
