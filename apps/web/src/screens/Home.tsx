import { useState } from 'react';
import { lastRoom, playerName, setPlayerName } from '../net/socket.js';

export interface HomeProps {
  readonly onPractice: () => void;
  readonly onJoinRoom: (code: string) => void;
}

export function Home({ onPractice, onJoinRoom }: HomeProps) {
  const [name, setName] = useState(playerName());
  const [code, setCode] = useState('');
  const resumeCode = lastRoom();

  const saveName = () => setPlayerName(name.trim() === '' ? 'Player' : name.trim());

  return (
    <main className="table-felt grid min-h-screen place-items-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <header className="text-center">
          <h1 className="font-display text-6xl font-semibold text-(--color-lamplight) drop-shadow-[0_2px_12px_rgb(242_198_109/0.25)]">
            Jaffre
          </h1>
          <p className="mt-2 text-sm text-(--color-ivory)/60">
            Trick-taking for four. Bid, take the tricks, first team to 41.
          </p>
        </header>

        <label className="flex flex-col gap-1.5 text-sm text-(--color-ivory)/80">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            maxLength={20}
            className="rounded-lg border border-white/15 bg-black/25 px-3 py-2.5 text-(--color-ivory) placeholder:text-(--color-ivory)/30 focus:border-(--color-accent)"
            placeholder="Player"
          />
        </label>

        <button
          onClick={() => {
            saveName();
            onPractice();
          }}
          className="rounded-(--radius-panel) bg-(--color-lamplight) px-4 py-3.5 font-semibold text-(--color-felt-950) shadow-(--shadow-panel) hover:brightness-110 active:translate-y-px cursor-pointer"
        >
          Practice vs bots
        </button>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = code
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '');
            if (clean !== '') {
              saveName();
              onJoinRoom(clean);
            }
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="room code"
            aria-label="Room code"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/25 px-3 py-2.5 text-(--color-ivory) placeholder:text-(--color-ivory)/30 focus:border-(--color-accent)"
          />
          <button
            type="submit"
            className="rounded-lg border border-white/20 px-4 py-2.5 text-(--color-ivory)/90 hover:bg-white/8 cursor-pointer"
          >
            Join room
          </button>
        </form>

        <p className="text-center text-xs text-(--color-ivory)/60">
          Friends can also join straight from a link:{' '}
          <span className="tabular-nums break-all text-(--color-ivory)/80">
            {location.origin}/#room/your-code
          </span>
        </p>

        {resumeCode !== null && (
          <a
            href={`#room/${resumeCode}`}
            className="text-center text-sm text-(--color-lamplight) underline underline-offset-4 hover:brightness-110"
          >
            Resume last room · {resumeCode}
          </a>
        )}
      </div>
    </main>
  );
}
