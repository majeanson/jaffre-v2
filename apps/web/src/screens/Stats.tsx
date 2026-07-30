import { useEffect, useState } from 'react';
import { AvatarChip, PixelWave, StatPanel, useLang, type Lang } from '@jaffre/ui';
import {
  HISTORY_PAGE_SIZE,
  fetchHistory,
  fetchHistoryPage,
  fetchStats,
  type HistoryGame,
  type Stats as StatsData,
  type StatsRegular,
} from '../net/history.js';
import {
  MASTERY_LANE_IDS,
  MASTERY_UNLOCK,
  favouriteLane,
  masteryLabel,
  masteryOf,
  masteryStyle,
  masterySpread,
} from '../mastery.js';
import { GameRow } from '../components/GameRow.js';
import { MetaHeader } from '../components/MetaHeader.js';
import { MetaNav } from '../components/MetaNav.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { ShellNote } from '../components/ShellNote.js';

export interface StatsProps {
  readonly onLeave: () => void;
  /** Scene viewer: a staged record so the screen renders without the network. */
  readonly demoStats?: StatsData;
  /** Scene viewer: staged recent games feeding the sparkline + scorepad. */
  readonly demoGames?: readonly HistoryGame[];
  /** Scene viewer: hold the screen in its loading (pixel-wave) state. */
  readonly demoLoading?: boolean;
  /** Scene viewer: a staged games-view toggle so the scene can pin either tab. */
  readonly initialGamesView?: 'recent' | 'all';
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
    mastery: string;
    masteryLane: (made: number, attempted: number) => string;
    masteryEmpty: string;
    masteryEven: string;
    masteryNarrow: (lane: string) => string;
    masteryUntouched: (lanes: string) => string;
    bestPartner: string;
    nemesis: string;
    partnerRelation: (wins: number, games: number) => string;
    nemesisRelation: (losses: number, games: number) => string;
    partnerEmpty: string;
    nemesisEmpty: string;
    gamesHeader: string;
    viewRecent: string;
    viewAll: string;
    recentCaption: string;
    thRoom: string;
    thResult: string;
    thScore: string;
    won: string;
    lost: string;
    regulars: string;
    regularsHint: string;
    regularShare: (withGames: number, vsGames: number) => string;
    headToHead: (name: string) => string;
    showMore: string;
    spectated: (n: number) => string;
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
    mastery: 'Suit mastery',
    masteryLane: (made, attempted) =>
      attempted === 0 ? 'never called' : `${String(made)} of ${String(attempted)} stood`,
    masteryEmpty: "You haven't taken a contract yet — the lanes fill as you bid.",
    masteryEven: 'You spread your contracts around evenly.',
    masteryNarrow: (lane) => `You lean hard on ${lane}.`,
    masteryUntouched: (lanes) => `Never called: ${lanes}.`,
    bestPartner: 'Best partner',
    nemesis: 'Nemesis',
    partnerRelation: (wins, games) => `${String(wins)} wins in ${String(games)} games`,
    nemesisRelation: (losses, games) => `beats you ${String(losses)} of ${String(games)}`,
    partnerEmpty: 'Play a few games with the same teammate to find out.',
    nemesisEmpty: 'No one has your number yet — keep it that way.',
    gamesHeader: 'Your games',
    viewRecent: 'Recent',
    viewAll: 'All',
    recentCaption: 'Your recent games, newest first',
    thRoom: 'Room',
    thResult: 'Result',
    thScore: 'Score',
    won: 'Won',
    lost: 'Lost',
    regulars: 'Regulars',
    regularsHint: "Everyone else you've shared 3 or more games with.",
    regularShare: (withGames, vsGames) => `${String(withGames)} with · ${String(vsGames)} against`,
    headToHead: (name) => `Head to head with ${name}`,
    showMore: 'Show more',
    spectated: (n) => `Games watched to the end: ${String(n)}`,
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
    noContracts: 'Contrats : pas encore de contrat — prends-en un et vois ce que ça donne.',
    contract: (made, attempted, sa) =>
      `Tu fais le contrat ${String(made)} fois sur ${String(attempted)}${
        sa === null ? '' : ` · ${String(sa)} % à sans atout`
      }.`,
    mastery: 'Maîtrise des couleurs',
    // "misé", not "demandé": the glossary settled on miser/mise for bidding,
    // and a lane you never bid is one you never MISED. Two words for the same
    // act would read as two different acts.
    masteryLane: (made, attempted) =>
      attempted === 0 ? 'jamais misé' : `${String(made)} réussis sur ${String(attempted)}`,
    masteryEmpty: 'Tu n’as pas encore pris de contrat — ça se remplit quand tu mises.',
    masteryEven: 'Tu répartis tes contrats également.',
    // "en rouge" / "en sans atout" — works for every lane without needing a
    // gendered article, unlike "sur le ___".
    masteryNarrow: (lane) => `Tu mises surtout en ${lane.toLowerCase()}.`,
    masteryUntouched: (lanes) => `Jamais misé : ${lanes}.`,
    bestPartner: 'Meilleur partenaire',
    nemesis: 'Némésis',
    partnerRelation: (wins, games) =>
      `${String(wins)} victoire${wins === 1 ? '' : 's'} en ${String(games)} partie${games === 1 ? '' : 's'}`,
    nemesisRelation: (losses, games) => `te bat ${String(losses)} fois sur ${String(games)}`,
    partnerEmpty: 'Joue quelques parties avec le même partenaire pour le découvrir.',
    nemesisEmpty: "Personne n'a encore le dessus sur toi — garde ça de même.",
    gamesHeader: 'Tes parties',
    viewRecent: 'Récentes',
    viewAll: 'Toutes',
    recentCaption: 'Tes parties récentes, les plus récentes en premier',
    thRoom: 'Salon',
    thResult: 'Résultat',
    thScore: 'Pointage',
    won: 'Gagnée',
    lost: 'Perdue',
    regulars: 'Les habitués',
    regularsHint: 'Les autres avec qui tu as joué 3 parties ou plus.',
    regularShare: (withGames, vsGames) => `${String(withGames)} avec · ${String(vsGames)} contre`,
    headToHead: (name) => `Face à face avec ${name}`,
    showMore: 'Voir plus',
    spectated: (n) => `Parties regardées jusqu’à la fin : ${String(n)}`,
  },
};

