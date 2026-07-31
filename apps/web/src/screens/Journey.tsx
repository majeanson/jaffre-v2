import { useEffect, useState, type ReactNode } from 'react';
import {
  CardSkinProvider,
  CARD_SKIN_RENDERERS,
  Panel,
  PixelWave,
  PlayingCard,
  useLang,
  type Lang,
} from '@jaffre/ui';
import { MetaHeader } from '../components/MetaHeader.js';
import { ProgressBar } from '../components/ProgressBar.js';
import {
  MAX_LEVEL,
  XP_PER_BID_MADE,
  XP_PER_GAME,
  XP_PER_SA_MADE,
  XP_PER_WIN,
  levelProgress,
  nextTrackReward,
  trackRewardsAt,
  xpBreakdown,
  xpToReach,
  type TrackReward,
} from '../progression.js';
import { trackRewardLabel } from '../trackReward.js';
import { DEFAULT_CARD_SKIN } from '../cosmetics.js';
import { currentTheme } from '../theme.js';
import { fetchStats, type Stats } from '../net/history.js';
import { MetaNav } from '../components/MetaNav.js';

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
    error: string;
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
    felt: string;
    sweep: string;
    equipHint: string;
    breather: string;
    challengesTitle: string;
    challengesBlurb: string;
  }
> = {
  en: {
    title: 'Journey',
    home: 'Home',
    dealing: 'Loading…',
    error: 'The Journey needs the online server. Try again shortly.',
    level: 'Level',
    maxLevel: 'Max level',
    xp: (into, span) => `${String(into)} / ${String(span)} XP to next level`,
    totalXp: (xp) => `${String(xp)} XP total`,
    nextReward: (label, level) => `Next reward: ${label} at level ${String(level)}`,
    trackDone: 'Track complete — every level reward is yours.',
    howTitle: 'How you earn XP',
    // Online-qualified: practice games run through the same engine but never
    // touch /api/stats, so they earn no XP at all — saying otherwise here
    // would promise a bar that never moves (see Overlays.tsx's showXp).
    howBlurb:
      "Every game you finish online moves you forward — practice doesn't earn XP. Wins and made bids move you faster.",
    perGame: 'per game played',
    perWin: 'per win',
    perBid: 'per made bid',
    perSa: 'per made sans-atout',
    trackTitle: 'The track',
    levelShort: (n) => `Lv ${String(n)}`,
    xpShort: (n) => `${String(n)} XP`,
    skin: 'Card skin',
    theme: 'Theme',
    felt: 'Felt',
    sweep: 'Trick sweep',
    equipHint: 'Unlocked — tap to equip',
    breather: 'Breather level',
    challengesTitle: 'Beyond the track',
    challengesBlurb:
      'Challenge skins and themes — streaks, win rate, sans-atout, your nemesis — unlock from how you play, not how much. Find them in the Collection and next to their Awards.',
  },
  fr: {
    title: 'Parcours',
    home: 'Accueil',
    dealing: 'Chargement…',
    error: 'Le Parcours a besoin du serveur en ligne. Réessaie bientôt.',
    level: 'Niveau',
    maxLevel: 'Niveau max',
    xp: (into, span) => `${String(into)} / ${String(span)} XP vers le prochain niveau`,
    totalXp: (xp) => `${String(xp)} XP au total`,
    nextReward: (label, level) => `Prochaine récompense : ${label} au niveau ${String(level)}`,
    trackDone: 'Parcours terminé — toutes les récompenses de niveau sont à toi.',
    howTitle: 'Comment gagner des XP',
    howBlurb:
      'Chaque partie terminée en ligne te fait avancer — la pratique ne rapporte pas de XP. Les victoires et les mises réussies, encore plus.',
    perGame: 'par partie jouée',
    perWin: 'par victoire',
    perBid: 'par mise réussie',
    perSa: 'par sans-atout réussi',
    trackTitle: 'Le parcours',
    levelShort: (n) => `Niv ${String(n)}`,
    xpShort: (n) => `${String(n)} XP`,
    skin: 'Habillage',
    theme: 'Thème',
    felt: 'Tapis',
    sweep: 'Ramassage',
    equipHint: 'Débloqué — touche pour équiper',
    breather: 'Pas de récompense',
    challengesTitle: 'Au-delà du parcours',
    challengesBlurb:
      'Les habillages et thèmes défis — séquences, taux de victoires, sans-atout, ta némésis — se débloquent selon ta façon de jouer, pas selon le nombre de parties. Ils sont dans la Collection et à côté de leur récompense.',
  },
};

const labelOf = trackRewardLabel;

/** Every reward row is the same shape whether it links or not — an unearned
 * reward must not collapse to a narrower/taller box than an earned one, or a
 * two-reward rung stops reading as one level with two prizes. */
const REWARD_ROW = 'flex w-full min-w-0 items-center gap-[0.6em] rounded-(--radius-ap-inner)';

