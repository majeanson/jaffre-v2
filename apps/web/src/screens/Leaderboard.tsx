import { useEffect, useState } from 'react';
import { AvatarChip, PixelWave, useLang, type Lang } from '@jaffre/ui';
import {
  fetchLeaderboard,
  fetchMonthlyLeaderboard,
  type Leaderboard as LeaderboardData,
  type MonthlyLeaderboard,
} from '../net/history.js';
import { MetaHeader } from '../components/MetaHeader.js';
import { MetaNav } from '../components/MetaNav.js';
import { ShellNote } from '../components/ShellNote.js';

export interface LeaderboardProps {
  readonly onLeave: () => void;
  /** Scene viewer: staged data so the screen renders without the network. */
  readonly demo?: LeaderboardData;
  /** Scene viewer: staged monthly board, mounted on that tab. */
  readonly demoMonth?: MonthlyLeaderboard;
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    loading: string;
    error: string;
    empty: string;
    you: string;
    games: (n: number) => string;
    allTime: string;
    thisMonth: string;
    monthEmpty: string;
    winCount: (n: number) => string;
    ofGames: (n: number) => string;
  }
> = {
  en: {
    title: 'Leaderboard',
    home: 'Home',
    loading: 'Loading…',
    error: "Couldn't load the leaderboard. Try again shortly.",
    empty: 'No ranked players yet. Play 10 online games to join the ladder.',
    you: 'You',
    games: (n) => `${String(n)} games`,
    allTime: 'All-time',
    thisMonth: 'This month',
    monthEmpty: 'No games finished this month yet. Play one and you are on the board.',
    winCount: (n) => (n === 1 ? '1 win' : `${String(n)} wins`),
    ofGames: (n) => `of ${String(n)} played`,
  },
  fr: {
    title: 'Classement',
    home: 'Accueil',
    loading: 'Chargement…',
    error: 'Impossible de charger le classement. Réessaie bientôt.',
    empty: 'Aucun joueur classé. Joue 10 parties en ligne pour entrer au classement.',
    you: 'Toi',
    games: (n) => `${String(n)} parties`,
    allTime: 'À vie',
    thisMonth: 'Ce mois-ci',
    monthEmpty: 'Aucune partie terminée ce mois-ci. Joues-en une et tu es au tableau.',
    winCount: (n) => (n === 1 ? '1 victoire' : `${String(n)} victoires`),
    ofGames: (n) => `sur ${String(n)} jouées`,
  },
};

/** The global skill ladder — top-rated players, with the caller's own row
 * pinned below when they rank outside the visible top. */
