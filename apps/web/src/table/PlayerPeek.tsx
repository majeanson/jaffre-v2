import type { BotDifficulty } from '@jaffre/protocol';
import { ARCADE, TeamGlyph, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useState } from 'react';
import { fetchStats, type Stats } from '../net/history.js';
import type { SeatChipInfo } from './useTableDerived.js';

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
    selfOnly: string;
  }
> = {
  en: {
    teams: ['Team Sun', 'Team Moon'],
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
    selfOnly: 'Records are private — only yours is shown.',
  },
  fr: {
    teams: ['Équipe Soleil', 'Équipe Lune'],
    connected: 'Connecté',
    disconnected: 'Déconnecté',
    you: 'toi',
    difficulty: 'Difficulté',
    diff: { easy: 'Facile', normal: 'Normal', hard: 'Difficile' },
    record: 'Ton bilan',
    games: 'Parties',
    wins: 'Victoires',
    winRate: 'Taux',
    streak: 'Série',
    best: (n) => `record ${n}`,
    loading: 'Chargement…',
    noRecord: 'Aucune partie',
    selfOnly: 'Les bilans sont privés — seul le tien est affiché.',
  },
};

/** Colour-code the difficulty like the lobby: green (easy) → gold → red (hard). */
const DIFFICULTY_TONE: Record<BotDifficulty, string> = {
  easy: 'border-(--color-ap-ok) text-(--color-ap-ok)',
  normal: 'border-(--color-ap-gold) text-(--color-ap-gold)',
  hard: 'border-(--color-ap-danger) text-(--color-ap-danger-text)',
};

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

export interface PlayerPeekProps {
  readonly info: SeatChipInfo;
}

/**
 * The seat-peek panel: avatar-free header (team glyph + name + connection) plus
 * a body that respects the self-scoped stats API — your OWN seat shows your full
 * record, a bot shows its difficulty, and any other human shows only their
 * name/team/connection (their record is private, so we never fetch it).
 */
export function PlayerPeek({ info }: PlayerPeekProps) {
  const t = T[useLang()];
  return (
    <div
      role="dialog"
      aria-label={info.name}
      className={`${ARCADE.popover} w-[13.5rem] max-w-[80vw] p-3 font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-text)`}
    >
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

      <div className="mt-2.5 border-t-2 border-(--color-ap-ink)/25 pt-2.5">
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
          <>
            <p className="mb-1.5 font-arcade-display text-[0.9em] tracking-[0.12em] text-(--color-ap-muted) uppercase">
              {t.record}
            </p>
            <OwnRecord />
          </>
        ) : (
          <p className="text-(--color-ap-muted)">{t.selfOnly}</p>
        )}
      </div>
    </div>
  );
}
