import { useEffect, useState } from 'react';
import { AvatarChip, PixelWave, useLang, type Lang } from '@jaffre/ui';
import { MetaHeader } from '../components/MetaHeader.js';
import { MetaNav } from '../components/MetaNav.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { ShellNote } from '../components/ShellNote.js';
import { fetchLeaderboard, fetchStats, type Leaderboard, type Stats } from '../net/history.js';
import { fetchAwards, type EarnedAward } from '../net/awards.js';
import { AWARDS } from '../awards.js';
import { levelProgress, nextTrackReward, xpFromStats } from '../progression.js';
import { trackRewardLabel } from '../trackReward.js';
import { CARD_SKINS, currentCardSkin } from '../cosmetics.js';
import { THEMES, currentTheme } from '../theme.js';
import { getProfile } from '../net/auth.js';
import { playerName } from '../net/socket.js';

export interface CornerProps {
  readonly onLeave: () => void;
  /** Scene viewer: staged record so the screen renders without the network. */
  readonly demoStats?: Stats;
  /** Scene viewer: staged earned-awards list. */
  readonly demoAwards?: readonly EarnedAward[];
  /** Scene viewer: staged standing for the rank tile. */
  readonly demoStanding?: Leaderboard['you'];
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    dealing: string;
    error: string;
    level: (n: number) => string;
    maxLevel: string;
    xp: (into: number, span: number) => string;
    winRate: string;
    wonOf: (wins: number, games: number) => string;
    noGames: string;
    latestAward: string;
    noAwards: string;
    /** Cold-start twin of `latestAward` — the shelf is empty, the case isn't. */
    awardsCase: string;
    inTheCase: (n: number) => string;
    nextReward: (label: string, level: number) => string;
    equipped: string;
    rank: string;
    rankAt: (n: number) => string;
    unranked: string;
    unrankedHint: string;
    paint: string;
    paintGo: string;
    paintEdit: string;
    paintHint: string;
  }
