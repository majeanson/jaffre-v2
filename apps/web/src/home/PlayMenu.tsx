import { useState, type CSSProperties } from 'react';
import type { BotDifficulty } from '@jaffre/protocol';
import { Cta, useLang, type Lang } from '@jaffre/ui';
import { markMakePublic, type TableEntry } from '../net/rooms.js';
import { useTableStatuses } from './TableCards.js';
import { generateRoomCode } from './roomCode.js';
import {
  loadPracticeBots,
  PRACTICE_BOT_NAMES,
  savePracticeBots,
  type PracticeBots,
} from './practiceBots.js';

const DIFFICULTY_ORDER: readonly BotDifficulty[] = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABEL: Record<Lang, Record<BotDifficulty, string>> = {
  en: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },
  fr: { easy: 'Facile', normal: 'Normal', hard: 'Difficile' },
};

const T: Record<
  Lang,
  {
    play: string;
    yours: string;
    practice: string;
    practiceSub: string;
    friendsSub: string;
    opponents: string;
    botDifficulty: string;
    playNow: string;
    playFriends: string;
    createRoom: string;
    joinPublic: string;
    withCode: string;
    roomCode: string;
    joinRoom: string;
    going: (n: number) => string;
    yourTurn: string;
  }
> = {
  en: {
    play: 'Play',
    practice: 'Practice vs bots',
    practiceSub: 'Instant — stays off your record.',
    friendsSub: 'Share a room code — these games count.',
    opponents: 'Opponents',
    botDifficulty: 'Bot difficulty',
    playNow: 'Play now',
    playFriends: 'Play with friends',
    createRoom: 'Create a room',
    joinPublic: 'Join a public game',
    withCode: 'With code',
    roomCode: 'Room code',
    joinRoom: 'Join room',
    yours: 'Your corner',
    going: (n) => `${String(n)} going`,
    yourTurn: 'Your turn',
  },
  fr: {
    play: 'Jouer',
    practice: 'Pratique contre les bots',
    practiceSub: 'Instantané — rien au dossier.',
    friendsSub: 'Partage un code de salon — ces parties comptent.',
    opponents: 'Adversaires',
    botDifficulty: 'Difficulté des bots',
    playNow: 'Jouer maintenant',
    playFriends: 'Jouer entre amis',
    createRoom: 'Créer un salon',
    joinPublic: 'Joindre une partie publique',
    withCode: 'ou joins avec un code',
    roomCode: 'Code du salon',
    joinRoom: 'Joindre le salon',
    yours: 'Ton coin',
    going: (n) => `${String(n)} en route`,
    yourTurn: 'À ton tour',
  },
};

function nextDifficulty(current: BotDifficulty): BotDifficulty {
  const i = DIFFICULTY_ORDER.indexOf(current);
  return DIFFICULTY_ORDER[(i + 1) % DIFFICULTY_ORDER.length] as BotDifficulty;
}

export interface PlayMenuProps {
  readonly onPractice: () => void;
  readonly onJoinRoom: (code: string) => void;
  /** Tables this browser has sat at, newest first — feeds the door's count. */
  readonly tables: readonly TableEntry[];
}

/**
 * The title-screen actions in the arcade shell: practice (primary), play with
 * friends (create-a-room + join-by-code), and the "Your corner" door into the
 * full-sheet meta screens (tables, games, record, …).
 */
