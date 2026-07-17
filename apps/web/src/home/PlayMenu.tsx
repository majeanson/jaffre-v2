import { useState, type CSSProperties } from 'react';
import type { BotDifficulty } from '@jaffre/protocol';
import { AvatarChip, Cta, Panel } from '@jaffre/ui';
import type { TableEntry } from '../net/rooms.js';
import { generateRoomCode } from './roomCode.js';
import {
  loadPracticeBots,
  PRACTICE_BOT_NAMES,
  savePracticeBots,
  type PracticeBots,
} from './practiceBots.js';

const DIFFICULTY_ORDER: readonly BotDifficulty[] = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

function nextDifficulty(current: BotDifficulty): BotDifficulty {
  const i = DIFFICULTY_ORDER.indexOf(current);
  return DIFFICULTY_ORDER[(i + 1) % DIFFICULTY_ORDER.length] as BotDifficulty;
}

/** Distinct tints for the seat-stack avatars so a table of bots doesn't read as
 * one grey block of identical "B"s — each seat gets its own hue by position. */
const BOT_TINTS = ['#8a7fe0', '#5aa6c4', '#7bb98f', '#d8a24a'] as const;

export interface PlayMenuProps {
  readonly onPractice: () => void;
  readonly onJoinRoom: (code: string) => void;
  /** Tables this browser has sat at, newest first — the "Your tables" row. */
  readonly tables: readonly TableEntry[];
}