> = {
  en: {
    title: 'Your corner',
    home: 'Home',
    dealing: 'Loading…',
    error: 'Your corner needs the online server. Try again shortly.',
    level: (n) => `Level ${String(n)}`,
    maxLevel: 'Max level',
    xp: (into, span) => `${String(into)} / ${String(span)} XP to next level`,
    winRate: 'Win rate',
    wonOf: (wins, games) => `${String(wins)} of ${String(games)} won`,
    noGames: 'No games yet',
    latestAward: 'Latest award',
    noAwards: 'No awards yet',
    awardsCase: 'The case',
    inTheCase: (n) => `${String(n)} waiting to be won`,
    nextReward: (label, level) => `Next: ${label} at level ${String(level)}`,
    equipped: 'Equipped',
    rank: 'Rank',
    rankAt: (n) => `#${String(n)} on the board`,
    unranked: 'Unranked',
    unrankedHint: '10 rated games to join the board',
    paint: 'Your avatar',
    paintGo: 'Paint it',
    paintEdit: 'Repaint it',
    paintHint: 'Pixel-art studio — your face at every table',
  },
  fr: {
    title: 'Ton coin',
    home: 'Accueil',
    dealing: 'Chargement…',
    error: 'Ton coin a besoin du serveur en ligne. Réessaie bientôt.',
    level: (n) => `Niveau ${String(n)}`,
    maxLevel: 'Niveau max',
    xp: (into, span) => `${String(into)} / ${String(span)} XP vers le prochain niveau`,
    winRate: 'Taux de victoires',
    wonOf: (wins, games) => `${String(wins)} sur ${String(games)} gagnées`,
    noGames: 'Pas encore de parties',
    latestAward: 'Dernière récompense',
    noAwards: 'Pas encore de récompense',
    awardsCase: 'La collection',
    inTheCase: (n) => `${String(n)} à gagner`,
    nextReward: (label, level) => `Prochaine : ${label} au niveau ${String(level)}`,
    equipped: 'Équipé',
    rank: 'Rang',
    rankAt: (n) => `#${String(n)} au classement`,
    unranked: 'Non classé',
    unrankedHint: '10 parties cotées pour entrer au classement',
    paint: 'Ton avatar',
    paintGo: 'Peins-le',
    paintEdit: 'Repeins-le',
    paintHint: 'Studio pixel — ton visage à chaque table',
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
 * header shape), and this screen's own body is a snapshot of the five other
 * meta screens — level, win rate, latest award, equipped cosmetics, rank —
 * each tile linking through to its full screen. Every tab has a tile: the
 * strip is the map, the tiles are the state, and neither repeats the other.
 */
export function Corner({ onLeave, demoStats, demoAwards, demoStanding }: CornerProps) {
  const lang = useLang();
  const t = T[lang];
  const [stats, setStats] = useState<Stats | null>(demoStats ?? null);
  const [earned, setEarned] = useState<readonly EarnedAward[]>(demoAwards ?? []);
  const [standing, setStanding] = useState<Leaderboard['you']>(demoStanding ?? null);
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
    // The board is 30s-cached and shared with the Leaderboard screen — an
    // unranked player (or a failed read) simply shows the "not yet" tile.
    fetchLeaderboard()
      .then((b) => live && setStanding(b.you))
      .catch(() => live && setStanding(null));
    return () => {
      live = false;
    };
  }, [demoStats]);

  // Earned rows include ids the catalog doesn't carry — foil:<skin> grants
  // are real rows in user_awards but have no AWARDS entry (they're cosmetic
  // announcements, not the award shelf). Filter to catalog ids BEFORE picking
  // the newest, or a foil row could win the reduce and then miss the
  // `AWARDS.find` below, falling back to the cold "no awards yet" copy.
  const catalogued = earned.filter((e) => AWARDS.some((a) => a.id === e.id));
  const latest =
    catalogued.length === 0
      ? null
      : catalogued.reduce((a, b) => (b.grantedAt > a.grantedAt ? b : a));
  const latestAward = latest === null ? null : (AWARDS.find((a) => a.id === latest.id) ?? null);

  const skinLabel = CARD_SKINS.find((c) => c.id === currentCardSkin())?.label ?? currentCardSkin();
  const themeLabel = THEMES.find((c) => c.id === currentTheme())?.label ?? currentTheme();

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text) max-sm:p-4">
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
            standing={standing}
            // Same catalog-only counting as `latest` above — a foil row must
            // not count as "one fewer award left to earn".
            lockedCount={Math.max(0, AWARDS.length - catalogued.length)}
          />
        )}
      </div>
    </main>
  );
}

/** The snapshot tiles — one per meta destination, split out so the level bar's
 * progress calc only runs once `stats` is known non-null. */
