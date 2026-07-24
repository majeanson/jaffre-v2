import { useEffect, useState } from 'react';
import { AvatarChip, PixelWave, useLang, type Lang } from '@jaffre/ui';
import {
  fetchLeaderboard,
  type Leaderboard as LeaderboardData,
  type LeaderboardRow,
} from '../net/history.js';
import { MetaHeader } from '../components/MetaHeader.js';
import { MetaNav } from '../components/MetaNav.js';
import { ShellNote } from '../components/ShellNote.js';

export interface LeaderboardProps {
  readonly onLeave: () => void;
  /** Scene viewer: staged data so the screen renders without the network. */
  readonly demo?: LeaderboardData;
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
  },
  fr: {
    title: 'Classement',
    home: 'Accueil',
    loading: 'Chargement…',
    error: 'Impossible de charger le classement. Réessaie bientôt.',
    empty: 'Aucun joueur classé. Joue 10 parties en ligne pour rejoindre le classement.',
    you: 'Toi',
    games: (n) => `${String(n)} parties`,
  },
};

/** The global skill ladder — top-rated players, with the caller's own row
 * pinned below when they rank outside the visible top. */
export function Leaderboard({ onLeave, demo }: LeaderboardProps) {
  const t = T[useLang()];
  const [board, setBoard] = useState<LeaderboardData | null>(demo ?? null);
  const [error, setError] = useState(false);

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

  const meId = board?.you?.id ?? null;
  const topHasYou = meId !== null && (board?.top.some((r) => r.id === meId) ?? false);

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />

        <MetaNav current="leaderboard" />

        {error ? (
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
                gamesLabel={t.games}
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
                  gamesLabel={t.games}
                />
              </>
            )}
          </ol>
        )}
      </div>
    </main>
  );
}

function Row({
  rank,
  row,
  mine,
  youLabel,
  gamesLabel,
}: {
  readonly rank: number;
  readonly row: LeaderboardRow;
  readonly mine: boolean;
  readonly youLabel: string;
  readonly gamesLabel: (n: number) => string;
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
          {Math.round(row.rating)}
        </span>
        <span className="block font-arcade-ui text-[0.7em] text-(--color-ap-muted)">
          {gamesLabel(row.ratingGames)}
        </span>
      </span>
    </li>
  );
}
