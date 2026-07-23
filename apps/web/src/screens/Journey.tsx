import { useEffect, useState } from 'react';
import {
  AvatarChip,
  CardSkinProvider,
  CARD_SKIN_RENDERERS,
  Cta,
  Panel,
  PixelWave,
  PlayingCard,
  useLang,
  type Lang,
} from '@jaffre/ui';
import {
  LEVEL_TRACK,
  MAX_LEVEL,
  XP_PER_BID_MADE,
  XP_PER_GAME,
  XP_PER_SA_MADE,
  XP_PER_WIN,
  levelProgress,
  trackRewardAt,
  xpBreakdown,
  xpToReach,
  type TrackReward,
} from '../progression.js';
import { CARD_SKINS, DEFAULT_CARD_SKIN } from '../cosmetics.js';
import { THEMES } from '../theme.js';
import { fetchStats, type Stats } from '../net/history.js';
import { getProfile } from '../net/auth.js';
import { playerName } from '../net/socket.js';

export interface JourneyProps {
  readonly onLeave: () => void;
  /** Scene viewer / tests: staged stats so the screen renders without the network. */
  readonly demoStats?: Stats;
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    dealing: string;
    level: string;
    maxLevel: string;
    xp: (into: number, span: number) => string;
    totalXp: (xp: number) => string;
    nextReward: (label: string, level: number) => string;
    trackDone: string;
    howTitle: string;
    howBlurb: string;
    perGame: string;
    perWin: string;
    perBid: string;
    perSa: string;
    trackTitle: string;
    levelShort: (n: number) => string;
    xpShort: (n: number) => string;
    skin: string;
    theme: string;
    unlocked: string;
    breather: string;
    challengesTitle: string;
    challengesBlurb: string;
    collection: string;
    awards: string;
  }
> = {
  en: {
    title: 'Journey',
    home: 'Home',
    dealing: 'Loading…',
    level: 'Level',
    maxLevel: 'Max level',
    xp: (into, span) => `${String(into)} / ${String(span)} XP to next level`,
    totalXp: (xp) => `${String(xp)} XP total`,
    nextReward: (label, level) => `Next reward: ${label} at level ${String(level)}`,
    trackDone: 'Track complete — every level reward is yours.',
    howTitle: 'How you earn XP',
    howBlurb: 'Every finished game moves you forward. Wins and made bids move you faster.',
    perGame: 'per game played',
    perWin: 'per win',
    perBid: 'per made bid',
    perSa: 'per made sans-atout',
    trackTitle: 'The track',
    levelShort: (n) => `Lv ${String(n)}`,
    xpShort: (n) => `${String(n)} XP`,
    skin: 'Card skin',
    theme: 'Theme',
    unlocked: 'Unlocked',
    breather: 'Breather level',
    challengesTitle: 'Beyond the track',
    challengesBlurb:
      'Challenge skins and themes — streaks, win rate, sans-atout, your nemesis — unlock from how you play, not how much. Find them in the Collection and next to their Awards.',
    collection: 'Collection',
    awards: 'Awards',
  },
  fr: {
    title: 'Parcours',
    home: 'Accueil',
    dealing: 'Chargement…',
    level: 'Niveau',
    maxLevel: 'Niveau max',
    xp: (into, span) => `${String(into)} / ${String(span)} XP vers le prochain niveau`,
    totalXp: (xp) => `${String(xp)} XP au total`,
    nextReward: (label, level) => `Prochaine récompense : ${label} au niveau ${String(level)}`,
    trackDone: 'Parcours terminé — toutes les récompenses de niveau sont à toi.',
    howTitle: 'Comment gagner des XP',
    howBlurb: 'Chaque partie terminée te fait avancer. Les victoires et les mises réussies, encore plus.',
    perGame: 'par partie jouée',
    perWin: 'par victoire',
    perBid: 'par mise réussie',
    perSa: 'par sans-atout réussi',
    trackTitle: 'Le parcours',
    levelShort: (n) => `Niv ${String(n)}`,
    xpShort: (n) => `${String(n)} XP`,
    skin: 'Habillage',
    theme: 'Thème',
    unlocked: 'Débloqué',
    breather: 'Niveau tampon',
    challengesTitle: 'Au-delà du parcours',
    challengesBlurb:
      'Les habillages et thèmes défis — séries, taux de victoires, sans-atout, ta némésis — se débloquent selon ta façon de jouer, pas ton volume. Retrouve-les dans la Collection et à côté de leurs Récompenses.',
    collection: 'Collection',
    awards: 'Récompenses',
  },
};

