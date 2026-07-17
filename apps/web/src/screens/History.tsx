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

/** "with Ginette · vs Marcel & Réal" — teammate first, then both opponents. */
function rosterLine(game: HistoryGame): string | null {
  const yourTeam = game.yourSeat % 2;
  const teammate = game.players.find((p) => p.seat !== game.yourSeat && p.seat % 2 === yourTeam);
  const opponents = game.players.filter((p) => p.seat % 2 !== yourTeam);
  if (teammate === undefined && opponents.length === 0) return null;
  const vs = opponents.map((p) => p.name).join(' & ');
  if (teammate === undefined) return vs === '' ? null : `vs ${vs}`;
  return vs === '' ? `with ${teammate.name}` : `with ${teammate.name} · vs ${vs}`;
}

/** One finished game as a link into its replay. */
function GameRow({ game }: { readonly game: HistoryGame }) {
  const won = game.winnerTeam !== null && game.winnerTeam === game.yourSeat % 2;
  const decided = game.winnerTeam !== null;
  const roster = rosterLine(game);
  return (
    <a
      href={`#replay/${game.id}`}
      className="flex items-center gap-3 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-3 shadow-(--shadow-ap-sm) transition-colors hover:bg-(--color-ap-panel-hover)"
    >
      <span
        className={`inline-block shrink-0 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) px-[0.5em] py-1 text-center font-arcade-display text-sm uppercase shadow-(--shadow-ap-sm) ${
          !decided
            ? 'bg-(--color-ap-panel-hover) text-(--color-ap-muted)'
            : won
              ? 'bg-(--color-ap-ok) text-(--color-ap-ink)'
              : 'bg-(--color-ap-danger) text-(--color-ap-ink)'
        }`}
      >
        {decided ? (won ? 'Won' : 'Lost') : '—'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-(--color-ap-text)">
          Room {game.roomCode}
        </span>
        <span className="block truncate text-(length:--text-fluid-xs) text-(--color-ap-muted)">
          {formatDate(game.finishedAt)} · seat {game.yourSeat + 1}
          {roster !== null ? ` · ${roster}` : ''}
        </span>
      </span>
      <span className="font-arcade-display text-lg tabular-nums text-(--color-ap-text)">
        {game.scores[0]}
        <span className="mx-1 text-(--color-ap-muted)">—</span>
        {game.scores[1]}
      </span>
      <span aria-hidden className="text-(--color-ap-muted)">
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
          <h1 className="font-arcade-display text-(length:--text-fluid-2xl) uppercase text-(--color-ap-gold)">
            Your games
          </h1>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onLeave();
            }}
            className="text-sm text-(--color-ap-muted) hover:text-(--color-ap-text)"
          >
            ← Home
          </a>
        </header>

        {error ? (
          <p className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-6 text-center text-(--color-ap-muted) shadow-(--shadow-ap)">
            History needs the online server. Play a room game and it will show up here.
          </p>
        ) : games === null ? (
          <p className="p-6 text-center text-(--color-ap-muted)">Loading…</p>
        ) : games.length === 0 ? (
          <p className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-6 text-center text-(--color-ap-muted) shadow-(--shadow-ap)">
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
