import { useEffect, useState } from 'react';
import { AvatarChip, Cta, StatPanel } from '@jaffre/ui';
import {
  fetchHistory,
  fetchStats,
  type HistoryGame,
  type Stats as StatsData,
} from '../net/history.js';

export interface StatsProps {
  readonly onLeave: () => void;
  /** Scene viewer: a staged record so the screen renders without the network. */
  readonly demoStats?: StatsData;
  /** Scene viewer: staged recent games feeding the sparkline + scorepad. */
  readonly demoGames?: readonly HistoryGame[];
}

/** "made X of Y" — the shared shape for bid/sans-atout accuracy lines. */
function accuracyLine(label: string, made: number, attempted: number): string {
  if (attempted === 0) return `${label}: no contracts yet`;
  return `${label}: made ${String(made)} of ${String(attempted)}`;
}

/** Did you win this game? Your team is your seat's parity (0&2 vs 1&3). */
function youWon(game: HistoryGame): boolean {
  return game.winnerTeam !== null && game.winnerTeam === game.yourSeat % 2;
}

/** Your team's score first, then the opponents' — for the scorepad line. */
function yourScore(game: HistoryGame): readonly [number, number] {
  const you = game.yourSeat % 2;
  return you === 0 ? [game.scores[0], game.scores[1]] : [game.scores[1], game.scores[0]];
}

/**
 * A tiny inline win/loss sparkline — a <polyline> that rides high on a win and
 * low on a loss across the most recent games (oldest → newest, left → right),
 * with an ink baseline and ok/danger dots. No external lib; purely decorative,
 * so the accessible summary lives in the wrapping figure's caption.
 */