type Strings = (typeof T)[Lang];

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

/** A muted uppercase micro-label — reused across the record's panels. */
const MICRO_LABEL =
  'font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)';

/**
 * Suit mastery — five lanes, one per thing you can name when you take a
 * contract. Each bar is that lane's progress toward its crest deck, coloured
 * with the suit itself so the bar's colour IS its label.
 *
 * Deliberately shows lanes you have NEVER called, greyed at zero: the empty
 * lane is the interesting one. The closing line reads the shape rather than
 * the totals — this is meant to be a mirror of how you bid, not a grind bar.
 */
function MasteryPanel({
  stats,
  t,
  lang,
}: {
  readonly stats: StatsData;
  readonly t: Strings;
  readonly lang: Lang;
}) {
  const total = MASTERY_LANE_IDS.reduce((n, lane) => n + masteryOf(stats, lane).attempted, 0);
  const untouched = MASTERY_LANE_IDS.filter((lane) => masteryOf(stats, lane).attempted === 0);
  const favourite = favouriteLane(stats);

  const takeaway = (): string => {
    if (total === 0) return t.masteryEmpty;
    if (untouched.length > 0) {
      return t.masteryUntouched(
        untouched.map((lane) => masteryLabel(lane, lang).toLowerCase()).join(', '),
      );
    }
    if (favourite !== null && masterySpread(stats) >= 0.4) {
      return t.masteryNarrow(masteryLabel(favourite, lang));
    }
    return t.masteryEven;
  };

  return (
    <section
      data-testid="mastery-panel"
      className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap)"
    >
      <div className="mb-[0.7em] flex items-baseline justify-between gap-3">
        <span className={MICRO_LABEL}>{t.mastery}</span>
        <span className="font-arcade-ui text-[0.8em] text-(--color-ap-muted)">
          {String(MASTERY_UNLOCK)}★
        </span>
      </div>
      <ul className="flex flex-col gap-[0.55em]">
        {MASTERY_LANE_IDS.map((lane) => {
          const { attempted, made } = masteryOf(stats, lane);
          const { color, glyph } = masteryStyle(lane);
          const pct = Math.min(100, (made / MASTERY_UNLOCK) * 100);
          const done = made >= MASTERY_UNLOCK;
          return (
            <li key={lane} className="flex items-center gap-[0.6em]">
              <span
                aria-hidden="true"
                className="w-[1em] shrink-0 text-center text-[0.9em] leading-none"
                style={{ color }}
              >
                {glyph}
              </span>
              <span className="w-[6.5em] shrink-0 truncate font-arcade-ui text-[0.85em] max-sm:w-[5em]">
                {masteryLabel(lane, lang)}
              </span>
              <ProgressBar pct={pct} className="min-w-0 flex-1" fill={color} />
              <span
                className={`w-[8.5em] shrink-0 text-right font-arcade-ui text-[0.75em] tabular-nums max-sm:w-[6em] ${
                  done ? 'text-(--color-ap-gold)' : 'text-(--color-ap-muted)'
                }`}
              >
                {t.masteryLane(made, attempted)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-[0.8em] font-arcade-ui text-[0.8em] text-(--color-ap-text)/75">
        {takeaway()}
      </p>
    </section>
  );
}

/**
 * One social fact (best partner / nemesis) — an avatar + name + relation.
 *
 * A link when the server told us their public id: the tile names a person, and
 * a named person you can't ask about is a dead end. Without a pid (an older
 * worker's response) it stays exactly what it was, a plain fact.
 */
function SocialPanel({
  heading,
  headingClass,
  chipColor,
  pid,
  name,
  relation,
  linkLabel,
  testId,
  empty,
}: {
  readonly heading: string;
  readonly headingClass: string;
  readonly chipColor: string;
  readonly pid: string | undefined;
  readonly name: string | undefined;
  readonly relation: string;
  readonly linkLabel: (name: string) => string;
  readonly testId: string;
  readonly empty: string;
}) {
  const body =
    name === undefined ? (
      <p className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/75">{empty}</p>
    ) : (
      <div className="flex items-center gap-[0.7em]">
        <AvatarChip name={name} color={chipColor} size="sm" />
        <div className="min-w-0 flex-1 font-arcade-ui">
          <div
            data-testid={testId}
            className="truncate font-arcade-display text-[1em] uppercase text-(--color-ap-text)"
          >
            {name}
          </div>
          <div className="text-[0.8em] tabular-nums text-(--color-ap-muted)">{relation}</div>
        </div>
        {pid !== undefined && (
          <span aria-hidden className="shrink-0 text-(--color-ap-muted)">
            ›
          </span>
        )}
      </div>
    );
  const shell =
    'rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap)';
  const inner = (
    <>
      <div
        className={`mb-[0.6em] font-arcade-ui text-[0.68em] font-semibold uppercase tracking-[0.14em] ${headingClass}`}
      >
        {heading}
      </div>
      {body}
    </>
  );
  if (pid === undefined || name === undefined) return <div className={shell}>{inner}</div>;
  return (
    <a
      href={`#h2h/${pid}`}
      className={`${shell} block transition-colors hover:bg-(--color-ap-panel-hover)`}
    >
      {inner}
      {/* Appended, never an aria-label: a label REPLACES the tile's own text as
          the accessible name, so a screen reader would lose the heading and the
          relation ("beats you 5 of 8") that are the whole point of the tile. */}
      <span className="sr-only">{linkLabel(name)}</span>
    </a>
  );
}

/**
 * The people you keep sitting with — every regular, not a top-N slice, each a
 * door into that head-to-head. The two tiles above only ever name two people;
 * this is the rest of the table, and the only way to reach someone you've
 * neither lost to nor won beside.
 */
function RegularsPanel({
  regulars,
  t,
}: {
  readonly regulars: readonly StatsRegular[];
  readonly t: Strings;
}) {
  return (
    <section className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap)">
      <div className="mb-[0.7em] flex items-baseline justify-between gap-3">
        <span className={MICRO_LABEL}>{t.regulars}</span>
        <span className="font-arcade-ui text-[0.75em] text-(--color-ap-muted)">
          {regulars.length}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2" data-testid="regulars-list">
        {regulars.map((r) => (
          <li key={r.pid} className="min-w-0">
            <a
              href={`#h2h/${r.pid}`}
              className="flex items-center gap-[0.5em] rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-[0.6em] py-[0.35em] shadow-(--shadow-ap-sm) transition-colors hover:bg-(--color-ap-panel-hover)"
            >
              <AvatarChip name={r.name} color="var(--color-suit-brown)" size="sm" />
              <span className="min-w-0 font-arcade-ui">
                <span className="block truncate font-arcade-display text-[0.9em] uppercase text-(--color-ap-text)">
                  {r.name}
                </span>
                <span className="block truncate text-[0.7em] tabular-nums text-(--color-ap-muted)">
                  {t.regularShare(r.withGames, r.vsGames)}
                </span>
              </span>
              <span className="sr-only">{t.headToHead(r.name)}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-[0.7em] font-arcade-ui text-[0.75em] text-(--color-ap-text)/70">
        {t.regularsHint}
      </p>
    </section>
  );
}

/** "Your record": the arcade record-book — an ivory ruled hero (win rate +
 * form sparkline), the headline numbers, bid accuracy, the people you sit
 * with, and a ruled scorepad of recent games. */
export function Stats({
  onLeave,
  demoStats,
  demoGames,
  demoLoading = false,
  initialGamesView,
}: StatsProps) {
  const lang = useLang();
  const t = T[lang];
  const [stats, setStats] = useState<StatsData | null>(demoStats ?? null);
  const [games, setGames] = useState<readonly HistoryGame[] | null>(demoGames ?? null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<'recent' | 'all'>(initialGamesView ?? 'recent');
  // "Show more" (All view only): a full page suggests there might be another
  // one — the server's the only one who actually knows, so this is a guess
  // that self-corrects the moment a page comes back short.
  const [hasMore, setHasMore] = useState((demoGames?.length ?? 0) >= HISTORY_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (demoStats !== undefined || demoLoading) return;
    let live = true;
    fetchStats()
      .then((s) => live && setStats(s))
      .catch(() => live && setError(true));
    // Recent games power the sparkline + scorepad; their absence never blocks
    // the core record, so a failure just leaves the ledger without a game list.
    fetchHistory()
      .then((g) => {
        if (!live) return;
        setGames(g);
        setHasMore(g.length >= HISTORY_PAGE_SIZE);
      })
      .catch(() => live && setGames([]));
    return () => {
      live = false;
    };
  }, [demoStats, demoLoading]);

  /** Fetch the next page, older than the oldest game already loaded (the list
   * is newest-first, so that's the last element), and append it. */
  async function loadMore(): Promise<void> {
    if (games === null || games.length === 0 || loadingMore) return;
    const oldest = games[games.length - 1]?.finishedAt;
    if (oldest === null || oldest === undefined) {
      setHasMore(false); // no honest cursor to page from
      return;
    }
    setLoadingMore(true);
    try {
      const more = await fetchHistoryPage(oldest);
      setGames((g) => [...(g ?? []), ...more]);
      setHasMore(more.length >= HISTORY_PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  // Oldest → newest, capped, for a left-to-right "recent form" reading.
  const recent =
    games === null
      ? []
      : [...games]
          .filter((g) => g.finishedAt !== null && g.winnerTeam !== null)
          .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
          .slice(-12);
  const recentWins = recent.filter(youWon).length;

  // Regulars minus the two the tiles above already name (see the panel below).
  const others = (stats?.regulars ?? []).filter(
    (r) => r.pid !== stats?.bestPartner?.pid && r.pid !== stats?.nemesis?.pid,
  );

  const bidPct = stats === null ? null : accuracyPct(stats.bids.made, stats.bids.attempted);
  const saPct =
    stats === null ? null : accuracyPct(stats.sansAtout.made, stats.sansAtout.attempted);

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />

        <MetaNav current="stats" />

        {error ? (
          <ShellNote>{t.error}</ShellNote>
        ) : stats === null ? (
          <ShellNote>
            <PixelWave label={t.dealing} />
          </ShellNote>
        ) : stats.games === 0 ? (
          <ShellNote>
            <div className="font-arcade-display text-[1.3em] uppercase text-(--color-ap-ok)">
              {t.noGames}
            </div>
            <p className="mt-[0.5em]">{t.noGamesBody}</p>
            <p className="mt-[0.5em] text-[0.85em] text-(--color-ap-muted)">{t.practiceNote}</p>
          </ShellNote>
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

            {/* Games watched to the end, as a spectator — its own quiet fact,
                not folded into the played-games grid above since it isn't a
                played game. Shown only when it's > 0: "watched 0" would read
                like an invitation, not a fact worth a line. */}
            {(stats.spectated ?? 0) > 0 && (
              <p className="text-center font-arcade-ui text-[0.75em] text-(--color-ap-muted)">
                {t.spectated(stats.spectated ?? 0)}
              </p>
            )}

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

            {/* Suit mastery — the five lanes, straight after bid accuracy:
                that headline says how often your contracts stand, this says
                which trumps you take them in. */}
            <MasteryPanel stats={stats} t={t} lang={lang} />

            {/* Social facts: best partner + nemesis, side by side. */}
            <section className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <SocialPanel
                heading={t.bestPartner}
                headingClass="text-(--color-ap-ok)"
                chipColor="var(--color-suit-green)"
                pid={stats.bestPartner?.pid}
                linkLabel={t.headToHead}
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
                pid={stats.nemesis?.pid}
                linkLabel={t.headToHead}
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

            {/* The rest of the table. The two people the tiles already named
                are filtered out — one screen naming the same person twice reads
                as two different facts about two different people. Rendered only
                when someone is left: an empty "Regulars" panel would be a
                promise the record can't keep yet. */}
            {others.length > 0 && <RegularsPanel regulars={others} t={t} />}

            {/* Games — ruled ledger, Recent (≤12, scorepad) or All (full list, replay links). */}
            {games !== null && games.length > 0 && (
              <section className="overflow-hidden rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap) [&_:focus-visible]:outline-offset-[-2px]">
                <div
                  className={`flex items-center justify-between gap-3 border-b-2 border-(--color-ap-ink) px-[0.9em] py-[0.7em] ${MICRO_LABEL}`}
                >
                  <span>{t.gamesHeader}</span>
                  <span className="flex gap-1.5 normal-case tracking-normal">
                    {(['recent', 'all'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={view === v}
                        onClick={() => setView(v)}
                        className={`cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-2.5 py-1 font-arcade-display text-[0.65em] uppercase tracking-wide shadow-(--shadow-ap-sm) transition-colors ${
                          view === v
                            ? 'bg-(--color-ap-violet) text-(--color-ap-ink)'
                            : 'bg-(--color-ap-panel) text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)'
                        }`}
                      >
                        {v === 'recent' ? t.viewRecent : t.viewAll}
                      </button>
                    ))}
                  </span>
                </div>
                {view === 'recent' ? (
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
                ) : (
                  <div className="flex flex-col gap-2 p-3">
                    {games.map((g) => (
                      <GameRow key={g.id} game={g} />
                    ))}
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => void loadMore()}
                        disabled={loadingMore}
                        className="mt-1 cursor-pointer self-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-1.5 font-arcade-display text-[0.75em] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) transition-colors hover:bg-(--color-ap-panel-hover) disabled:cursor-default disabled:opacity-60"
                      >
                        {t.showMore}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
