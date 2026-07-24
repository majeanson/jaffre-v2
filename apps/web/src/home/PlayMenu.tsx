import { useEffect, useState, type CSSProperties } from 'react';
import { Cta, useLang, type Lang } from '@jaffre/ui';
import { markMakePublic, type TableEntry } from '../net/rooms.js';
import { TableCard, useTableStatuses } from './TableCards.js';
import { generateRoomCode } from './roomCode.js';
import {
  botsFromSetting,
  loadPracticeBots,
  savePracticeBots,
  settingFromBots,
  SETTING_ORDER,
  type PracticeSetting,
} from './practiceBots.js';

const DIFFICULTY_LABEL: Record<Lang, Record<PracticeSetting, string>> = {
  en: { easy: 'Easy', normal: 'Normal', hard: 'Hard', mixed: 'Mixed' },
  fr: { easy: 'Facile', normal: 'Normal', hard: 'Difficile', mixed: 'Variés' },
};

const T: Record<
  Lang,
  {
    play: string;
    yourTables: string;
    practice: string;
    botsChip: (label: string) => string;
    botDifficulty: string;
    playNow: string;
    create: string;
    join: string;
    publicTable: string;
    privateTable: string;
    back: string;
    joinPublic: string;
    roomCode: string;
    joinRoom: string;
    yourTurn: string;
  }
> = {
  en: {
    play: 'Play',
    yourTables: 'Your tables',
    practice: 'Practice vs bots',
    botsChip: (label) => `Bots: ${label}`,
    botDifficulty: 'Bot difficulty',
    playNow: 'Play now',
    create: 'Create',
    join: 'Join',
    publicTable: 'Public table',
    privateTable: 'Private table',
    back: '← Back',
    joinPublic: 'Join a public game',
    roomCode: 'Room code',
    joinRoom: 'Join room',
    yourTurn: 'Your turn',
  },
  fr: {
    play: 'Jouer',
    yourTables: 'Tes tables',
    practice: 'Pratique contre les bots',
    botsChip: (label) => `Bots : ${label}`,
    botDifficulty: 'Difficulté des bots',
    playNow: 'Jouer maintenant',
    create: 'Créer',
    join: 'Joindre',
    publicTable: 'Table publique',
    privateTable: 'Table privée',
    back: '← Retour',
    joinPublic: 'Joindre une partie publique',
    roomCode: 'Code du salon',
    joinRoom: 'Joindre le salon',
    yourTurn: 'À ton tour',
  },
};

function nextSetting(current: PracticeSetting): PracticeSetting {
  const i = SETTING_ORDER.indexOf(current);
  return SETTING_ORDER[(i + 1) % SETTING_ORDER.length] as PracticeSetting;
}

export interface PlayMenuProps {
  readonly onPractice: () => void;
  readonly onJoinRoom: (code: string) => void;
  /** Tables this browser has sat at, newest first — feeds the door's count. */
  readonly tables: readonly TableEntry[];
  /** Permanently quit a standing table (frees the seat, drops the card). */
  readonly onQuitTable?: (code: string) => void;
  /** Mount with the door already open (scene viewer). */
  readonly defaultOpen?: boolean;
  /** Scene staging: the door's initial step once open (defaults to 'root'). */
  readonly defaultStep?: 'create' | 'join';
}

/**
 * The title-screen PLAY door in the arcade shell: your standing tables (if
 * any), practice vs bots, and play with friends (public lobby + create/join a
 * room), all one column behind a single knock.
 */