function Sparkline({ results }: { readonly results: readonly boolean[] }) {
  const w = 132;
  const h = 34;
  const padX = 5;
  const top = 6;
  const bot = h - 6;
  const n = results.length;
  const x = (i: number) => (n <= 1 ? w / 2 : padX + (i * (w - padX * 2)) / (n - 1));
  const y = (win: boolean) => (win ? top : bot);
  const line = results.map((win, i) => `${String(x(i))},${String(y(win))}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${String(w)} ${String(h)}`}
      className="h-[2.4em] w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* baseline (loss level) */}
      <line
        x1={padX}
        y1={bot}
        x2={w - padX}
        y2={bot}
        stroke="var(--color-ap-ink)"
        strokeWidth={1}
        opacity={0.35}
      />
      {n > 1 && (
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-ap-violet)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {results.map((win, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(win)}
          r={2.6}
          fill={win ? 'var(--color-ap-ok)' : 'var(--color-ap-danger)'}
          stroke="var(--color-ap-ink)"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

/** One ruled row of the scorepad game list. */
function ScorepadRow({ game }: { readonly game: HistoryGame }) {
  const won = youWon(game);
  const [mine, theirs] = yourScore(game);
  return (
    <tr className="border-t-2 border-(--color-ap-ink)/15">
      <td className="py-[0.55em] pl-[0.9em] pr-[0.5em] font-arcade-ui text-[0.9em] text-(--color-ap-text)">
        {game.roomCode}
      </td>
      <td className="px-[0.5em] py-[0.55em]">
        <span
          className={`inline-block rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) px-[0.5em] py-[0.1em] font-arcade-display text-[0.75em] uppercase tracking-wide text-(--color-ap-ink) shadow-(--shadow-ap-sm) ${
            won ? 'bg-(--color-ap-ok)' : 'bg-(--color-ap-danger)'
          }`}
        >
          {won ? 'Won' : 'Lost'}
        </span>
      </td>
      <td className="py-[0.55em] pl-[0.5em] pr-[0.9em] text-right font-arcade-display text-[1em] tabular-nums text-(--color-ap-text)">
        {mine}
        <span className="mx-[0.35em] text-(--color-ap-muted)">–</span>
        {theirs}
      </td>
    </tr>
  );
}

const SHELL_NOTE =
  'rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1.4em] text-center font-arcade-ui text-(--color-ap-muted) shadow-(--shadow-ap)';

/** "Your record": the arcade record-book — hero win rate, bid accuracy, a
 * social panel, a ruled scorepad of recent games and a form sparkline. */
export function Stats({ onLeave, demoStats, demoGames }: StatsProps) {
  const [stats, setStats] = useState<StatsData | null>(demoStats ?? null);
  const [games, setGames] = useState<readonly HistoryGame[] | null>(demoGames ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (demoStats !== undefined) return;
    let live = true;
    fetchStats()
      .then((s) => live && setStats(s))
      .catch(() => live && setError(true));
    // Recent games power the sparkline + scorepad; their absence never blocks
    // the core record, so a failure just leaves the ledger without a game list.
    fetchHistory()
      .then((g) => live && setGames(g))
      .catch(() => live && setGames([]));
    return () => {
      live = false;
    };
  }, [demoStats]);

  // Oldest → newest, capped, for a left-to-right "recent form" reading.
  const recent =
    games === null
      ? []
      : [...games]
          .filter((g) => g.finishedAt !== null && g.winnerTeam !== null)
          .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
          .slice(-12);
  const recentWins = recent.filter(youWon).length;

  return (
    <main className="min-h-dvh overflow-y-auto bg-(--color-ap-ground) p-6 text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-arcade-display text-[2.2em] uppercase leading-none text-(--color-ap-gold)">
            Your record
          </h1>
          <Cta variant="secondary" onClick={onLeave}>
            Home
          </Cta>
        </header>

        {error ? (
          <p className={SHELL_NOTE}>
            Your record needs the online server. Play a room game and it will show up here.
          </p>
        ) : stats === null ? (
          <p className={SHELL_NOTE} aria-live="polite">
            Loading…
          </p>
        ) : stats.games === 0 ? (
          <p className={SHELL_NOTE}>No games yet — play one!</p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Hero fact: win rate (gold) + recent-form sparkline. */}
            <section className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1.1em] shadow-(--shadow-ap-lg)">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="font-arcade-display text-[3em] leading-none tabular-nums text-(--color-ap-gold)">
                    {Math.round(stats.winRate * 100)}%
                  </div>
                  <div className="mt-[0.4em] font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
                    win rate
                  </div>
                </div>
                <div className="text-right font-arcade-display text-[1.4em] tabular-nums text-(--color-ap-text)">
                  {stats.wins}
                  <span className="mx-[0.25em] text-(--color-ap-muted)">/</span>
                  {stats.games}
                  <div className="mt-[0.2em] font-arcade-ui text-[0.5em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
                    games won
                  </div>
                </div>
              </div>
              {recent.length > 0 && (
                <figure className="mt-[0.9em]">
                  <Sparkline results={recent.map(youWon)} />
                  <figcaption className="mt-[0.3em] font-arcade-ui text-[0.72em] text-(--color-ap-muted)">
                    Recent form — {recentWins} of last {recent.length} won
                  </figcaption>
                </figure>
              )}
            </section>

            {/* Streak — one section so "current" + "best" read together. */}
            <section className="grid grid-cols-2 gap-4">
              <StatPanel value={stats.streak.current} label="current streak" />
              <StatPanel value={stats.streak.best} label="best streak" />
            </section>

            {/* Bid accuracy. */}
            <section className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <StatPanel
                value={
                  stats.bids.attempted === 0 ? '—' : `${stats.bids.made}/${stats.bids.attempted}`
                }
                label="contracts"
                sub={accuracyLine('Contracts', stats.bids.made, stats.bids.attempted)}
              />
              <StatPanel
                value={
                  stats.sansAtout.attempted === 0
                    ? '—'
                    : `${stats.sansAtout.made}/${stats.sansAtout.attempted}`
                }
                label="sans atout"
                sub={accuracyLine('Sans atout', stats.sansAtout.made, stats.sansAtout.attempted)}
              />
            </section>

            {/* Social fact: best partner. (Nemesis/worst-partner is a
                follow-up — the /api/stats shape doesn't provide it yet.) */}
            <section className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap)">
              <div className="mb-[0.6em] font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
                Best partner
              </div>
              {stats.bestPartner === null ? (
                <p className="font-arcade-ui text-[0.9em] text-(--color-ap-text)/80">
                  Play a few games with the same teammate to find out.
                </p>
              ) : (
                <div className="flex items-center gap-[0.8em]">
                  <AvatarChip name={stats.bestPartner.name} />
                  <div className="font-arcade-ui text-[0.95em] text-(--color-ap-text)">
                    <div
                      data-testid="best-partner-name"
                      className="font-arcade-display text-[1.1em] uppercase text-(--color-ap-text)"
                    >
                      {stats.bestPartner.name}
                    </div>
                    <div className="tabular-nums text-(--color-ap-muted)">
                      {stats.bestPartner.wins} wins in {stats.bestPartner.games} games
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Scorepad — ruled ledger of recent games. */}
            {recent.length > 0 && (
              <section className="overflow-hidden rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap)">
                <div className="border-b-2 border-(--color-ap-ink) px-[0.9em] py-[0.7em] font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
                  Recent games
                </div>
                <table className="w-full border-collapse">
                  <caption className="sr-only">Your recent games, newest last</caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Room</th>
                      <th scope="col">Result</th>
                      <th scope="col">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...recent].reverse().map((game) => (
                      <ScorepadRow key={game.id} game={game} />
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
