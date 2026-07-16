import { useState, type CSSProperties } from 'react';
import { generateRoomCode } from './roomCode.js';

export interface PlayMenuProps {
  readonly onPractice: () => void;
  readonly onJoinRoom: (code: string) => void;
  /** The last room this browser sat at, if any. */
  readonly resumeCode: string | null;
}

const PANEL =
  'rounded-(--radius-panel) border border-white/10 bg-(--color-felt-800)/85 shadow-(--shadow-panel)';

/**
 * The title-screen actions: practice (primary), play with friends
 * (create-a-room + join-by-code), and a resume strip when applicable.
 */
export function PlayMenu({ onPractice, onJoinRoom, resumeCode }: PlayMenuProps) {
  const [code, setCode] = useState('');

  const joinTyped = () => {
    const clean = code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
    if (clean !== '') onJoinRoom(clean);
  };

  return (
    <section aria-label="Play" className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={onPractice}
        className="rise-in group relative cursor-pointer overflow-hidden rounded-(--radius-panel) bg-(--color-lamplight) p-5 text-left text-(--color-felt-950) shadow-(--shadow-panel) transition-[filter] duration-(--duration-flick) hover:brightness-110 active:translate-y-px max-sm:p-4"
        style={{ '--rise-delay': '60ms' } as CSSProperties}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-8 -right-6 font-display text-[7rem] leading-none opacity-10 transition-transform duration-(--duration-play) group-hover:-rotate-12"
        >
          ♠
        </span>
        <span className="block font-display text-[clamp(1.35rem,2.6vmin,1.7rem)] font-semibold">
          Practice vs bots
        </span>
        <span className="mt-1 block text-(length:--text-fluid-sm) font-medium opacity-80">
          Deal yourself in — three bots fill the table.
        </span>
        <span
          aria-hidden
          className="mt-4 inline-block text-(length:--text-fluid-sm) font-bold tracking-wide transition-transform duration-(--duration-flick) group-hover:translate-x-1"
        >
          Play now →
        </span>
      </button>

      <div
        className={`rise-in flex flex-col gap-3 p-5 max-sm:p-4 ${PANEL}`}
        style={{ '--rise-delay': '140ms' } as CSSProperties}
      >
        <span className="font-display text-[clamp(1.35rem,2.6vmin,1.7rem)] font-semibold text-(--color-ivory)">
          Play with friends
        </span>
        <button
          type="button"
          onClick={() => onJoinRoom(generateRoomCode())}
          className="cursor-pointer rounded-lg border border-(--color-accent)/60 px-4 py-2.5 font-semibold text-(--color-accent) hover:bg-(--color-accent)/10 active:translate-y-px"
        >
          Create a room
        </button>
        <div
          aria-hidden
          className="flex items-center gap-3 text-(length:--text-fluid-xs) text-(--color-ivory)/40"
        >
          <span className="h-px flex-1 bg-white/10" />
          or join with a code
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            joinTyped();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="room code"
            aria-label="Room code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/25 px-3 py-2.5 text-(--color-ivory) placeholder:text-(--color-ivory)/30 focus:border-(--color-accent)"
          />
          <button
            type="submit"
            className="cursor-pointer whitespace-nowrap rounded-lg border border-white/20 px-4 py-2.5 text-(--color-ivory)/90 hover:bg-white/8"
          >
            Join room
          </button>
        </form>
      </div>

      {resumeCode !== null && (
        <a
          href={`#room/${resumeCode}`}
          className="rise-in flex items-center justify-center gap-2 px-4 py-3 text-(length:--text-fluid-sm) text-(--color-ivory)/80 hover:text-(--color-ivory) sm:col-span-2"
          style={{ '--rise-delay': '220ms' } as CSSProperties}
        >
          <span aria-hidden className="text-(--color-lamplight)">
            ↻
          </span>
          Resume last room ·{' '}
          <span className="font-semibold tracking-wide text-(--color-lamplight)">{resumeCode}</span>
        </a>
      )}
    </section>
  );
}