function CornerTiles({
  lang,
  t,
  stats,
  latestAward,
  skinLabel,
  themeLabel,
  standing,
  lockedCount,
}: {
  readonly lang: Lang;
  readonly t: (typeof T)['en'];
  readonly stats: Stats;
  readonly latestAward: (typeof AWARDS)[number] | null;
  readonly skinLabel: string;
  readonly themeLabel: string;
  readonly standing: Leaderboard['you'];
  /** Awards still unearned — what the cold awards tile invites you towards. */
  readonly lockedCount: number;
}) {
  const progress = levelProgress(xpFromStats(stats));
  const barPct = progress.span === 0 ? 100 : (progress.into / progress.span) * 100;
  const profile = getProfile();

  // A brand-new player's corner was four tiles of "nothing yet" — the two
  // surfaces that actually give them something to want (the level track's next
  // prize, the case full of unearned awards) were buried mid-grid. Cold, those
  // two lead; the ones that can only report an absence sink. Every tab still
  // has a tile — the order changes, the map does not.
  const cold = stats.games === 0;
  const nextReward = nextTrackReward(progress.level);

  const journeyTile = (
    <a key="journey" href="#journey" className={TILE_CLASS}>
      <span className={MICRO_LABEL}>{t.level(progress.level)}</span>
      <ProgressBar pct={barPct} />
      {/* The XP line fills the tile to its win-rate sibling's weight — bare,
          the tile was mostly empty space below the bar. */}
      <span className="font-arcade-ui text-[0.8em] text-(--color-ap-muted)">
        {progress.span === 0 ? t.maxLevel : t.xp(progress.into, progress.span)}
      </span>
      {/* Cold, "0 / 25 XP" is a number with nothing behind it. Naming the prize
          is the whole reason to tap through — same line the Journey shows, from
          the same helper, so the two can't promise different things. */}
      {cold && nextReward !== null && (
        <span className="font-arcade-ui text-[0.8em] text-(--color-ap-text)">
          ✨ {t.nextReward(trackRewardLabel(nextReward), nextReward.level)}
        </span>
      )}
    </a>
  );

  const statsTile = (
    <a key="stats" href="#stats" className={TILE_CLASS}>
      <span className={MICRO_LABEL}>{t.winRate}</span>
      {stats.games === 0 ? (
        <span className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/75">{t.noGames}</span>
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
  );

  const awardsTile = (
    <a key="awards" href="#awards" className={TILE_CLASS}>
      <span className={MICRO_LABEL}>{cold ? t.awardsCase : t.latestAward}</span>
      {latestAward === null ? (
        // "No awards yet" states the obvious and invites nothing. The case is
        // full of them, each with a progress bar, one tap away — say THAT.
        <span className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/75">
          {lockedCount > 0 ? t.inTheCase(lockedCount) : t.noAwards}
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
  );

  const collectionTile = (
    <a key="collection" href="#collection" className={TILE_CLASS}>
      <span className={MICRO_LABEL}>{t.equipped}</span>
      <span className="font-arcade-display text-[0.95em] uppercase text-(--color-ap-text)">
        {skinLabel} · {themeLabel}
      </span>
    </a>
  );

  // The sixth destination: the strip has a Leaderboard tab, so the snapshot
  // row carries its summary too — no tab without a tile.
  const leaderboardTile = (
    <a key="leaderboard" href="#leaderboard" className={`${TILE_CLASS} sm:col-span-2`}>
      <span className={MICRO_LABEL}>{t.rank}</span>
      {standing === null ? (
        <>
          <span className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/75">
            {t.unranked}
          </span>
          <span className="font-arcade-ui text-[0.8em] text-(--color-ap-muted)">
            {t.unrankedHint}
          </span>
        </>
      ) : (
        <span className="flex items-baseline gap-[0.6em]">
          <span className="font-arcade-display text-[1.6em] tabular-nums text-(--color-ap-gold)">
            {t.rankAt(standing.rank)}
          </span>
          <span className="font-arcade-ui text-[0.8em] tabular-nums text-(--color-ap-muted)">
            {standing.rating}
          </span>
        </span>
      )}
    </a>
  );

  // The Paint Studio's only labelled door in the app — 12 source files
  // previously reachable just by clicking the home hero card.
  const paintTile = (
    <a key="paint" href="#paint" className={`${TILE_CLASS} sm:col-span-2`}>
      <span className={MICRO_LABEL}>{t.paint}</span>
      {/* The tile shows the painting itself — the same chip the felt, the
            chrome bar and every seat draw from, so "your avatar" is a look,
            not a promise. Unpainted, the chip falls back to the initial. */}
      <span className="flex items-center gap-[0.7em]">
        <AvatarChip
          name={playerName()}
          color={profile.color ?? undefined}
          size="md"
          paint={profile.paint}
        />
        <span className="flex min-w-0 flex-col gap-[0.2em]">
          <span className="font-arcade-display text-[0.95em] uppercase text-(--color-ap-text)">
            {profile.paint === null || profile.paint === '' ? t.paintGo : t.paintEdit}
          </span>
          <span className="font-arcade-ui text-[0.8em] text-(--color-ap-muted)">{t.paintHint}</span>
        </span>
      </span>
    </a>
  );

  // Reordering the ARRAY, not with CSS `order-*`: grid order would leave the
  // DOM sequence stale, so keyboard focus would jump around a grid that looks
  // ordered — and every one of these scenes is axe-gated.
  const tiles = cold
    ? [journeyTile, awardsTile, collectionTile, statsTile, paintTile, leaderboardTile]
    : [journeyTile, statsTile, awardsTile, collectionTile, leaderboardTile, paintTile];

  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{tiles}</div>;
}
