import { useEffect, useState, type CSSProperties } from 'react';
import type { BotDifficulty } from '@jaffre/protocol';
import { AvatarChip, Cta, Panel, useLang, type Lang } from '@jaffre/ui';
import { fetchTableStatus, type TableEntry, type TableStatus } from '../net/rooms.js';
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
    withCode: string;
    roomCode: string;
    joinRoom: string;
    yourTables: string;
    going: (n: number) => string;
    resume: string;
    leaveTable: (code: string) => string;
    tonight: string;
    sun: (n: number) => string;
    moon: (n: number) => string;
    yourGames: string;
    yourRecord: string;
    finished: string;
    yourTurn: string;
    inPlay: string;
    agoNow: string;
    agoMin: (n: number) => string;
    agoH: (n: number) => string;
    agoD: (n: number) => string;
  }
> = {
  en: {
    play: 'Play',
    practice: 'Practice vs bots',
    practiceSub: 'Instant game vs bots — stays off your record.',
    friendsSub: 'Create a room and share its code — these games count.',
    opponents: 'Opponents',
    botDifficulty: 'Bot difficulty',
    playNow: 'Play now',
    playFriends: 'Play with friends',
    createRoom: 'Create a room',
    withCode: 'With code',
    roomCode: 'Room code',
    joinRoom: 'Join room',
    yours: 'Your corner',
    yourTables: 'Your tables',
    going: (n) => `${String(n)} going`,
    resume: 'Resume',
    leaveTable: (code) => `Leave table ${code}`,
    tonight: 'Tonight:',
    sun: (n) => `Sun ${String(n)}`,
    moon: (n) => `Moon ${String(n)}`,
    yourGames: 'Your games',
    yourRecord: 'Your record',
    finished: 'Finished · rematch?',
    yourTurn: 'Your turn',
    inPlay: 'In play',
    agoNow: 'just now',
    agoMin: (n) => `${String(n)} min ago`,
    agoH: (n) => `${String(n)}h ago`,
    agoD: (n) => `${String(n)}d ago`,
  },
  fr: {
    play: 'Jouer',
    practice: 'Pratique contre les bots',
    practiceSub: 'Partie instantanée contre les bots — rien au dossier.',
    friendsSub: 'Crée un salon et partage son code — ces parties comptent.',
    opponents: 'Adversaires',
    botDifficulty: 'Difficulté des bots',
    playNow: 'Jouer maintenant',
    playFriends: 'Jouer entre amis',
    createRoom: 'Créer un salon',
    withCode: 'ou joins avec un code',
    roomCode: 'Code du salon',
    joinRoom: 'Joindre le salon',
    yours: 'Ton coin',
    yourTables: 'Tes tables',
    going: (n) => `${String(n)} en route`,
    resume: 'Reprendre',
    leaveTable: (code) => `Quitter la table ${code}`,
    tonight: 'Ce soir :',
    sun: (n) => `Soleil ${String(n)}`,
    moon: (n) => `Lune ${String(n)}`,
    yourGames: 'Tes parties',
    yourRecord: 'Ton record',
    finished: 'Terminée · revanche?',
    yourTurn: 'À ton tour',
    inPlay: 'En jeu',
    agoNow: "à l'instant",
    agoMin: (n) => `il y a ${String(n)} min`,
    agoH: (n) => `il y a ${String(n)} h`,
    agoD: (n) => `il y a ${String(n)} j`,
  },
};

type Strings = (typeof T)[Lang];

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
  /** Permanently quit a table from its card (frees the seat, drops the card). */
  readonly onLeaveTable?: (code: string) => void;
  /** Open the "Your corner" door on mount (scene viewer stages it open). */
  readonly defaultYoursOpen?: boolean;
}