export function PlayMenu({
  onPractice,
  onJoinRoom,
  tables,
  onQuitTable,
  defaultOpen,
  defaultStep,
}: PlayMenuProps) {
  const lang = useLang();
  const t = T[lang];
  const difficultyLabel = DIFFICULTY_LABEL[lang];
  const [code, setCode] = useState('');
  const [setting, setSetting] = useState<PracticeSetting>(() =>
    settingFromBots(loadPracticeBots()),
  );
  // One PLAY door: everything else only appears after you knock.
  const [open, setOpen] = useState(defaultOpen ?? false);
  // Root offers CREATE / JOIN; each step drills into its own actions.
  const [step, setStep] = useState<'root' | 'create' | 'join'>(defaultStep ?? 'root');
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

  // Closing the door forgets which step you were on, so it always reopens fresh.
  useEffect(() => {
    if (!open) setStep(defaultStep ?? 'root');
  }, [open, defaultStep]);

  const cycleSetting = () => {
    const next = nextSetting(setting);
    setSetting(next);
    savePracticeBots(botsFromSetting(next));
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
      {/* ONE door in: a single PLAY panel. Everything else only appears after
          you press it — no split on the title screen itself. */}
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
            {yourTurn ? (
              <span className="flex items-center gap-1.5 font-arcade-ui text-(length:--text-fluid-xs) normal-case tracking-normal text-(--color-ap-ok)">
                <span
                  aria-hidden
                  className="size-2 animate-pulse rounded-full bg-(--color-ap-ok)"
                />
                {t.yourTurn}
              </span>
            ) : null}
            <span
              aria-hidden
              className="transition-transform duration-(--duration-flick) group-hover:translate-x-1"
            >
              →
            </span>
          </button>
        ) : (
          <div className="relative z-10 flex flex-col gap-5">
            {tables.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="font-arcade-display text-[clamp(1rem,2vmin,1.2rem)] uppercase tracking-wide">
                  {t.yourTables}
                </span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* MAX standing tables (net/rooms.ts) is 6 — the same cap, so
                      nothing here is ever silently hidden. */}
                  {tables.slice(0, 6).map((tbl) => (
                    <TableCard
                      key={tbl.code}
                      table={tbl}
                      status={statuses[tbl.code] ?? null}
                      onResume={() => {
                        location.hash = '#room/' + tbl.code;
                      }}
                      {...(onQuitTable !== undefined
                        ? { onLeave: () => onQuitTable(tbl.code) }
                        : {})}
                    />
                  ))}
                </div>
              </div>
            )}

            {step === 'root' && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setStep('create')}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-[clamp(0.7rem,2vmin,1.1rem)] font-arcade-display text-[clamp(1.1rem,2.6vmin,1.5rem)] uppercase tracking-wide text-(--color-ap-violet) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:brightness-110 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                >
                  {t.create}
                  <span aria-hidden>→</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep('join')}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-[clamp(0.7rem,2vmin,1.1rem)] font-arcade-display text-[clamp(1.1rem,2.6vmin,1.5rem)] uppercase tracking-wide text-(--color-ap-violet) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:brightness-110 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                >
                  {t.join}
                  <span aria-hidden>→</span>
                </button>
              </div>
            )}

            {step === 'create' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <span className="font-arcade-display text-[clamp(1.2rem,2.4vmin,1.5rem)] uppercase">
                    {t.practice}
                  </span>
                  {/* Tap to cycle the shared difficulty; "Play now" starts. */}
                  <button
                    type="button"
                    onClick={cycleSetting}
                    aria-label={t.botDifficulty}
                    className="w-fit cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-2 py-0.5 text-(length:--text-fluid-xs) text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
                  >
                    {t.botsChip(difficultyLabel[setting])}
                  </button>
                  <button
                    type="button"
                    onClick={onPractice}
                    className="mt-auto inline-flex cursor-pointer items-center gap-2 self-start rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-2 font-arcade-display text-(length:--text-fluid-sm) uppercase tracking-wide text-(--color-ap-violet) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:brightness-110 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                  >
                    {t.playNow}
                    <span aria-hidden>→</span>
                  </button>
                </div>

                <Cta
                  type="button"
                  onClick={() => {
                    // New tables are public by default — the pre-game toggle is
                    // how a host opts DOWN to invite-only.
                    const roomCode = generateRoomCode();
                    markMakePublic(roomCode);
                    onJoinRoom(roomCode);
                  }}
                >
                  {t.publicTable}
                </Cta>
                <Cta
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    // Invite-only: no markMakePublic — the in-lobby public toggle
                    // still lets a host opt up once seated.
                    const roomCode = generateRoomCode();
                    onJoinRoom(roomCode);
                  }}
                >
                  {t.privateTable}
                </Cta>

                <button
                  type="button"
                  onClick={() => setStep('root')}
                  className="w-fit cursor-pointer font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-ink) hover:underline"
                >
                  {t.back}
                </button>
              </div>
            )}

            {step === 'join' && (
              <div className="flex flex-col gap-4">
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

                <button
                  type="button"
                  onClick={() => setStep('root')}
                  className="w-fit cursor-pointer font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-ink) hover:underline"
                >
                  {t.back}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
