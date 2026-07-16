import { useEffect, useState } from 'react';
import { fetchStats, type Stats as StatsData } from '../net/history.js';

export interface StatsProps {
  readonly onLeave: () => void;
  /** Scene viewer: a staged record so the screen renders without the network. */
  readonly demoStats?: StatsData;
}

const PANEL =
  'rounded-(--radius-panel) border border-white/8 bg-(--color-felt-800)/70 p-5 max-sm:p-4';

/** "made X of Y" — the shared shape for bid/sans-atout accuracy lines. */
function accuracyLine(label: string, made: number, attempted: number): string {
  if (attempted === 0) return `${label}: no contracts yet`;
  return `${label}: made ${String(made)} of ${String(attempted)}`;
}

/** "Your record": a functional aggregate view of games, bids and streaks. */
export function Stats({ onLeave, demoStats }: StatsProps) {
  const [stats, setStats] = useState<StatsData | null>(demoStats ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (demoStats !== undefined) return;
    let live = true;
    fetchStats()
      .then((s) => live && setStats(s))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [demoStats]);

  return (
    <main className="table-felt min-h-dvh overflow-y-auto p-6 max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-display text-(length:--text-fluid-2xl) font-semibold text-(--color-lamplight)">
            Your record
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
            Your record needs the online server. Play a room game and it will show up here.
          </p>
        ) : stats === null ? (
          <p className="p-6 text-center text-(--color-ivory)/50">Loading…</p>
        ) : stats.games === 0 ? (
          <p className="rounded-(--radius-panel) border border-white/8 bg-black/20 p-6 text-center text-(--color-ivory)/70">
            No games yet — play one!
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <section className={`flex items-end justify-between gap-4 ${PANEL}`}>
              <div>
                <span className="block font-display text-4xl font-bold tabular-nums text-(--color-ivory)">
                  {Math.round(stats.winRate * 100)}%
                </span>
                <span className="block text-(length:--text-fluid-sm) text-(--color-ivory)/60">
                  win rate
                </span>
              </div>
              <div className="text-right">
                <span className="block font-display text-2xl font-semibold tabular-nums text-(--color-ivory)/90">
                  {stats.wins}
                  <span className="mx-1 text-(--color-ivory)/40">/</span>
                  {stats.games}
                </span>
                <span className="block text-(length:--text-fluid-sm) text-(--color-ivory)/60">
                  games won
                </span>
              </div>
            </section>

            <section className={`flex flex-col gap-1.5 ${PANEL}`}>
              <span className="font-display text-(length:--text-fluid-sm) font-semibold text-(--color-ivory)">
                Bidding
              </span>
              <span className="text-(length:--text-fluid-sm) tabular-nums text-(--color-ivory)/75">
                {accuracyLine('Contracts', stats.bids.made, stats.bids.attempted)}
              </span>
              <span className="text-(length:--text-fluid-sm) tabular-nums text-(--color-ivory)/75">
                {accuracyLine('Sans atout', stats.sansAtout.made, stats.sansAtout.attempted)}
              </span>
            </section>

            <section className={`flex flex-col gap-1.5 ${PANEL}`}>
              <span className="font-display text-(length:--text-fluid-sm) font-semibold text-(--color-ivory)">
                Best partner
              </span>
              {stats.bestPartner === null ? (
                <span className="text-(length:--text-fluid-sm) text-(--color-ivory)/60">
                  Play a few games with the same teammate to find out.
                </span>
              ) : (
                <span className="text-(length:--text-fluid-sm) tabular-nums text-(--color-ivory)/75">
                  <span className="font-semibold text-(--color-ivory)">
                    {stats.bestPartner.name}
                  </span>{' '}
                  · {stats.bestPartner.wins} wins in {stats.bestPartner.games} games
                </span>
              )}
            </section>

            <section className={`flex items-center justify-between gap-4 ${PANEL}`}>
              <div>
                <span className="block font-display text-2xl font-bold tabular-nums text-(--color-ivory)">
                  {stats.streak.current}
                </span>
                <span className="block text-(length:--text-fluid-sm) text-(--color-ivory)/60">
                  current streak
                </span>
              </div>
              <div className="text-right">
                <span className="block font-display text-2xl font-bold tabular-nums text-(--color-ivory)">
                  {stats.streak.best}
                </span>
                <span className="block text-(length:--text-fluid-sm) text-(--color-ivory)/60">
                  best streak
                </span>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