export function Leaderboard({ onLeave, demo, demoMonth }: LeaderboardProps) {
  const t = T[useLang()];
  const [board, setBoard] = useState<LeaderboardData | null>(demo ?? null);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<'all' | 'month'>(demoMonth !== undefined ? 'month' : 'all');
  const [month, setMonth] = useState<MonthlyLeaderboard | null>(demoMonth ?? null);
  const [monthError, setMonthError] = useState(false);

  useEffect(() => {
    if (demo !== undefined) return;
    let live = true;
    fetchLeaderboard()
      .then((b) => live && setBoard(b))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [demo]);

  // Fetched lazily: most visits only ever look at one of the two boards, and
  // the monthly query is a GROUP BY over the month's games.
  useEffect(() => {
    if (demo !== undefined || period !== 'month' || month !== null) return;
    let live = true;
    fetchMonthlyLeaderboard()
      .then((m) => live && setMonth(m))
      .catch(() => live && setMonthError(true));
    return () => {
      live = false;
    };
  }, [demo, period, month]);

  const meId = board?.you?.id ?? null;
  const topHasYou = meId !== null && (board?.top.some((r) => r.id === meId) ?? false);

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />

        <MetaNav current="leaderboard" />

        {/* Two questions, not two ladders. All-time is the skill record and
            takes 10 rated games to enter — a board a newcomer cannot appear on
            for a week. This month is who has WON the most since the 1st, open
            from your first finished game, and it renews on its own so level 20
            isn't the end of the road. No Elo reset: with a small pool a reset
            punishes everyone and throws away the all-time record. */}
        <nav className="flex gap-2" aria-label={t.title}>
          {(['all', 'month'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              aria-current={period === p}
              className={`rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-[0.7em] py-[0.25em] font-arcade-ui text-[0.78em] uppercase tracking-wide shadow-(--shadow-ap-sm) ${
                period === p
                  ? 'bg-(--color-ap-violet) text-(--color-ap-ink)'
                  : 'bg-(--color-ap-panel) text-(--color-ap-muted)'
              }`}
            >
              {p === 'all' ? t.allTime : t.thisMonth}
            </button>
          ))}
        </nav>

        {period === 'month' ? (
          monthError ? (
            <ShellNote>{t.error}</ShellNote>
          ) : month === null ? (
            <ShellNote>
              <PixelWave label={t.loading} />
            </ShellNote>
          ) : month.top.length === 0 ? (
            <ShellNote>{t.monthEmpty}</ShellNote>
          ) : (
            <ol className="flex flex-col gap-2">
              {month.top.map((row) => (
                <Row
                  key={row.id}
                  rank={row.rank}
                  row={row}
                  mine={month.you?.id === row.id}
                  youLabel={t.you}
                  metric={t.winCount(row.wins)}
                  sub={t.ofGames(row.games)}
                />
              ))}
            </ol>
          )
        ) : error ? (
          <ShellNote>{t.error}</ShellNote>
        ) : board === null ? (
          <ShellNote>
            <PixelWave label={t.loading} />
          </ShellNote>
        ) : board.top.length === 0 ? (
          <ShellNote>{t.empty}</ShellNote>
        ) : (
          <ol className="flex flex-col gap-2">
            {board.top.map((row, i) => (
              <Row
                key={row.id}
                rank={i + 1}
                row={row}
                mine={row.id === meId}
                youLabel={t.you}
                metric={String(Math.round(row.rating))}
                sub={t.games(row.ratingGames)}
              />
            ))}
            {board.you != null && !topHasYou && (
              <>
                <li className="py-1 text-center font-arcade-display text-(--color-ap-muted)">
                  ···
                </li>
                <Row
                  rank={board.you.rank}
                  row={board.you}
                  mine
                  youLabel={t.you}
                  metric={String(Math.round(board.you.rating))}
                  sub={t.games(board.you.ratingGames)}
                />
              </>
            )}
          </ol>
        )}
      </div>
    </main>
  );
}

/** One ladder row. Takes its two numbers as ALREADY-FORMATTED strings so the
 * all-time board (rating / games) and the monthly one (wins / net) share the
 * row instead of forking it — the layout is the same question either way. */
function Row({
  rank,
  row,
  mine,
  youLabel,
  metric,
  sub,
}: {
  readonly rank: number;
  readonly row: { readonly name: string; readonly color: string | null };
  readonly mine: boolean;
  readonly youLabel: string;
  readonly metric: string;
  readonly sub: string;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) px-[0.9em] py-[0.6em] shadow-(--shadow-ap-sm) ${
        mine ? 'bg-(--color-ap-violet)/15' : 'bg-(--color-ap-panel)'
      }`}
    >
      <span className="w-[2ch] shrink-0 text-right font-arcade-display text-[1.1em] text-(--color-ap-gold)">
        {rank}
      </span>
      <AvatarChip name={row.name} color={row.color ?? undefined} size="sm" />
      <span className="min-w-0 flex-1 truncate font-arcade-ui text-(--color-ap-text)">
        {row.name}
        {mine && (
          <span className="ml-[0.5em] font-arcade-display text-[0.7em] uppercase text-(--color-ap-violet-soft)">
            {youLabel}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-arcade-display text-[1.05em] text-(--color-ap-text)">
          {metric}
        </span>
        <span className="block font-arcade-ui text-[0.7em] text-(--color-ap-muted)">{sub}</span>
      </span>
    </li>
  );
}