/** "4 min ago" / "just now" — a coarse relative time for the last snapshot. */
function ago(ts: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${String(mins)} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${String(hours)}h ago`;
  return `${String(Math.floor(hours / 24))}d ago`;
}

/** One standing-table card: who's there, tonight's tally, and Resume. */
function TableCard({
  table,
  onResume,
}: {
  readonly table: TableEntry;
  readonly onResume: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-4 shadow-(--shadow-ap-sm)">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-arcade-display text-[0.95em] uppercase tracking-wide text-(--color-ap-gold) tabular-nums">
          {table.code}
        </span>
        <span className="shrink-0 font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
          {ago(table.updatedAt)}
        </span>
      </div>
      {table.seats.length > 0 && (
        <div className="flex items-center">
          {table.seats.slice(0, 4).map((s, i) => (
            <span key={i} className={i === 0 ? '' : '-ml-2'}>
              <AvatarChip
                name={s.name}
                color={s.isBot ? BOT_TINTS[i % BOT_TINTS.length] : undefined}
                size="sm"
              />
            </span>
          ))}
        </div>
      )}
      {table.seriesWins !== undefined && (
        <span className="font-arcade-ui text-(length:--text-fluid-xs) font-semibold uppercase tracking-[0.12em] text-(--color-ap-muted) tabular-nums">
          Tonight: <span style={{ color: 'var(--color-team-a)' }}>Sun {table.seriesWins[0]}</span>
          {' — '}
          <span style={{ color: 'var(--color-team-b)' }}>Moon {table.seriesWins[1]}</span>
        </span>
      )}
      <Cta type="button" onClick={onResume} className="w-full">
        Resume
      </Cta>
    </div>
  );
}

/**
 * The title-screen actions in the arcade shell: practice (primary), play with
 * friends (create-a-room + join-by-code), and the "Your tables" row of standing
 * tables you've sat at.
 */
export function PlayMenu({ onPractice, onJoinRoom, tables }: PlayMenuProps) {
  const [code, setCode] = useState('');
  const [bots, setBots] = useState<PracticeBots>(loadPracticeBots);

  const cycleBot = (seat: 0 | 1 | 2) => {
    const next = bots.map((d, i) =>
      i === seat ? nextDifficulty(d) : d,
    ) as unknown as PracticeBots;
    setBots(next);
    savePracticeBots(next);
  };

  const joinTyped = () => {
    const clean = code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '');
    if (clean !== '') onJoinRoom(clean);
  };

  return (
    <section
      aria-label="Play"
      className="grid w-full grid-cols-1 gap-3 font-arcade-ui sm:grid-cols-2"
    >
      <div
        className="rise-in group relative flex flex-col gap-3 overflow-hidden rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-violet) p-5 text-(--color-ap-ink) shadow-(--shadow-ap-lg) max-sm:p-4"
        style={{ '--rise-delay': '60ms' } as CSSProperties}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-8 -right-6 font-arcade-display text-[7rem] leading-none opacity-15 transition-transform duration-(--duration-play) group-hover:-rotate-12"
        >
          ♠
        </span>
        <span className="block font-arcade-display text-[clamp(1.4rem,2.8vmin,1.8rem)] uppercase">
          Practice vs bots
        </span>
        {/* The three bots live right inside the pill — tap one to cycle its
            difficulty. (Nested here as real buttons, so the pill itself can't
            be one big button; "Play now" is the action.) */}
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-(length:--text-fluid-xs)"
          aria-label="Bot difficulty"
        >
          <span className="font-arcade-display uppercase tracking-wide opacity-70">Opponents</span>
          {([0, 1, 2] as const).map((seat) => (
            <button
              key={seat}
              type="button"
              onClick={() => cycleBot(seat)}
              className="cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-2 py-0.5 text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
            >
              {PRACTICE_BOT_NAMES[seat]} · {DIFFICULTY_LABEL[bots[seat]]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onPractice}
          className="mt-1 inline-flex cursor-pointer items-center gap-2 self-start rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-2 font-arcade-display text-(length:--text-fluid-sm) uppercase tracking-wide text-(--color-ap-violet) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:brightness-110 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          Play now
          <span aria-hidden className="transition-transform duration-(--duration-flick) group-hover:translate-x-1">
            →
          </span>
        </button>
      </div>

      <Panel
        className="rise-in flex flex-col gap-3 p-5 max-sm:p-4"
        style={{ '--rise-delay': '140ms' } as CSSProperties}
      >
        <span className="font-arcade-display text-[clamp(1.4rem,2.8vmin,1.8rem)] uppercase text-(--color-ap-text)">
          Play with friends
        </span>
        <Cta type="button" variant="secondary" onClick={() => onJoinRoom(generateRoomCode())}>
          Create a room
        </Cta>
        <div
          aria-hidden
          className="flex items-center gap-3 font-arcade-display text-(length:--text-fluid-xs) uppercase tracking-wide text-(--color-ap-muted)"
        >
          <span className="h-0.5 flex-1 bg-(--color-ap-ink)" />
          With code
          <span className="h-0.5 flex-1 bg-(--color-ap-ink)" />
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
            placeholder="early-newt-os"
            aria-label="Room code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-3 py-2.5 text-(--color-ap-text) placeholder:text-(--color-ap-muted) focus:bg-(--color-ap-panel-hover)"
          />
          <button
            type="submit"
            className="cursor-pointer whitespace-nowrap rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-2.5 font-arcade-display text-[0.95em] uppercase text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
          >
            Join room
          </button>
        </form>
      </Panel>

      {tables.length > 0 && (
        <Panel
          className="rise-in flex flex-col gap-3 p-5 font-arcade-ui max-sm:p-4 sm:col-span-2"
          style={{ '--rise-delay': '220ms' } as CSSProperties}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="font-arcade-display text-[clamp(1.1rem,2.2vmin,1.4rem)] uppercase text-(--color-ap-text)">
              Your tables
            </span>
            <span className="font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
              {tables.length} going
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tables.slice(0, 4).map((t) => (
              <TableCard key={t.code} table={t} onResume={() => onJoinRoom(t.code)} />
            ))}
          </div>
        </Panel>
      )}

      <div
        className="rise-in flex flex-wrap items-center justify-center gap-3 sm:col-span-2"
        style={{ '--rise-delay': '300ms' } as CSSProperties}
      >
        <a
          href="#history"
          className="inline-flex items-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-5 py-3 font-arcade-display text-[0.8rem] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:bg-(--color-ap-panel-hover) active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <span aria-hidden className="text-(--color-ap-gold)">
            ♠
          </span>
          Your games
        </a>
        <a
          href="#stats"
          className="inline-flex items-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-5 py-3 font-arcade-display text-[0.8rem] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:bg-(--color-ap-panel-hover) active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <span aria-hidden className="text-(--color-ap-gold)">
            ★
          </span>
          Your record
        </a>
      </div>
    </section>
  );
}