export function PlayMenu({ onPractice, onJoinRoom, tables }: PlayMenuProps) {
  const t = T[useLang()];
  const difficultyLabel = DIFFICULTY_LABEL[useLang()];
  const [code, setCode] = useState('');
  const [bots, setBots] = useState<PracticeBots>(loadPracticeBots);
  // One PLAY door: the split (bots vs friends) only appears after you knock.
  const [open, setOpen] = useState(false);
  const statuses = useTableStatuses(tables);
  // A live table is waiting on YOU — the closed door announces it.
  const yourTurn = tables.some((tbl) => {
    const s = statuses[tbl.code];
    return (
      s != null &&
      s.started &&
      (s.phase === 'playing' || s.phase === 'bidding') &&
      typeof tbl.yourSeat === 'number' &&
      s.turn === tbl.yourSeat
    );
  });

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
      aria-label={t.play}
      className="grid w-full grid-cols-1 gap-3 font-arcade-ui sm:grid-cols-2"
    >
      {/* ONE door in: a single PLAY panel. The bots-vs-friends split only
          appears after you press it — no split on the title screen itself. */}
      <div
        className="rise-in group relative flex flex-col gap-4 overflow-hidden rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-violet) p-5 text-(--color-ap-ink) shadow-(--shadow-ap-lg) max-sm:p-4 sm:col-span-2"
        style={{ '--rise-delay': '60ms' } as CSSProperties}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-8 -right-6 font-arcade-display text-[7rem] leading-none opacity-15 transition-transform duration-(--duration-play) group-hover:-rotate-12"
        >
          ♠
        </span>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative z-10 flex w-full cursor-pointer items-center justify-center gap-3 py-[clamp(0.8rem,2.4vmin,1.5rem)] font-arcade-display text-[clamp(1.5rem,3.4vmin,2.1rem)] uppercase tracking-wide transition-transform duration-(--duration-flick) active:translate-y-[2px]"
          >
            {t.play}
            <span
              aria-hidden
              className="transition-transform duration-(--duration-flick) group-hover:translate-x-1"
            >
              →
            </span>
          </button>
        ) : (
          // Base grid-cols-1 is load-bearing: an implicit column sizes to its
          // content and can silently overflow a 390px viewport (see the
          // scenes.spec "home fits" regression note).
          <div className="relative z-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <span className="font-arcade-display text-[clamp(1.2rem,2.4vmin,1.5rem)] uppercase">
                {t.practice}
              </span>
              {/* Full-opacity ink (see the withCode note): muted fails AA here. */}
              <span className="-mt-1.5 font-arcade-ui text-(length:--text-fluid-xs) leading-snug">
                {t.practiceSub}
              </span>
              {/* Tap a bot to cycle its difficulty; "Play now" starts. */}
              <div
                className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-(length:--text-fluid-xs)"
                aria-label={t.botDifficulty}
              >
                <span className="font-arcade-display uppercase tracking-wide">{t.opponents}</span>
                {([0, 1, 2] as const).map((seat) => (
                  <button
                    key={seat}
                    type="button"
                    onClick={() => cycleBot(seat)}
                    className="cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-2 py-0.5 text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
                  >
                    {PRACTICE_BOT_NAMES[seat]} · {difficultyLabel[bots[seat]]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onPractice}
                className="mt-auto inline-flex cursor-pointer items-center gap-2 self-start rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-2 font-arcade-display text-(length:--text-fluid-sm) uppercase tracking-wide text-(--color-ap-violet) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:brightness-110 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
              >
                {t.playNow}
                <span aria-hidden>→</span>
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <span className="font-arcade-display text-[clamp(1.2rem,2.4vmin,1.5rem)] uppercase">
                {t.playFriends}
              </span>
              <span className="-mt-1.5 font-arcade-ui text-(length:--text-fluid-xs) leading-snug">
                {t.friendsSub}
              </span>
              {/* The public path leads to the LIVE lobby list — you see who's
                  open and pick, instead of being teleported blind; the lobby's
                  own Quick Play still one-taps into the fullest table (or
                  hosts a fresh public one when the list is empty). */}
              <Cta
                type="button"
                onClick={() => {
                  location.hash = '#lobby';
                }}
              >
                {t.joinPublic}
              </Cta>
              <Cta
                type="button"
                variant="secondary"
                onClick={() => {
                  // New tables are public by default — the pre-game toggle is
                  // how a host opts DOWN to invite-only.
                  const code = generateRoomCode();
                  markMakePublic(code);
                  onJoinRoom(code);
                }}
              >
                {t.createRoom}
              </Cta>
              {/* Full-opacity ink: a faded label on the violet ground fails AA. */}
              <div
                aria-hidden
                className="flex items-center gap-3 font-arcade-display text-(length:--text-fluid-xs) uppercase tracking-wide"
              >
                <span className="h-0.5 flex-1 bg-(--color-ap-ink)" />
                {t.withCode}
                <span className="h-0.5 flex-1 bg-(--color-ap-ink)" />
              </div>
              {/* Stack input over button: the join label is long in French
                  ("Joindre le salon") and a side-by-side row squished the field
                  down to a sliver in the narrow rail. Full-width both. */}
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  joinTyped();
                }}
              >
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="early-newt-os"
                  aria-label={t.roomCode}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full min-w-0 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-3 py-2.5 text-(--color-ap-text) placeholder:text-(--color-ap-muted) focus:bg-(--color-ap-panel-hover)"
                />
                <button
                  type="submit"
                  className="w-full cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-2.5 font-arcade-display text-[0.95em] uppercase text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
                >
                  {t.joinRoom}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ONE door for everything that's yours — it opens the full "Your
          corner" sheet (#corner) whose subtab strip fans out to tables, games,
          record, and the rest. The closed button carries the live-tables
          count. Stays a <button> (not an <a>): the e2e suite and the PLAY
          door both address the title-screen doors by button role. */}
      <button
        type="button"
        onClick={() => {
          location.hash = '#corner';
        }}
        className={`rise-in flex items-center justify-center gap-3 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-5 py-4 font-arcade-display text-[clamp(1.1rem,2.2vmin,1.4rem)] uppercase tracking-wide text-(--color-ap-text) transition-[transform,box-shadow] duration-(--duration-flick) hover:bg-(--color-ap-panel-hover) active:translate-x-[3px] active:translate-y-[3px] active:shadow-none sm:col-span-2 ${
          yourTurn ? 'ap-glow' : 'shadow-(--shadow-ap-sm)'
        }`}
        style={{ '--rise-delay': '220ms' } as CSSProperties}
      >
        <span aria-hidden className="text-(--color-ap-gold)">
          ★
        </span>
        {t.yours}
        {yourTurn ? (
          <span className="flex items-center gap-1.5 font-arcade-ui text-(length:--text-fluid-xs) normal-case tracking-normal text-(--color-ap-ok)">
            <span aria-hidden className="size-2 animate-pulse rounded-full bg-(--color-ap-ok)" />
            {t.yourTurn}
          </span>
        ) : (
          tables.length > 0 && (
            <span className="font-arcade-ui text-(length:--text-fluid-xs) normal-case tracking-normal text-(--color-ap-muted)">
              {t.going(tables.length)}
            </span>
          )
        )}
        <span aria-hidden>→</span>
      </button>
    </section>
  );
}