/** "4 min ago" / "just now" — a coarse relative time for the last snapshot. */
function ago(ts: number, t: Strings): string {
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return t.agoNow;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return t.agoMin(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t.agoH(hours);
  return t.agoD(Math.floor(hours / 24));
}

/** The live badge for a table from its status peek + your seat: your turn /
 * in play / finished. Null when there's nothing live to show yet. */
function liveBadge(
  status: TableStatus | null | undefined,
  yourSeat: number | null | undefined,
  t: Strings,
): { readonly label: string; readonly dot: string } | null {
  if (status == null || !status.started) return null;
  if (status.phase === 'game_over') return { label: t.finished, dot: 'bg-(--color-ap-gold)' };
  const live = status.phase === 'playing' || status.phase === 'bidding';
  if (live && typeof yourSeat === 'number' && status.turn === yourSeat) {
    return { label: t.yourTurn, dot: 'bg-(--color-ap-ok)' };
  }
  return { label: t.inPlay, dot: 'bg-(--color-ap-muted)' };
}

/** One standing-table card: who's there, tonight's tally, and Resume. */
function TableCard({
  table,
  status,
  onResume,
  onLeave,
}: {
  readonly table: TableEntry;
  readonly status?: TableStatus | null;
  readonly onResume: () => void;
  /** Permanently quit this table (frees the seat, drops the card). */
  readonly onLeave?: () => void;
}) {
  const t = T[useLang()];
  const badge = liveBadge(status, table.yourSeat, t);
  // Prefer the live tally from the status peek: the localStorage snapshot goes
  // stale the moment games finish while this browser is away.
  const seriesWins = status?.seriesWins ?? table.seriesWins;
  return (
    <div
      data-testid="table-card"
      className="flex flex-col gap-3 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-4 shadow-(--shadow-ap-sm)"
    >
      {badge !== null && (
        <span className="flex items-center gap-1.5 font-arcade-display text-(length:--text-fluid-xs) uppercase tracking-[0.1em] text-(--color-ap-text)">
          <span className={`size-2 rounded-full ${badge.dot}`} aria-hidden />
          {badge.label}
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-arcade-display text-[0.95em] uppercase tracking-wide text-(--color-ap-gold) tabular-nums">
          {table.code}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
            {ago(table.updatedAt, t)}
          </span>
          {/* Forget-this-table lives in the corner as a ✕ — a full-width row
              pairing it beside Resume overflowed the narrow two-column card. */}
          {onLeave !== undefined && (
            <button
              type="button"
              onClick={onLeave}
              aria-label={t.leaveTable(table.code)}
              title={t.leaveTable(table.code)}
              className="grid size-[1.8em] cursor-pointer place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) text-[0.8em] text-(--color-ap-muted) shadow-(--shadow-ap-sm) transition-[transform,box-shadow,color] duration-(--duration-flick) hover:bg-(--color-ap-panel-hover) hover:text-(--color-ap-text) active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              ✕
            </button>
          )}
        </div>
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
      {seriesWins !== undefined && (
        <span className="font-arcade-ui text-(length:--text-fluid-xs) font-semibold uppercase tracking-[0.12em] text-(--color-ap-muted) tabular-nums">
          {t.tonight} <span style={{ color: 'var(--color-team-a)' }}>{t.sun(seriesWins[0])}</span>
          {' — '}
          <span style={{ color: 'var(--color-team-b)' }}>{t.moon(seriesWins[1])}</span>
        </span>
      )}
      <Cta type="button" onClick={onResume} className="w-full">
        {t.resume}
      </Cta>
    </div>
  );
}

/**
 * The title-screen actions in the arcade shell: practice (primary), play with
 * friends (create-a-room + join-by-code), and the "Your tables" row of standing
 * tables you've sat at.
 */
/** Peek each table's live phase/turn once on mount (+ when the set changes). */
function useTableStatuses(tables: readonly TableEntry[]): Record<string, TableStatus | null> {
  const codes = tables.map((t) => t.code).join(',');
  const [map, setMap] = useState<Record<string, TableStatus | null>>({});
  useEffect(() => {
    const list = codes === '' ? [] : codes.split(',');
    let live = true;
    void Promise.all(list.map(async (c) => [c, await fetchTableStatus(c)] as const)).then(
      (pairs) => {
        if (live) setMap(Object.fromEntries(pairs));
      },
    );
    return () => {
      live = false;
    };
  }, [codes]);
  return map;
}

export function PlayMenu({
  onPractice,
  onJoinRoom,
  tables,
  onLeaveTable,
  defaultYoursOpen = false,
}: PlayMenuProps) {
  const t = T[useLang()];
  const difficultyLabel = DIFFICULTY_LABEL[useLang()];
  const [code, setCode] = useState('');
  const [bots, setBots] = useState<PracticeBots>(loadPracticeBots);
  // One PLAY door: the split (bots vs friends) only appears after you knock.
  const [open, setOpen] = useState(false);
  // Same move for everything that's yours: tables, games, record — one door.
  const [yoursOpen, setYoursOpen] = useState(defaultYoursOpen);
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
              <Cta type="button" variant="secondary" onClick={() => onJoinRoom(generateRoomCode())}>
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

      {/* ONE door for everything that's yours — tables, games, record — the
          same move as the PLAY door above: no three-way split on the title
          screen. The closed button carries the live-tables count. */}
      {!yoursOpen ? (
        <button
          type="button"
          onClick={() => setYoursOpen(true)}
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
      ) : (
        <Panel
          className="rise-in flex flex-col gap-4 p-5 font-arcade-ui max-sm:p-4 sm:col-span-2"
          style={{ '--rise-delay': '220ms' } as CSSProperties}
        >
          {tables.length > 0 && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-arcade-display text-[clamp(1.1rem,2.2vmin,1.4rem)] uppercase text-(--color-ap-text)">
                  {t.yourTables}
                </span>
                <span className="font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                  {t.going(tables.length)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {tables.slice(0, 4).map((tbl) => (
                  <TableCard
                    key={tbl.code}
                    table={tbl}
                    status={statuses[tbl.code] ?? null}
                    onResume={() => onJoinRoom(tbl.code)}
                    {...(onLeaveTable !== undefined
                      ? { onLeave: () => onLeaveTable(tbl.code) }
                      : {})}
                  />
                ))}
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="#history"
              className="inline-flex items-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-5 py-3 font-arcade-display text-[0.8rem] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:bg-(--color-ap-panel-hover) active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            >
              <span aria-hidden className="text-(--color-ap-gold)">
                ♠
              </span>
              {t.yourGames}
            </a>
            <a
              href="#stats"
              className="inline-flex items-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-5 py-3 font-arcade-display text-[0.8rem] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:bg-(--color-ap-panel-hover) active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            >
              <span aria-hidden className="text-(--color-ap-gold)">
                ★
              </span>
              {t.yourRecord}
            </a>
          </div>
        </Panel>
      )}
    </section>
  );
}
