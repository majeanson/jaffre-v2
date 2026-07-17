import { useEffect, useState } from 'react';
import { AvatarChip, Cta, PixelWave, StatPanel } from '@jaffre/ui';
import {
  fetchHistory,
  fetchStats,
  type HistoryGame,
  type Stats as StatsData,
} from '../net/history.js';
import { getProfile } from '../net/auth.js';
import { playerName } from '../net/socket.js';

export interface StatsProps {
  readonly onLeave: () => void;
  /** Scene viewer: a staged record so the screen renders without the network. */
  readonly demoStats?: StatsData;
  /** Scene viewer: staged recent games feeding the sparkline + scorepad. */
  readonly demoGames?: readonly HistoryGame[];
  /** Scene viewer: hold the screen in its loading (pixel-wave) state. */
  readonly demoLoading?: boolean;
}

/** made/attempted as a whole-percent, or null when nothing's been attempted. */
function accuracyPct(made: number, attempted: number): number | null {
  return attempted === 0 ? null : Math.round((made / attempted) * 100);
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
 * with an ink baseline and ok/danger dots. Gold stroke to sit on the ivory
 * record-book. No external lib; purely decorative, so the accessible summary
 * lives in the wrapping figure's caption.
 */
function Sparkline({ results }: { readonly results: readonly boolean[] }) {
  const w = 300;
  const h = 40;
  const padX = 6;
  const top = 6;
  const bot = h - 6;
  const n = results.length;
  const x = (i: number) => (n <= 1 ? w / 2 : padX + (i * (w - padX * 2)) / (n - 1));
  const y = (win: boolean) => (win ? top : bot);
  const line = results.map((win, i) => `${String(x(i))},${String(y(win))}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${String(w)} ${String(h)}`}
      className="h-[2.6em] w-full"
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
          stroke="var(--color-ap-gold-deep)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {results.map((win, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(win)}
          r={3}
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

/** A muted uppercase micro-label — reused across the record's panels. */
const MICRO_LABEL =
  'font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)';

/** One social fact (best partner / nemesis) — an avatar + name + relation. */
function SocialPanel({
  heading,
  headingClass,
  chipColor,
  name,
  relation,
  testId,
  empty,
}: {
  readonly heading: string;
  readonly headingClass: string;
  readonly chipColor: string;
  readonly name: string | undefined;
  readonly relation: string;
  readonly testId: string;
  readonly empty: string;
}) {
  return (
    <div className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap)">
      <div
        className={`mb-[0.6em] font-arcade-ui text-[0.68em] font-semibold uppercase tracking-[0.14em] ${headingClass}`}
      >
        {heading}
      </div>
      {name === undefined ? (
        <p className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/75">{empty}</p>
      ) : (
        <div className="flex items-center gap-[0.7em]">
          <AvatarChip name={name} color={chipColor} size="sm" />
          <div className="min-w-0 font-arcade-ui">
            <div
              data-testid={testId}
              className="truncate font-arcade-display text-[1em] uppercase text-(--color-ap-text)"
            >
              {name}
            </div>
            <div className="text-[0.8em] tabular-nums text-(--color-ap-muted)">{relation}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Your record": the arcade record-book — an ivory ruled hero (win rate +
 * form sparkline), the headline numbers, bid accuracy, the people you sit
 * with, and a ruled scorepad of recent games. */
export function Stats({ onLeave, demoStats, demoGames, demoLoading = false }: StatsProps) {
  const [stats, setStats] = useState<StatsData | null>(demoStats ?? null);
  const [games, setGames] = useState<readonly HistoryGame[] | null>(demoGames ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (demoStats !== undefined || demoLoading) return;
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
  }, [demoStats, demoLoading]);

  // Oldest → newest, capped, for a left-to-right "recent form" reading.
  const recent =
    games === null
      ? []
      : [...games]
          .filter((g) => g.finishedAt !== null && g.winnerTeam !== null)
          .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
          .slice(-12);
  const recentWins = recent.filter(youWon).length;

  const bidPct = stats === null ? null : accuracyPct(stats.bids.made, stats.bids.attempted);
  const saPct =
    stats === null ? null : accuracyPct(stats.sansAtout.made, stats.sansAtout.attempted);

  return (
    <main className="min-h-dvh overflow-y-auto bg-(--color-ap-ground) p-6 text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-[0.5em]">
            <AvatarChip name={playerName()} color={getProfile().color ?? undefined} size="sm" />
            <h1 className="font-arcade-display text-[2.2em] uppercase leading-none text-(--color-ap-gold)">
              Your record
            </h1>
          </div>
          <Cta variant="secondary" onClick={onLeave}>
            Home
          </Cta>
        </header>

        {error ? (
          <p className={SHELL_NOTE}>
            Your record needs the online server. Play a room game and it will show up here.
          </p>
        ) : stats === null ? (
          <div className={SHELL_NOTE}>
            <PixelWave label="Dealing…" />
          </div>
        ) : stats.games === 0 ? (
          <div className={SHELL_NOTE}>
            <div className="font-arcade-display text-[1.3em] uppercase text-(--color-ap-ok)">
              No games yet
            </div>
            <p className="mt-[0.5em]">
              Play your first hand and the book starts filling in — win rate, streak, and the people
              you sit with.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Hero fact: an ivory ruled record-book page — win rate (gold) +
                recent-form sparkline. The card face stays ivory in both skins,
                so its text is ink, not the flipping --color-ap-text. */}
            <section
              className="rounded-(--radius-ap-card) border-[3px] border-(--color-ap-ink) bg-(--color-card-face) p-[1.1em] shadow-(--shadow-ap-lg)"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(transparent 0 27px, rgb(11 7 19 / 0.07) 27px 28px)',
              }}
            >
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="font-arcade-ui text-[0.7em] font-bold uppercase tracking-[0.16em] text-(--color-ap-ink)/55">
                    Win rate · all time
                  </div>
                  <div className="mt-[0.15em] font-arcade-display text-[3.6em] leading-[0.9] tabular-nums text-(--color-ap-gold-deep)">
                    {Math.round(stats.winRate * 100)}%
                  </div>
                </div>
                <div className="flex items-center gap-[0.4em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ok) px-[0.6em] py-[0.35em] font-arcade-display text-[1em] tabular-nums text-(--color-ap-ink) shadow-(--shadow-ap-sm)">
                  {stats.wins} won
                </div>
              </div>
              {recent.length > 0 && (
                <figure className="mt-[0.5em]">
                  <Sparkline results={recent.map(youWon)} />
                  <figcaption className="mt-[0.2em] font-arcade-ui text-[0.72em] text-(--color-ap-ink)/55">
                    Last {recent.length} games — {recentWins} won.
                  </figcaption>
                </figure>
              )}
            </section>

            {/* Headline numbers: games, net points, best streak. */}
            <section className="grid grid-cols-3 gap-3 max-sm:gap-2">
              <StatPanel value={stats.games} label="games" />
              <StatPanel
                value={`${stats.netPoints >= 0 ? '+' : ''}${String(stats.netPoints)}`}
                label="net points"
                tone="violet"
              />
              <StatPanel value={stats.streak.best} label="best streak" tone="ok" />
            </section>

            {/* Bid accuracy — one headline % over a striped fill bar. */}
            <section className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap)">
              <div className="mb-[0.6em] flex items-baseline justify-between gap-3">
                <span className={MICRO_LABEL}>Bid accuracy</span>
                <span className="font-arcade-display text-[1.3em] tabular-nums text-(--color-ap-gold)">
                  {bidPct === null ? '—' : `${String(bidPct)}%`}
                </span>
              </div>
              {bidPct === null ? (
                <p className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/75">
                  Contracts: no contracts yet — name one and see how you do.
                </p>
              ) : (
                <>
                  <div className="h-[0.9em] overflow-hidden rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) shadow-(--shadow-ap-sm)">
                    <div
                      className="h-full"
                      style={{
                        width: `${String(bidPct)}%`,
                        backgroundImage:
                          'repeating-linear-gradient(45deg, var(--color-ap-gold) 0 7px, var(--color-ap-gold-deep) 7px 14px)',
                      }}
                    />
                  </div>
                  <div className="mt-[0.6em] font-arcade-ui text-[0.8em] text-(--color-ap-muted)">
                    You make the contract {stats.bids.made} of {stats.bids.attempted} times you name
                    it{saPct === null ? '' : ` · ${String(saPct)}% at sans atout`}.
                  </div>
                </>
              )}
            </section>

            {/* Social facts: best partner + nemesis, side by side. */}
            <section className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <SocialPanel
                heading="Best partner"
                headingClass="text-(--color-ap-ok)"
                chipColor="var(--color-suit-green)"
                name={stats.bestPartner?.name}
                relation={
                  stats.bestPartner === null
                    ? ''
                    : `${stats.bestPartner.wins} wins in ${stats.bestPartner.games} games`
                }
                testId="best-partner-name"
                empty="Play a few games with the same teammate to find out."
              />
              <SocialPanel
                heading="Nemesis"
                headingClass="text-(--color-ap-danger-text)"
                chipColor="var(--color-suit-blue)"
                name={stats.nemesis?.name}
                relation={
                  stats.nemesis === null
                    ? ''
                    : `beats you ${stats.nemesis.losses} of ${stats.nemesis.games}`
                }
                testId="nemesis-name"
                empty="No one has your number yet — keep it that way."
              />
            </section>

            {/* Scorepad — ruled ledger of recent games. */}
            {recent.length > 0 && (
              <section className="overflow-hidden rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap)">
                <div
                  className={`border-b-2 border-(--color-ap-ink) px-[0.9em] py-[0.7em] ${MICRO_LABEL}`}
                >
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
