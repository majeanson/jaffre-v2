import { useEffect, useState } from 'react';
import { fetchHistory, type HistoryGame } from '../net/history.js';

export interface HistoryProps {
  readonly onLeave: () => void;
  /** Scene viewer: staged games so the screen renders without the network. */
  readonly demoGames?: readonly HistoryGame[];
}

function formatDate(ms: number | null): string {
  if (ms === null) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** One finished game as a link into its replay. */
function GameRow({ game }: { readonly game: HistoryGame }) {
  const won = game.winnerTeam !== null && game.winnerTeam === game.yourSeat % 2;
  const decided = game.winnerTeam !== null;
  return (
    <a
      href={`#replay/${game.id}`}
      className="flex items-center gap-3 rounded-(--radius-panel) border border-white/8 bg-(--color-felt-800)/70 px-4 py-3 transition-colors hover:border-white/20 hover:bg-(--color-felt-800)"
    >
      <span
        className={`grid w-14 shrink-0 place-items-center rounded-lg py-1 font-display text-sm font-bold ${
          !decided
            ? 'bg-white/10 text-(--color-ivory)/70'
            : won
              ? 'bg-(--color-ok)/20 text-(--color-ok)'
              : 'bg-(--color-danger)/20 text-(--color-danger-text)'
        }`}
      >
        {decided ? (won ? 'Won' : 'Lost') : '—'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-(--color-ivory)">
          Room {game.roomCode}
        </span>
        <span className="block text-(length:--text-fluid-xs) text-(--color-ivory)/55">
          {formatDate(game.finishedAt)} · seat {game.yourSeat + 1}
        </span>
      </span>
      <span className="font-display text-lg tabular-nums text-(--color-ivory)/85">
        {game.scores[0]}
        <span className="mx-1 text-(--color-ivory)/40">—</span>
        {game.scores[1]}
      </span>
      <span aria-hidden className="text-(--color-ivory)/40">
        ›
      </span>
    </a>
  );
}

/** "Your games": finished games from the server, each a link into its replay. */
export function History({ onLeave, demoGames }: HistoryProps) {
  const [games, setGames] = useState<readonly HistoryGame[] | null>(demoGames ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (demoGames !== undefined) return;
    let live = true;
    fetchHistory()
      .then((g) => live && setGames(g))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [demoGames]);

  return (
    <main className="table-felt min-h-dvh overflow-y-auto p-6 max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-display text-(length:--text-fluid-2xl) font-semibold text-(--color-lamplight)">
            Your games
          </h1>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onLeave();
            }}
            className="text-sm text-(--color-ivory)/60 hover:text-(--color-ivory)"
          >
            ← Home
          </a>
        </header>

        {error ? (
          <p className="rounded-(--radius-panel) border border-white/8 bg-black/20 p-6 text-center text-(--color-ivory)/70">
            History needs the online server. Play a room game and it will show up here.
          </p>
        ) : games === null ? (
          <p className="p-6 text-center text-(--color-ivory)/50">Loading…</p>
        ) : games.length === 0 ? (
          <p className="rounded-(--radius-panel) border border-white/8 bg-black/20 p-6 text-center text-(--color-ivory)/70">
            No finished games yet. Finish a game and it will appear here to replay.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {games.map((g) => (
              <GameRow key={g.id} game={g} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
