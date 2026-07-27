import type { BotDifficulty } from '@jaffre/protocol';
import { ARCADE, SuitShape, suitName, TeamGlyph, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useState } from 'react';
import { fetchLeaderboard, fetchStats, type Leaderboard, type Stats } from '../net/history.js';
import type { GamePeekInfo, SeatChipInfo } from './useTableDerived.js';
import { TEAM_LABELS } from '../teams.js';

const T: Record<
  Lang,
  {
    teams: readonly [string, string];
    connected: string;
    disconnected: string;
    you: string;
    difficulty: string;
    diff: Record<BotDifficulty, string>;
    record: string;
    games: string;
    wins: string;
    winRate: string;
    streak: string;
    best: (n: number) => string;
    loading: string;
    noRecord: string;
    elo: string;
    rankedGames: string;
    unranked: string;
    // Section headers.
    thisGame: string;
    player: string;
    // Game section.
    roundN: (n: number) => string;
    score: string;
    firstTo: (n: number) => string;
    bet: string;
    noBet: string;
    trump: string;
    noTrump: string;
    undecided: string;
    tricks: string;
    // Player role badges.
    dealer: string;
    toPlay: string;
    holdsBet: string;
    autoPlay: string;
    botPlaying: string;
    bidThisRound: string;
  }
> = {
  en: {
    teams: TEAM_LABELS.en,
    connected: 'Connected',
    disconnected: 'Disconnected',
    you: 'you',
    difficulty: 'Difficulty',
    diff: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },
    record: 'Your record',
    games: 'Games',
    wins: 'Wins',
    winRate: 'Win rate',
    streak: 'Streak',
    best: (n) => `best ${n}`,
    loading: 'Loading…',
    noRecord: 'No games yet',
    elo: 'Elo',
    rankedGames: 'Ranked games',
    unranked: 'Not on the leaderboard yet.',
    thisGame: 'This game',
    player: 'Player',
    roundN: (n) => `Round ${n}`,
    score: 'Score',
    firstTo: (n) => `first to ${n}`,
    bet: 'Bid',
    noBet: 'No bid yet',
    trump: 'Trump',
    noTrump: 'No trump',
    undecided: 'undecided',
    tricks: 'Tricks',
    dealer: 'Dealer',
    toPlay: 'To play',
    holdsBet: 'Bid holder',
    autoPlay: 'Auto-play',
    botPlaying: 'Bot playing',
    bidThisRound: 'Bid this round',
  },
  fr: {
    teams: TEAM_LABELS.fr,
    connected: 'Connecté',
    disconnected: 'Déconnecté',
    you: 'toi',
    difficulty: 'Difficulté',
    diff: { easy: 'Facile', normal: 'Normal', hard: 'Difficile' },
    record: 'Ton bilan',
    games: 'Parties',
    wins: 'Victoires',
    winRate: '% victoires',
    streak: 'Séquence',
    best: (n) => `record ${n}`,
    loading: 'Chargement…',
    noRecord: 'Aucune partie',
    elo: 'Elo',
    rankedGames: 'Parties classées',
    unranked: 'Pas encore au classement.',
    thisGame: 'Cette partie',
    player: 'Joueur',
    roundN: (n) => `Ronde ${n}`,
    score: 'Pointage',
    firstTo: (n) => `premier à ${n}`,
    bet: 'Mise',
    noBet: 'Pas de mise',
    trump: 'Atout',
    noTrump: 'Sans atout',
    undecided: 'indéterminé',
    tricks: 'Levées',
    dealer: 'Brasseur',
    toPlay: 'À jouer',
    holdsBet: 'Preneur',
    autoPlay: 'Jeu auto',
    botPlaying: 'Le bot joue',
    bidThisRound: 'Mise cette ronde',
  },
};

/** Colour-code the difficulty like the lobby: green (easy) → gold → red (hard). */
const DIFFICULTY_TONE: Record<BotDifficulty, string> = {
  easy: 'border-(--color-ap-ok) text-(--color-ap-ok)',
  normal: 'border-(--color-ap-gold) text-(--color-ap-gold)',
  hard: 'border-(--color-ap-danger) text-(--color-ap-danger-text)',
};

/** A small uppercase heading that opens each section of the peek. */
function SectionTitle({ children }: { children: string }) {
  return (
    <p className="font-arcade-display text-[0.8em] tracking-[0.14em] text-(--color-ap-muted) uppercase">
      {children}
    </p>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-(--color-ap-muted)">{label}</dt>
      <dd className="font-arcade-display text-(--color-ap-text) tabular-nums">{value}</dd>
    </div>
  );
}