function labelOf(reward: TrackReward): string {
  const catalog = reward.kind === 'skin' ? CARD_SKINS : THEMES;
  return catalog.find((c) => c.id === reward.cosmeticId)?.label ?? reward.cosmeticId;
}

/** A skin reward previews as its face-DOWN card — the back is the star here
 * (it's what the whole table sees of your deck all game long). */
function SkinBackPreview({ id }: { readonly id: string }) {
  const attrs = id === DEFAULT_CARD_SKIN ? {} : { 'data-card-skin': id };
  return (
    <div {...attrs}>
      <CardSkinProvider value={{ id, renderers: CARD_SKIN_RENDERERS[id] ?? {} }}>
        <PlayingCard card={{ suit: 'red', value: 5 }} size="sm" faceDown tilt={-6} />
      </CardSkinProvider>
    </div>
  );
}

/** A theme reward previews as a small felt strip with the two team chips. */
function ThemeSwatch({ id }: { readonly id: string }) {
  return (
    <div
      data-theme={id}
      className="flex h-[2.6em] w-[3.4em] items-center justify-center gap-[0.35em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-felt-800)"
    >
      <span
        className="size-[0.8em] rounded-full border-2 border-(--color-ap-ink)"
        style={{ background: 'var(--color-team-a)' }}
      />
      <span
        className="size-[0.8em] rounded-full border-2 border-(--color-ap-ink)"
        style={{ background: 'var(--color-team-b)' }}
      />
    </div>
  );
}

const LINK_CLASS =
  'inline-flex items-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-5 py-3 font-arcade-display text-[0.8rem] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:bg-(--color-ap-panel-hover) active:translate-x-[3px] active:translate-y-[3px] active:shadow-none';

/**
 * The Journey screen — the ONE place progression reads as a single ladder:
 * your level + XP bar, how XP is earned, and the full level track with its
 * reward at every rung (earned lit, the next one called out, the rest ahead).
 * Challenge cosmetics (skill/style gates) are deliberately NOT rungs — they're
 * teased at the bottom and live in the Collection/Awards.
 */