/**
 * The reward half of a track rung. Once earned it becomes a link into the
 * Collection focused on that cosmetic — the Journey tells you what you got,
 * and this is how you go and wear it. Before that it is an inert row: a link
 * to something you cannot equip yet would be a dead end. It stays a ROW either
 * way — returning a bare fragment let the preview and the name stack vertically
 * inside the rung's reward column, which is what made unearned levels (and
 * every double-reward level) tower.
 */
function RewardSlot({
  cosmeticId,
  linked,
  equipLabel,
  children,
}: {
  readonly cosmeticId: string;
  readonly linked: boolean;
  readonly equipLabel: string;
  readonly children: ReactNode;
}) {
  if (!linked) return <div className={REWARD_ROW}>{children}</div>;
  return (
    <a
      href={`#collection/${cosmeticId}`}
      aria-label={equipLabel}
      className={`${REWARD_ROW} hover:bg-(--color-ap-panel-hover)`}
    >
      {children}
    </a>
  );
}

/** A skin reward previews as its face-DOWN card — the back is the star here
 * (it's what the whole table sees of your deck all game long). Scaled into the
 * shared preview-slot footprint so a card-skin rung is the same height as a
 * theme rung (an sm card is ~1.5× the swatch otherwise). */
function SkinBackPreview({ id }: { readonly id: string }) {
  // Same rule as the Collection tiles: the default skin's cards are the
  // THEME's cards, so name the theme rather than emitting nothing and
  // inheriting whatever is equipped.
  const attrs =
    id === DEFAULT_CARD_SKIN ? { 'data-theme': currentTheme() } : { 'data-card-skin': id };
  return (
    <div {...attrs} className="scale-[0.62]">
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

/** A felt reward previews as a bare colour swatch — the felt's own palette
 * (`--color-felt-800`), scoped with `data-felt`. No cards, no oval shape: this
 * is a rung in a list, not the Collection gallery, and the swatch only has to
 * say "this is the surface", which the colour alone already does. */
function FeltSwatch({ id }: { readonly id: string }) {
  return (
    <div
      data-felt={id}
      className="size-[2em] shrink-0 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink)"
      style={{ background: 'var(--color-felt-800)' }}
    />
  );
}

/** A sweep reward previews as speed lines, not a motion preview — a rung is a
 * still list, and the Collection gallery is where a sweep gets its real looping
 * demonstration (SweepPreview). It used to print the sweep's NAME in this chip:
 * long ones ("Dealer's Fold") spilled straight out of the fixed slot, and the
 * row already names the reward an inch to the right. A mark that says "this one
 * is an animation" is all the slot owes; equipping it is one tap away. */
function SweepMark() {
  return (
    <span className="flex h-[2.6em] w-[3.4em] shrink-0 items-center justify-center gap-[0.22em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground)">
      {[0.35, 0.6, 1].map((opacity) => (
        <span
          key={opacity}
          className="h-[1em] w-[0.28em] -skew-x-12 rounded-[1px] bg-(--color-ap-violet-soft)"
          style={{ opacity }}
        />
      ))}
    </span>
  );
}

/** Every reward kind drawn into ONE footprint, so a rung's height never depends
 * on whether its prize is a card back, a swatch or a sweep — and so the hero's
 * "next reward" line can show the very same picture the rung will. */
function RewardPreview({ reward }: { readonly reward: TrackReward }) {
  return (
    <span className="flex h-[2.8em] w-[3.4em] shrink-0 items-center justify-center">
      {reward.kind === 'skin' ? (
        <SkinBackPreview id={reward.cosmeticId} />
      ) : reward.kind === 'theme' ? (
        <ThemeSwatch id={reward.cosmeticId} />
      ) : reward.kind === 'felt' ? (
        <FeltSwatch id={reward.cosmeticId} />
      ) : (
        <SweepMark />
      )}
    </span>
  );
}

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

  const breakdown = stats === null ? null : xpBreakdown(stats);
  const progress = breakdown === null ? null : levelProgress(breakdown.total);
  const nextReward = progress === null ? null : nextTrackReward(progress.level);
  const pct =
    progress === null ? 0 : progress.span === 0 ? 100 : (progress.into / progress.span) * 100;

  const xpSources: readonly (readonly [number, string])[] = [
    [XP_PER_GAME, t.perGame],
    [XP_PER_WIN, t.perWin],
    [XP_PER_BID_MADE, t.perBid],
    [XP_PER_SA_MADE, t.perSa],
  ];

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />

        <MetaNav current="journey" />

        {error ? (
          <Panel className="p-[1.2em] text-center font-arcade-ui text-(--color-ap-muted)">
            {t.error}
          </Panel>
        ) : progress === null ? (
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
              <ProgressBar pct={pct} />
              <p className="font-arcade-ui text-[0.78em] tabular-nums text-(--color-ap-muted)">
                {progress.level >= MAX_LEVEL ? t.maxLevel : t.xp(progress.into, progress.span)}
              </p>
              {/* What you're playing towards, with the prize's own picture —
                  the same preview the rung below will show, so the callout and
                  the track can never describe the reward differently. */}
              {nextReward !== null ? (
                <div className="flex items-center gap-[0.6em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-[0.5em]">
                  <RewardPreview reward={nextReward} />
                  <p className="min-w-0 font-arcade-ui text-[0.85em] text-(--color-ap-text)">
                    {t.nextReward(labelOf(nextReward), nextReward.level)}
                  </p>
                </div>
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
                  // Usually one reward; a felt or sweep rung can share a level
                  // with a skin/theme rung (see LEVEL_TRACK in progression.ts).
                  const rewards = trackRewardsAt(level);
                  const done = progress.level >= level;
                  const isNext = nextReward !== null && nextReward.level === level;
                  return (
                    <li
                      key={level}
                      data-testid={`journey-rung-${String(level)}`}
                      className={`flex items-center gap-[0.7em] rounded-(--radius-ap-card) border-2 bg-(--color-ap-panel) p-[0.6em] shadow-(--shadow-ap-sm) ${
                        isNext ? 'border-(--color-ap-violet)' : 'border-(--color-ap-ink)'
                      } ${done || isNext ? '' : 'opacity-60'}`}
                    >
                      {/* Milestone marker: the level and the XP it costs, one
                          under the other. Stacked rather than two columns so a
                          two-reward level reads as ONE rung with two prizes —
                          side by side, the XP number floated in dead space
                          beside the taller reward column. */}
                      <span className="flex w-[3.2em] shrink-0 flex-col items-center gap-[0.3em]">
                        <span
                          // leading fits TWO lines: "Lv 12"/"Niv 12" wraps in
                          // the square, and leading-none clipped the digits'
                          // bottom row (2nd visual sweep, "LV" + digit slivers).
                          // Violet fills the NEXT rung's chip — violet always
                          // pairs with ink text (violetInk.test.ts).
                          className={`grid size-[2.4em] shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) text-center font-arcade-display text-[0.72em] leading-[1.15] ${
                            done
                              ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
                              : isNext
                                ? 'bg-(--color-ap-violet) text-(--color-ap-ink)'
                                : 'bg-(--color-ap-ground) text-(--color-ap-text)'
                          }`}
                        >
                          {t.levelShort(level)}
                        </span>
                        <span className="whitespace-nowrap font-arcade-ui text-[0.6em] leading-none tabular-nums text-(--color-ap-muted)">
                          {t.xpShort(xpToReach(level))}
                        </span>
                      </span>
                      {rewards.length > 0 ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-[0.5em] [&>*+*]:border-t-2 [&>*+*]:border-(--color-ap-ink)/25 [&>*+*]:pt-[0.5em]">
                          {rewards.map((reward) => (
                            /* An EARNED reward is a door, not a picture:
                               tapping it opens the Collection on that exact
                               tile so it can be equipped. Unearned rungs stay
                               inert — there is nothing to go and do with them
                               yet. */
                            <RewardSlot
                              key={reward.cosmeticId}
                              cosmeticId={reward.cosmeticId}
                              linked={done}
                              equipLabel={t.equipHint}
                            >
                              <RewardPreview reward={reward} />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate font-arcade-display text-[0.85em] uppercase text-(--color-ap-text)">
                                  {labelOf(reward)}
                                </span>
                                {/* The kind ALONE — "Theme", "Felt". The equip
                                    hint used to ride along here and wrapped to
                                    two lines on a phone (French especially),
                                    doubling every earned row's height to repeat
                                    what the chevron and the link's aria-label
                                    already say. */}
                                <span className="font-arcade-ui text-[0.68em] uppercase tracking-wide text-(--color-ap-muted)">
                                  {reward.kind === 'skin'
                                    ? t.skin
                                    : reward.kind === 'theme'
                                      ? t.theme
                                      : reward.kind === 'felt'
                                        ? t.felt
                                        : t.sweep}
                                </span>
                              </span>
                              {done && (
                                <span
                                  aria-hidden
                                  className="shrink-0 px-[0.2em] font-arcade-ui text-[1.15em] leading-none text-(--color-ap-violet-soft)"
                                >
                                  ›
                                </span>
                              )}
                            </RewardSlot>
                          ))}
                        </div>
                      ) : (
                        /* Breather: no preview slot to fill, so the line simply
                           starts where a reward's picture would. */
                        <span className="flex min-w-0 flex-1 items-center font-arcade-ui text-[0.72em] text-(--color-ap-muted)">
                          {t.breather}
                        </span>
                      )}
                      {/* No trailing ✓ on the rung: an earned level already
                          reads as earned twice over — a GOLD level chip and
                          full opacity — and a third mark landed right beside
                          each reward's own chevron. */}
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
            </Panel>
          </>
        )}
      </div>
    </main>
  );
}