/** Your own record, fetched on open from the self-scoped /api/stats. */
function OwnRecord() {
  const t = T[useLang()];
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchStats()
      .then((s) => {
        if (live) setStats(s);
      })
      .catch(() => {
        if (live) setStats(null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  if (loading) return <p className="text-(--color-ap-muted)">{t.loading}</p>;
  if (stats === null || stats.games === 0)
    return <p className="text-(--color-ap-muted)">{t.noRecord}</p>;

  return (
    <dl className="flex flex-col gap-1">
      <StatRow label={t.games} value={String(stats.games)} />
      <StatRow label={t.wins} value={String(stats.wins)} />
      <StatRow label={t.winRate} value={`${String(Math.round(stats.winRate * 100))}%`} />
      <StatRow
        label={t.streak}
        value={`${String(stats.streak.current)} · ${t.best(stats.streak.best)}`}
      />
    </dl>
  );
}

/** Another human's PUBLIC standing — their Elo line off the public leaderboard.
 * Matched by the roster seat's opaque public id (same hash the board rows
 * carry); display name is only the fallback for a roster without pids, where
 * duplicate names may show the wrong row. Full records stay private; the
 * board is the one thing everyone can already see. */
function PublicStanding({ name, pid }: { name: string; pid: string | null }) {
  const t = T[useLang()];
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchLeaderboard()
      .then((b) => {
        if (live) setBoard(b);
      })
      .catch(() => {
        if (live) setBoard(null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [name]);

  if (loading) return <p className="text-(--color-ap-muted)">{t.loading}</p>;
  if (board === null) return <p className="text-(--color-ap-muted)">{t.unranked}</p>;
  const rankIndex =
    pid !== null
      ? board.top.findIndex((r) => r.id === pid)
      : board.top.findIndex((r) => r.name === name);
  const row = board.top[rankIndex];
  if (row === undefined) return <p className="text-(--color-ap-muted)">{t.unranked}</p>;

  return (
    <dl className="flex flex-col gap-1">
      <StatRow label={t.elo} value={`${String(row.rating)} · #${String(rankIndex + 1)}`} />
      <StatRow label={t.rankedGames} value={String(row.ratingGames)} />
    </dl>
  );
}

/** One team's game total with its glyph — the viewer's side gets a soft tint. */
function TeamScore({
  team,
  score,
  label,
  mine,
}: {
  team: 0 | 1;
  score: number;
  label: string;
  mine: boolean;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-(--radius-ap-inner) px-1.5 py-0.5 ${
        mine ? 'bg-(--color-ap-violet)/12' : ''
      }`}
    >
      <TeamGlyph team={team} size="1.1em" label={label} />
      <span className="font-arcade-display text-(--color-ap-text) tabular-nums">{score}</span>
    </span>
  );
}

/** The trump mark for the game section: a suit shape, "No trump", or undecided. */
function TrumpValue({ game }: { game: GamePeekInfo }) {
  const lang = useLang();
  const t = T[lang];
  if (!game.trumpDecided)
    return <span className="text-(--color-ap-muted) italic">{t.undecided}</span>;
  if (game.trump === null)
    return <span className="font-arcade-display text-(--color-ap-text)">{t.noTrump}</span>;
  return (
    <span className="flex items-center gap-1.5">
      <SuitShape suit={game.trump} size="0.85em" />
      <span className="font-arcade-display text-(--color-ap-text) capitalize">
        {suitName(game.trump, lang)}
      </span>
    </span>
  );
}

/** The "This game" section — the full match context, identical for every seat. */
function GameSection({ game }: { game: GamePeekInfo }) {
  const t = T[useLang()];
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>{t.thisGame}</SectionTitle>
        <span className="font-arcade-display text-[0.85em] text-(--color-ap-violet-soft)">
          {t.roundN(game.round)}
        </span>
      </div>
      <p className="font-arcade-ui text-(--color-ap-text)">{game.action}</p>

      <dl className="flex flex-col gap-1.5">
        {/* Score — both team totals side by side, with the race target. The
            "first to N" caption lives inside the <dd> so the <dl> keeps only
            dt/dd groups (axe's definition-list rule). */}
        <div className="flex items-baseline justify-between gap-2">
          <dt className="shrink-0 text-(--color-ap-muted)">{t.score}</dt>
          <dd className="flex flex-col items-end gap-0.5">
            <span className="flex items-center gap-1">
              <TeamScore
                team={0}
                score={game.scores[0]}
                label={t.teams[0]}
                mine={game.myTeam === 0}
              />
              <TeamScore
                team={1}
                score={game.scores[1]}
                label={t.teams[1]}
                mine={game.myTeam === 1}
              />
            </span>
            <span className="text-[0.85em] text-(--color-ap-muted)">{t.firstTo(game.target)}</span>
          </dd>
        </div>

        {/* The winning bet and how close it is to landing. */}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-(--color-ap-muted)">{t.bet}</dt>
          <dd className="min-w-0 truncate text-right font-arcade-display text-(--color-ap-text) tabular-nums">
            {game.contract === null ? (
              <span className="text-(--color-ap-muted) italic">{t.noBet}</span>
            ) : (
              <>
                {game.contract.bidderName} {game.contract.value}
                {game.contract.sansAtout ? ' SA' : ''}
                {game.phase === 'playing' && (
                  <span className="text-(--color-ap-muted)">
                    {' '}
                    · {game.contract.progress}/{game.contract.value}
                  </span>
                )}
              </>
            )}
          </dd>
        </div>

        {/* Trump this round. */}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-(--color-ap-muted)">{t.trump}</dt>
          <dd className="tabular-nums">
            <TrumpValue game={game} />
          </dd>
        </div>

        {/* Tricks captured this round, per team. */}
        <StatRow label={t.tricks} value={`${game.trickCounts[0]} · ${game.trickCounts[1]}`} />
      </dl>
    </section>
  );
}

/** A single-word status pill for a seat's current role (dealer, turn, bet…). */
function RoleBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={`rounded-(--radius-ap-inner) border-2 px-1.5 py-0.5 font-arcade-display text-[0.8em] tracking-wide uppercase ${tone}`}
    >
      {label}
    </span>
  );
}

/** The "Player" section — identity, live role in the game, and record. */
function PlayerSection({ info }: { info: SeatChipInfo }) {
  const t = T[useLang()];
  const badges: { key: string; label: string; tone: string }[] = [];
  if (info.isTurn)
    badges.push({
      key: 'turn',
      label: t.toPlay,
      tone: 'border-(--color-ap-violet) text-(--color-ap-violet-soft)',
    });
  if (info.isDealer)
    badges.push({
      key: 'dealer',
      label: t.dealer,
      tone: 'border-(--color-ap-ink)/40 text-(--color-ap-muted)',
    });
  if (info.isContract)
    badges.push({
      key: 'bet',
      label: t.holdsBet,
      tone: 'border-(--color-ap-gold) text-(--color-ap-gold)',
    });
  if (info.autoPlay)
    badges.push({
      key: 'auto',
      label: t.autoPlay,
      tone: 'border-(--color-ap-gold) text-(--color-ap-gold)',
    });
  if (info.botPlaying)
    badges.push({
      key: 'covered',
      label: t.botPlaying,
      tone: 'border-(--color-ap-ink)/40 text-(--color-ap-muted)',
    });

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>{t.player}</SectionTitle>
      <div className="flex items-center gap-2">
        <TeamGlyph team={info.team} size="1.4em" label={t.teams[info.team]} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="flex items-center gap-1">
            <span className="truncate font-arcade-ui font-semibold">{info.name}</span>
            {info.isYou && (
              <span className="shrink-0 font-arcade-display text-[0.85em] tracking-[0.1em] text-(--color-ap-violet-soft) uppercase">
                ({t.you})
              </span>
            )}
          </span>
          <span className="text-(--color-ap-muted)">
            {t.teams[info.team]}
            {' · '}
            <span
              className={info.connected ? 'text-(--color-ap-ok)' : 'text-(--color-ap-danger-text)'}
            >
              {info.connected ? t.connected : t.disconnected}
            </span>
          </span>
        </span>
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {badges.map((b) => (
            <RoleBadge key={b.key} label={b.label} tone={b.tone} />
          ))}
        </div>
      )}

      {/* This seat's own declaration this round, right off the table. */}
      {info.bidText !== null && <StatRow label={t.bidThisRound} value={info.bidText} />}

      {info.isBot ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-(--color-ap-muted)">{t.difficulty}</span>
          <span
            className={`rounded-(--radius-ap-inner) border-2 px-2 py-0.5 font-arcade-display text-[0.9em] tracking-wide uppercase ${DIFFICULTY_TONE[info.difficulty ?? 'normal']}`}
          >
            {t.diff[info.difficulty ?? 'normal']}
          </span>
        </div>
      ) : info.isYou ? (
        <div>
          <p className="mb-1.5 font-arcade-display text-[0.9em] tracking-[0.12em] text-(--color-ap-muted) uppercase">
            {t.record}
          </p>
          <OwnRecord />
        </div>
      ) : (
        <PublicStanding name={info.name} pid={info.pid} />
      )}
    </section>
  );
}

export interface PlayerPeekProps {
  readonly info: SeatChipInfo;
}

/**
 * The seat-peek panel opened by tapping an avatar. Two stacked sections: the
 * player it's about (identity, live role, difficulty or your record) and the
 * full state of the game right now (score, bet, trump, tricks) — the latter
 * shared across every seat. Respects the self-scoped stats API: only your own
 * record is ever fetched; other humans show name/team/connection plus their
 * PUBLIC leaderboard standing (Elo), never their private record.
 */
export function PlayerPeek({ info }: PlayerPeekProps) {
  return (
    <div
      role="dialog"
      aria-label={info.name}
      className={`${ARCADE.popover} w-[15.5rem] max-w-[85vw] p-3 font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-text)`}
    >
      <PlayerSection info={info} />
      <div className="mt-2.5 border-t-2 border-(--color-ap-ink)/25 pt-2.5">
        <GameSection game={info.game} />
      </div>
    </div>
  );
}
