import { useEffect, useState } from 'react';
import { AvatarChip, Cta, PixelWave, StatPanel, useLang, type Lang } from '@jaffre/ui';
import {
  fetchHistory,
  fetchStats,
  type HistoryGame,
  type Stats as StatsData,
} from '../net/history.js';
import { getProfile } from '../net/auth.js';
import { playerName } from '../net/socket.js';
import { MetaNav } from '../components/MetaNav.js';

export interface StatsProps {
  readonly onLeave: () => void;
  /** Scene viewer: a staged record so the screen renders without the network. */
  readonly demoStats?: StatsData;
  /** Scene viewer: staged recent games feeding the sparkline + scorepad. */
  readonly demoGames?: readonly HistoryGame[];
  /** Scene viewer: hold the screen in its loading (pixel-wave) state. */
  readonly demoLoading?: boolean;
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    dealing: string;
    error: string;
    noGames: string;
    noGamesBody: string;
    practiceNote: string;
    winRate: string;
    wonCount: (n: number) => string;
    lastGames: (n: number, wins: number) => string;
    games: string;
    netPoints: string;
    bestStreak: string;
    bidAccuracy: string;
    noContracts: string;
    contract: (made: number, attempted: number, sa: number | null) => string;
    bestPartner: string;
    nemesis: string;
    partnerRelation: (wins: number, games: number) => string;
    nemesisRelation: (losses: number, games: number) => string;
    partnerEmpty: string;
    nemesisEmpty: string;
    recentGames: string;
    recentCaption: string;
    thRoom: string;
    thResult: string;
    thScore: string;
    won: string;
    lost: string;
  }
