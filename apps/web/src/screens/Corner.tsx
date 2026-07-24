import { useEffect, useState } from 'react';
import { PixelWave, useLang, type Lang } from '@jaffre/ui';
import { MetaHeader } from '../components/MetaHeader.js';
import { MetaNav } from '../components/MetaNav.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { ShellNote } from '../components/ShellNote.js';
import { fetchStats, type Stats } from '../net/history.js';
import { fetchAwards, type EarnedAward } from '../net/awards.js';
import { AWARDS } from '../awards.js';
import { levelProgress, xpFromStats } from '../progression.js';
import { CARD_SKINS, currentCardSkin } from '../cosmetics.js';
import { THEMES, currentTheme } from '../theme.js';

export interface CornerProps {
  readonly onLeave: () => void;
  /** Scene viewer: staged record so the screen renders without the network. */
  readonly demoStats?: Stats;
  /** Scene viewer: staged earned-awards list. */
  readonly demoAwards?: readonly EarnedAward[];
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    dealing: string;
    error: string;
    level: (n: number) => string;
    winRate: string;
    wonOf: (wins: number, games: number) => string;
    noGames: string;
    latestAward: string;
    noAwards: string;
    equipped: string;
  }
> = {
  en: {
    title: 'Your corner',
    home: 'Home',
    dealing: 'Loading…',
    error: 'Your corner needs the online server. Try again shortly.',
    level: (n) => `Level ${String(n)}`,
    winRate: 'Win rate',
    wonOf: (wins, games) => `${String(wins)} of ${String(games)} won`,
    noGames: 'No games yet',
    latestAward: 'Latest award',
    noAwards: 'No awards yet',
    equipped: 'Equipped',
  },
  fr: {
    title: 'Ton coin',
    home: 'Accueil',
    dealing: 'Chargement…',
    error: 'Ton coin a besoin du serveur en ligne. Réessaie bientôt.',
    level: (n) => `Niveau ${String(n)}`,
    winRate: 'Taux de victoires',
    wonOf: (wins, games) => `${String(wins)} sur ${String(games)} gagnées`,
    noGames: 'Pas encore de parties',
    latestAward: 'Dernière récompense',
    noAwards: 'Pas encore de récompense',
    equipped: 'Équipé',
  },
};

/** A muted uppercase micro-label — same idiom as Stats.tsx's section labels. */
const MICRO_LABEL =
  'font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)';

const TILE_CLASS =
  'flex flex-col gap-[0.5em] rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap-sm) transition-colors duration-(--duration-flick) hover:bg-(--color-ap-panel-hover)';

/**
 * "Your corner": the one full-screen sheet for everything that's yours. The
 * MetaNav strip on top is the subtab row (corner, journey, collection,
 * awards, record, leaderboard — each its own hash route sharing this same
 * header shape), and this screen's own body is a snapshot of the four other
 * meta screens — level, win rate, latest award, equipped cosmetics — each
 * tile linking through to its full screen.
 */
export function Corner({ onLeave, demoStats, demoAwards }: CornerProps) {
  const lang = useLang();
  const t = T[lang];
  const [stats, setStats] = useState<Stats | null>(demoStats ?? null);
  const [earned, setEarned] = useState<readonly EarnedAward[]>(demoAwards ?? []);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (demoStats !== undefined) return;
    let live = true;
    fetchStats()
      .then((s) => live && setStats(s))
      .catch(() => live && setError(true));
    fetchAwards()
      .then((a) => live && setEarned(a))
      .catch(() => live && setEarned([]));
    return () => {
      live = false;
    };
  }, [demoStats]);

  const latest =
    earned.length === 0 ? null : earned.reduce((a, b) => (b.grantedAt > a.grantedAt ? b : a));
  const latestAward = latest === null ? null : (AWARDS.find((a) => a.id === latest.id) ?? null);

  const skinLabel = CARD_SKINS.find((c) => c.id === currentCardSkin())?.label ?? currentCardSkin();
  const themeLabel = THEMES.find((c) => c.id === currentTheme())?.label ?? currentTheme();

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />

        <MetaNav current="corner" />

        {error ? (
          <ShellNote>{t.error}</ShellNote>
        ) : stats === null ? (
          <ShellNote>
            <PixelWave label={t.dealing} />
          </ShellNote>
        ) : (
          <CornerTiles
            lang={lang}
            t={t}
            stats={stats}
            latestAward={latestAward}
            skinLabel={skinLabel}
            themeLabel={themeLabel}
          />
        )}
      </div>
    </main>
  );
}

/** The four snapshot tiles — split out so the level bar's progress calc only
 * runs once `stats` is known non-null. */
function CornerTiles({
  lang,
  t,
  stats,
  latestAward,
  skinLabel,
  themeLabel,
}: {
  readonly lang: Lang;
  readonly t: (typeof T)['en'];
  readonly stats: Stats;
  readonly latestAward: (typeof AWARDS)[number] | null;
  readonly skinLabel: string;
  readonly themeLabel: string;
}) {
  const progress = levelProgress(xpFromStats(stats));
  const barPct = progress.span === 0 ? 100 : (progress.into / progress.span) * 100;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <a href="#journey" className={TILE_CLASS}>
        <span className={MICRO_LABEL}>{t.level(progress.level)}</span>
        <ProgressBar pct={barPct} />
      </a>

      <a href="#stats" className={TILE_CLASS}>
        <span className={MICRO_LABEL}>{t.winRate}</span>
        {stats.games === 0 ? (
          <span className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/75">
            {t.noGames}
          </span>
        ) : (
          <>
            <span className="font-arcade-display text-[1.6em] tabular-nums text-(--color-ap-gold)">
              {Math.round(stats.winRate * 100)}%
            </span>
            <span className="font-arcade-ui text-[0.8em] text-(--color-ap-muted)">
              {t.wonOf(stats.wins, stats.games)}
            </span>
          </>
        )}
      </a>

      <a href="#awards" className={TILE_CLASS}>
        <span className={MICRO_LABEL}>{t.latestAward}</span>
        {latestAward === null ? (
          <span className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/75">
            {t.noAwards}
          </span>
        ) : (
          <span className="flex items-center gap-[0.5em]">
            <span className="text-[1.6em] leading-none" aria-hidden>
              {latestAward.icon}
            </span>
            <span className="font-arcade-display text-[0.95em] uppercase text-(--color-ap-text)">
              {latestAward.name(lang)}
            </span>
          </span>
        )}
      </a>

      <a href="#collection" className={TILE_CLASS}>
        <span className={MICRO_LABEL}>{t.equipped}</span>
        <span className="font-arcade-display text-[0.95em] uppercase text-(--color-ap-text)">
          {skinLabel} · {themeLabel}
        </span>
      </a>
    </div>
  );
}