export function Journey({ onLeave, demoStats }: JourneyProps) {
  const lang = useLang();
  const t = T[lang];
  const [stats, setStats] = useState<Stats | null>(demoStats ?? null);

  useEffect(() => {
    if (demoStats !== undefined) return;
    let live = true;
    fetchStats()
      .then((s) => live && setStats(s))
      .catch(() => live && setStats(null));
    return () => {
      live = false;
    };
  }, [demoStats]);

  const breakdown = stats === null ? null : xpBreakdown(stats);
  const progress = breakdown === null ? null : levelProgress(breakdown.total);
  const nextReward =
    progress === null ? null : (LEVEL_TRACK.find((r) => r.level > progress.level) ?? null);
  const pct =
    progress === null ? 0 : progress.span === 0 ? 100 : (progress.into / progress.span) * 100;

  const xpSources: readonly (readonly [number, string])[] = [
    [XP_PER_GAME, t.perGame],
    [XP_PER_WIN, t.perWin],
    [XP_PER_BID_MADE, t.perBid],
    [XP_PER_SA_MADE, t.perSa],
  ];

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

        {progress === null ? (
          <Panel className="p-[1.2em] text-center font-arcade-ui text-(--color-ap-muted)">
            <PixelWave label={t.dealing} />
          </Panel>
        ) : (
          <>
            {/* Level hero — the headline number + the bar to the next rung. */}
            <Panel as="section" className="flex flex-col gap-[0.7em] p-[1.1em]">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  data-testid="journey-level"
                  className="font-arcade-display text-[1.9em] uppercase leading-none text-(--color-ap-gold)"
                >
                  {t.level} {progress.level}
                </span>
                <span className="font-arcade-ui text-[0.78em] tabular-nums text-(--color-ap-muted)">
                  {t.totalXp(progress.xp)}
                </span>
              </div>
              <div className="h-[0.8em] w-full overflow-hidden rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-ink)/20">
                <div
                  className="h-full bg-(--color-ap-violet)"
                  style={{ width: `${String(pct)}%` }}
                />
              </div>
              <p className="font-arcade-ui text-[0.78em] tabular-nums text-(--color-ap-muted)">
                {progress.level >= MAX_LEVEL ? t.maxLevel : t.xp(progress.into, progress.span)}
              </p>
              {nextReward !== null ? (
                <p className="font-arcade-ui text-[0.85em] text-(--color-ap-text)">
                  ✨ {t.nextReward(labelOf(nextReward), nextReward.level)}
                </p>
              ) : (
                <p className="font-arcade-ui text-[0.85em] text-(--color-ap-text)">
                  🏆 {t.trackDone}
                </p>
              )}
            </Panel>

            {/* How XP is earned — small, so the economy is never a mystery. */}
            <Panel as="section" className="flex flex-col gap-[0.7em] p-[1.1em]">
              <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
                {t.howTitle}
              </h2>
              <p className="font-arcade-ui text-[0.78em] text-(--color-ap-muted)">{t.howBlurb}</p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {xpSources.map(([value, label]) => (
                  <li
                    key={label}
                    className="flex flex-col items-center gap-[0.2em] rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-[0.6em] text-center shadow-(--shadow-ap-sm)"
                  >
                    <span className="font-arcade-display text-[1.15em] text-(--color-ap-gold)">
                      +{value}
                    </span>
                    <span className="font-arcade-ui text-[0.68em] leading-tight text-(--color-ap-muted)">
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            {/* The track — one rung per level, its reward beside it. */}
            <Panel as="section" className="flex flex-col gap-[0.7em] p-[1.1em]">
              <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
                {t.trackTitle}
              </h2>
              <ol className="flex flex-col gap-2">
                {Array.from({ length: MAX_LEVEL - 1 }, (_, i) => i + 2).map((level) => {
                  const reward = trackRewardAt(level);
                  const done = progress.level >= level;
                  const isNext = nextReward !== null && reward?.level === nextReward.level;
                  return (
                    <li
                      key={level}
                      data-testid={`journey-rung-${String(level)}`}
                      className={`flex items-center gap-3 rounded-(--radius-ap-card) border-2 p-[0.6em] shadow-(--shadow-ap-sm) ${
                        isNext
                          ? 'border-(--color-ap-violet) bg-(--color-ap-panel)'
                          : 'border-(--color-ap-ink) bg-(--color-ap-panel)'
                      } ${done || isNext ? '' : 'opacity-60'}`}
                    >
                      <span
                        className={`grid size-[2.4em] shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) font-arcade-display text-[0.78em] leading-none ${
                          done
                            ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
                            : 'bg-(--color-ap-ground) text-(--color-ap-text)'
                        }`}
                      >
                        {t.levelShort(level)}
                      </span>
                      <span className="w-[4.2em] shrink-0 font-arcade-ui text-[0.7em] tabular-nums text-(--color-ap-muted)">
                        {t.xpShort(xpToReach(level))}
                      </span>
                      {reward !== undefined ? (
                        <>
                          <span className="flex shrink-0 items-center">
                            {reward.kind === 'skin' ? (
                              <SkinBackPreview id={reward.cosmeticId} />
                            ) : (
                              <ThemeSwatch id={reward.cosmeticId} />
                            )}
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-arcade-display text-[0.85em] uppercase text-(--color-ap-text)">
                              {labelOf(reward)}
                            </span>
                            <span className="font-arcade-ui text-[0.68em] uppercase tracking-wide text-(--color-ap-muted)">
                              {reward.kind === 'skin' ? t.skin : t.theme}
                              {done ? ` · ${t.unlocked}` : ''}
                            </span>
                          </span>
                        </>
                      ) : (
                        <span className="font-arcade-ui text-[0.72em] text-(--color-ap-muted)">
                          {t.breather}
                        </span>
                      )}
                      {done && (
                        <span aria-hidden className="ml-auto text-[1.1em] text-(--color-ap-ok)">
                          ✓
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Panel>

            {/* Challenges live elsewhere — tease, don't duplicate. */}
            <Panel as="section" className="flex flex-col gap-[0.7em] p-[1.1em]">
              <h2 className="font-arcade-display text-[1.1em] uppercase tracking-wide text-(--color-ap-violet-soft)">
                {t.challengesTitle}
              </h2>
              <p className="font-arcade-ui text-[0.78em] text-(--color-ap-muted)">
                {t.challengesBlurb}
              </p>
              <div className="flex flex-wrap gap-3">
                <a href="#collection" className={LINK_CLASS}>
                  <span aria-hidden className="text-(--color-ap-gold)">
                    🎨
                  </span>
                  {t.collection}
                </a>
                <a href="#awards" className={LINK_CLASS}>
                  <span aria-hidden className="text-(--color-ap-gold)">
                    🏅
                  </span>
                  {t.awards}
                </a>
              </div>
            </Panel>
          </>
        )}
      </div>
    </main>
  );
}