> = {
  en: {
    title: 'Your record',
    home: 'Home',
    dealing: 'Dealing…',
    error: 'Your record needs the online server. Play a room game and it will show up here.',
    noGames: 'No games yet',
    noGamesBody:
      'Play your first hand and the book starts filling in — win rate, streak, and the people you sit with.',
    practiceNote: 'Practice games against bots stay off the record — only room games count.',
    winRate: 'Win rate · all time',
    wonCount: (n) => `${String(n)} won`,
    lastGames: (n, wins) => `Last ${String(n)} games — ${String(wins)} won.`,
    games: 'games',
    netPoints: 'net points',
    bestStreak: 'best streak',
    bidAccuracy: 'Bid accuracy',
    noContracts: 'Contracts: no contracts yet — name one and see how you do.',
    contract: (made, attempted, sa) =>
      `You make the contract ${String(made)} of ${String(attempted)} times you name it${
        sa === null ? '' : ` · ${String(sa)}% at sans atout`
      }.`,
    bestPartner: 'Best partner',
    nemesis: 'Nemesis',
    partnerRelation: (wins, games) => `${String(wins)} wins in ${String(games)} games`,
    nemesisRelation: (losses, games) => `beats you ${String(losses)} of ${String(games)}`,
    partnerEmpty: 'Play a few games with the same teammate to find out.',
    nemesisEmpty: 'No one has your number yet — keep it that way.',
    recentGames: 'Recent games',
    recentCaption: 'Your recent games, newest last',
    thRoom: 'Room',
    thResult: 'Result',
    thScore: 'Score',
    won: 'Won',
    lost: 'Lost',
  },
  fr: {
    title: 'Ton record',
    home: 'Accueil',
    dealing: 'On brasse…',
    error:
      'Ton record a besoin du serveur en ligne. Joue une partie en salon et il apparaîtra ici.',
    noGames: 'Pas encore de parties',
    noGamesBody:
      'Joue ta première main et le carnet commence à se remplir — taux de victoires, séquence, et le monde avec qui tu joues.',
    practiceNote:
      'Les parties de pratique contre les bots ne comptent pas — seules les parties en salon sont enregistrées.',
    winRate: 'Taux de victoires · à vie',
    wonCount: (n) => `${String(n)} gagnée${n === 1 ? '' : 's'}`,
    lastGames: (n, wins) =>
      `${String(n)} dernières parties — ${String(wins)} gagnée${wins === 1 ? '' : 's'}.`,
    games: 'parties',
    netPoints: 'points nets',
    bestStreak: 'meilleure séquence',
    bidAccuracy: 'Précision des mises',
    noContracts: 'Contrats : pas encore de contrat — nommes-en un et vois ce que ça donne.',
    contract: (made, attempted, sa) =>
      `Tu fais le contrat ${String(made)} fois sur ${String(attempted)}${
        sa === null ? '' : ` · ${String(sa)} % à sans atout`
      }.`,
    bestPartner: 'Meilleur partenaire',
    nemesis: 'Némésis',
    partnerRelation: (wins, games) =>
      `${String(wins)} victoire${wins === 1 ? '' : 's'} en ${String(games)} partie${games === 1 ? '' : 's'}`,
    nemesisRelation: (losses, games) => `te bat ${String(losses)} fois sur ${String(games)}`,
    partnerEmpty: 'Joue quelques parties avec le même partenaire pour le découvrir.',
    nemesisEmpty: "Personne n'a encore le dessus sur toi — garde ça de même.",
    recentGames: 'Parties récentes',
    recentCaption: 'Tes parties récentes, les plus récentes en dernier',
    thRoom: 'Salon',
    thResult: 'Résultat',
    thScore: 'Pointage',
    won: 'Gagnée',
    lost: 'Perdue',
  },
};

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
  const t = T[useLang()];
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
          {won ? t.won : t.lost}
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
  const t = T[useLang()];
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
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-[0.5em]">
            <AvatarChip name={playerName()} color={getProfile().color ?? undefined} size="sm" />
            <h1 className="font-arcade-display text-[2.2em] uppercase leading-none text-(--color-ap-gold)">
              {t.title}
            </h1>
          </div>
          <Cta variant="secondary" onClick={onLeave}>
            {t.home}
          </Cta>
        </header>

        <MetaNav current="stats" />

        {error ? (
          <p className={SHELL_NOTE}>{t.error}</p>
        ) : stats === null ? (
          <div className={SHELL_NOTE}>
            <PixelWave label={t.dealing} />
          </div>
        ) : stats.games === 0 ? (
          <div className={SHELL_NOTE}>
            <div className="font-arcade-display text-[1.3em] uppercase text-(--color-ap-ok)">
              {t.noGames}
            </div>
            <p className="mt-[0.5em]">{t.noGamesBody}</p>
            <p className="mt-[0.5em] text-[0.85em] text-(--color-ap-muted)">{t.practiceNote}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Hero fact: an ivory ruled record-book page — win rate (gold) +
                recent-form sparkline. The card face stays ivory in both skins,
                so its text is ink, not the flipping --color-ap-text. */}
            <section
              className="rounded-(--radius-ap-card) border-[3px] border-(--color-ap-ink) bg-(--color-ap-paper) p-[1.1em] shadow-(--shadow-ap-lg)"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(transparent 0 27px, rgb(11 7 19 / 0.07) 27px 28px)',
              }}
            >
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="font-arcade-ui text-[0.7em] font-bold uppercase tracking-[0.16em] text-(--color-ap-ink)/55">
                    {t.winRate}
                  </div>
                  <div className="mt-[0.15em] font-arcade-display text-[3.6em] leading-[0.9] tabular-nums text-(--color-ap-gold-deep)">
                    {Math.round(stats.winRate * 100)}%
                  </div>
                </div>
                <div className="flex items-center gap-[0.4em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ok) px-[0.6em] py-[0.35em] font-arcade-display text-[1em] tabular-nums text-(--color-ap-ink) shadow-(--shadow-ap-sm)">
                  {t.wonCount(stats.wins)}
                </div>
              </div>
              {recent.length > 0 && (
                <figure className="mt-[0.5em]">
                  <Sparkline results={recent.map(youWon)} />
                  <figcaption className="mt-[0.2em] font-arcade-ui text-[0.72em] text-(--color-ap-ink)/55">
                    {t.lastGames(recent.length, recentWins)}
                  </figcaption>
                </figure>
              )}
            </section>

            {/* Headline numbers: games, net points, best streak. */}
            <section className="grid grid-cols-3 gap-3 max-sm:gap-2">
              <StatPanel value={stats.games} label={t.games} />
              <StatPanel
                value={`${stats.netPoints >= 0 ? '+' : ''}${String(stats.netPoints)}`}
                label={t.netPoints}
                tone="violet"
              />
              <StatPanel value={stats.streak.best} label={t.bestStreak} tone="ok" />
            </section>

            {/* Bid accuracy — one headline % over a striped fill bar. */}
            <section className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap)">
              <div className="mb-[0.6em] flex items-baseline justify-between gap-3">
                <span className={MICRO_LABEL}>{t.bidAccuracy}</span>
                <span className="font-arcade-display text-[1.3em] tabular-nums text-(--color-ap-gold)">
                  {bidPct === null ? '—' : `${String(bidPct)}%`}
                </span>
              </div>
              {bidPct === null ? (
                <p className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/75">
                  {t.noContracts}
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
                    {t.contract(stats.bids.made, stats.bids.attempted, saPct)}
                  </div>
                </>
              )}
            </section>

            {/* Social facts: best partner + nemesis, side by side. */}
            <section className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <SocialPanel
                heading={t.bestPartner}
                headingClass="text-(--color-ap-ok)"
                chipColor="var(--color-suit-green)"
                name={stats.bestPartner?.name}
                relation={
                  stats.bestPartner === null
                    ? ''
                    : t.partnerRelation(stats.bestPartner.wins, stats.bestPartner.games)
                }
                testId="best-partner-name"
                empty={t.partnerEmpty}
              />
              <SocialPanel
                heading={t.nemesis}
                headingClass="text-(--color-ap-danger-text)"
                chipColor="var(--color-suit-blue)"
                name={stats.nemesis?.name}
                relation={
                  stats.nemesis === null
                    ? ''
                    : t.nemesisRelation(stats.nemesis.losses, stats.nemesis.games)
                }
                testId="nemesis-name"
                empty={t.nemesisEmpty}
              />
            </section>

            {/* Scorepad — ruled ledger of recent games. */}
            {recent.length > 0 && (
              <section className="overflow-hidden rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap) [&_:focus-visible]:outline-offset-[-2px]">
                <div
                  className={`border-b-2 border-(--color-ap-ink) px-[0.9em] py-[0.7em] ${MICRO_LABEL}`}
                >
                  {t.recentGames}
                </div>
                <table className="w-full border-collapse">
                  <caption className="sr-only">{t.recentCaption}</caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">{t.thRoom}</th>
                      <th scope="col">{t.thResult}</th>
                      <th scope="col">{t.thScore}</th>
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
