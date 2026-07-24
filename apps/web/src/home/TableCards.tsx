import { useEffect, useState } from 'react';
import { AvatarChip, Cta, useLang, type Lang } from '@jaffre/ui';
import { fetchTableStatus, type TableEntry, type TableStatus } from '../net/rooms.js';
import { botAvatar } from '../paint/botAvatars.js';

const T: Record<
  Lang,
  {
    resume: string;
    leaveTable: (code: string) => string;
    tonight: string;
    sun: (n: number) => string;
    moon: (n: number) => string;
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
    resume: 'Resume',
    leaveTable: (code) => `Leave table ${code}`,
    tonight: 'Tonight:',
    sun: (n) => `Sun ${String(n)}`,
    moon: (n) => `Moon ${String(n)}`,
    finished: 'Finished · rematch?',
    yourTurn: 'Your turn',
    inPlay: 'In play',
    agoNow: 'just now',
    agoMin: (n) => `${String(n)} min ago`,
    agoH: (n) => `${String(n)}h ago`,
    agoD: (n) => `${String(n)}d ago`,
  },
  fr: {
    resume: 'Reprendre',
    leaveTable: (code) => `Quitter la table ${code}`,
    tonight: 'Ce soir :',
    sun: (n) => `Soleil ${String(n)}`,
    moon: (n) => `Lune ${String(n)}`,
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

/** Distinct tints for the seat-stack avatars so a table of bots doesn't read as
 * one grey block of identical "B"s — each seat gets its own hue by position. */
const BOT_TINTS = ['#8a7fe0', '#5aa6c4', '#7bb98f', '#d8a24a'] as const;

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

/** Peek each table's live phase/turn once on mount (+ when the set changes). */
export function useTableStatuses(
  tables: readonly TableEntry[],
): Record<string, TableStatus | null> {
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

/** One standing-table card: who's there, tonight's tally, and Resume. */
export function TableCard({
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
                paint={s.isBot ? botAvatar(i) : (s.paint ?? null)}
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
