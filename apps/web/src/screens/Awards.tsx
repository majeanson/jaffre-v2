import { useEffect, useMemo, useState } from 'react';
import { PixelWave, useLang, type Lang } from '@jaffre/ui';
import { fetchStats, type Stats } from '../net/history.js';
import { fetchAwards } from '../net/awards.js';
import { getProfile, saveProfile } from '../net/auth.js';
import { AWARDS } from '../awards.js';
import { arrangeIds, moveWithin } from '../awardShelf.js';
import { BONHOMME_SKINS, CARD_SKINS, bonhommeLabel } from '../cosmetics.js';
import { FELTS } from '../felt.js';
import { SWEEPS } from '../sweeps.js';
import { THEMES } from '../theme.js';
import { feedback } from '../audio/clicks.js';
import { MetaHeader } from '../components/MetaHeader.js';
import { MetaNav } from '../components/MetaNav.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { ShellNote } from '../components/ShellNote.js';

/** Display label of an award's cosmetic reward, across every catalog
 * (bonhommes carry the only localized labels — see bonhommeLabel). */
function rewardLabel(id: string, lang: Lang): string {
  if (BONHOMME_SKINS.some((c) => c.id === id)) return bonhommeLabel(id, lang);
  return (
    CARD_SKINS.find((c) => c.id === id)?.label ??
    THEMES.find((c) => c.id === id)?.label ??
    FELTS.find((c) => c.id === id)?.label ??
    SWEEPS.find((c) => c.id === id)?.label ??
    id
  );
}

export interface AwardsProps {
  readonly onLeave: () => void;
  /** Scene viewer: staged data so the screen renders without the network. */
  readonly demoStats?: Stats;
  readonly demoEarned?: readonly string[];
  /** Scene viewer: open the shelf in arrange mode. */
  readonly demoArranging?: boolean;
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    dealing: string;
    done: string;
    unlocks: string;
    shelfLabel: string;
    caseLabel: string;
    arrange: string;
    arrangeDone: string;
    moveLeft: (name: string) => string;
    moveRight: (name: string) => string;
    reset: string;
    emptyShelf: string;
    arrangeHint: string;
  }
> = {
  en: {
    title: 'Awards',
    home: 'Home',
    dealing: 'Loading…',
    done: 'Earned',
    unlocks: 'Unlocks',
    shelfLabel: 'Your shelf',
    caseLabel: 'Still in the case',
    arrange: 'Arrange',
    arrangeDone: 'Done',
    moveLeft: (name) => `Move ${name} left`,
    moveRight: (name) => `Move ${name} right`,
    reset: 'Reset order',
    emptyShelf: 'Nothing on the shelf yet — win something and it lands here.',
    arrangeHint: 'Put your best piece where people look first.',
  },
  fr: {
    title: 'Récompenses',
    home: 'Accueil',
    dealing: 'Chargement…',
    done: 'Obtenu',
    unlocks: 'Débloque',
    shelfLabel: 'Ta tablette',
    caseLabel: 'Encore dans la vitrine',
    arrange: 'Arranger',
    arrangeDone: 'Terminé',
    moveLeft: (name) => `Déplacer ${name} vers la gauche`,
    moveRight: (name) => `Déplacer ${name} vers la droite`,
    reset: 'Ordre d’origine',
    emptyShelf: 'Encore rien sur la tablette — gagne quelque chose et ça va atterrir ici.',
    arrangeHint: 'Mets ta plus belle pièce là où le monde regarde en premier.',
  },
};

type Strings = (typeof T)[Lang];

/** One trophy standing on the shelf: the object, its name, and its reward tag. */
function Trophy({
  icon,
  name,
  reward,
}: {
  readonly icon: string;
  readonly name: string;
  readonly reward: { readonly id: string; readonly label: string } | null;
}) {
  return (
    <span className="flex w-full flex-1 flex-col items-center gap-[0.25em] text-center">
      {/* The object itself, lifted on a plinth so it reads as standing ON the
          ledge rather than floating in a tile. */}
      <span
        aria-hidden
        className="flex h-[2.4em] w-full items-end justify-center text-[2em] leading-none drop-shadow-[2px_2px_0_var(--color-ap-ink)]"
      >
        {icon}
      </span>
      <span className="font-arcade-display text-[0.72em] uppercase leading-tight text-(--color-ap-text)">
        {name}
      </span>
      {reward !== null && (
        /* An earned award's reward is a door too — same destination as the
           Journey rungs, so "you unlocked X" always leads to X. */
        <a
          href={`#collection/${reward.id}`}
          className="font-arcade-ui text-[0.6em] leading-tight text-(--color-ap-gold) underline"
        >
          {reward.label}
        </a>
      )}
    </span>
  );
}

/** A wooden ledge the trophies stand on — the thing that makes it a shelf and
 * not a grid. Purely decorative, hence aria-hidden. */
function Ledge() {
  return (
    <span
      aria-hidden
      className="mt-[0.35em] block h-[0.5em] w-full rounded-[3px] border-2 border-(--color-ap-ink) bg-(--color-felt-800) shadow-(--shadow-ap-sm)"
    />
  );
}

/**
 * The trophy shelf. Earned awards stand as objects on wooden ledges, in an
 * order the player controls; unearned ones wait below in the case as ghosted
 * silhouettes with their progress.
 *
 * Reordering is move-left/move-right buttons rather than drag-and-drop, on
 * purpose: this screen is read on a phone more than anywhere else, and drag is
 * the one interaction that works badly with a thumb, a screen reader and a
 * keyboard all at once. Buttons are boring and work for all three.
 */
export function Awards({ onLeave, demoStats, demoEarned, demoArranging }: AwardsProps) {
  const lang = useLang();
  const t = T[lang];
  const [stats, setStats] = useState<Stats | null>(demoStats ?? null);
  const [earned, setEarned] = useState<ReadonlySet<string> | null>(
    demoEarned !== undefined ? new Set(demoEarned) : null,
  );
  const [order, setOrder] = useState<readonly string[] | null>(() => getProfile().awardOrder);
  const [arranging, setArranging] = useState(demoArranging ?? false);

  useEffect(() => {
    if (demoStats !== undefined) return;
    let live = true;
    fetchStats()
      .then((s) => live && setStats(s))
      .catch(() => live && setStats(null));
    fetchAwards()
      .then((a) => live && setEarned(new Set(a.map((x) => x.id))))
      .catch(() => live && setEarned(new Set()));
    return () => {
      live = false;
    };
  }, [demoStats]);

  const earnedIds = useMemo(
    () => (earned === null ? [] : AWARDS.filter((a) => earned.has(a.id)).map((a) => a.id)),
    [earned],
  );
  const shelf = useMemo(() => arrangeIds(earnedIds, order), [earnedIds, order]);
  const lockedAwards = earned === null ? [] : AWARDS.filter((a) => !earned.has(a.id));

  const persist = (next: readonly string[] | null) => {
    setOrder(next);
    void saveProfile({ awardOrder: next });
  };

  const move = (index: number, delta: number) => {
    feedback('select');
    persist(moveWithin(shelf, index, delta));
  };

  const byId = (id: string) => AWARDS.find((a) => a.id === id);

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />

        <MetaNav current="awards" />

        {earned === null ? (
          <ShellNote>
            <PixelWave label={t.dealing} />
          </ShellNote>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-arcade-display text-[0.95em] uppercase tracking-wide text-(--color-ap-muted)">
                {earnedIds.length}/{AWARDS.length} {t.done}
              </p>
              {shelf.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    feedback('select');
                    setArranging((a) => !a);
                  }}
                  className="rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.7em] py-[0.2em] font-arcade-ui text-[0.75em] uppercase tracking-wide shadow-(--shadow-ap-sm)"
                >
                  {arranging ? t.arrangeDone : t.arrange}
                </button>
              )}
            </div>

            {/* ── The shelf ─────────────────────────────────────────────── */}
            <section
              aria-label={t.shelfLabel}
              className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap)"
            >
              {shelf.length === 0 ? (
                <p className="font-arcade-ui text-[0.85em] text-(--color-ap-muted)">
                  {t.emptyShelf}
                </p>
              ) : (
                <>
                  {arranging && (
                    <p className="mb-[0.7em] font-arcade-ui text-[0.75em] text-(--color-ap-muted)">
                      {t.arrangeHint}
                    </p>
                  )}
                  <ul className="grid grid-cols-3 gap-x-3 gap-y-[1.4em] max-sm:grid-cols-2">
                    {shelf.map((id, i) => {
                      const award = byId(id);
                      if (award === undefined) return null;
                      const name = award.name(lang);
                      return (
                        /* The trophy block GROWS and the ledge is pushed to a
                           common bottom: without that, a trophy carrying a
                           reward line is taller than its neighbours and its
                           ledge sits lower — a shelf whose plank is at two
                           heights in the same row, which is exactly the
                           illusion the ledge exists to create. */
                        <li key={id} className="flex flex-col">
                          <Trophy
                            icon={award.icon}
                            name={name}
                            reward={
                              award.reward === undefined
                                ? null
                                : { id: award.reward, label: rewardLabel(award.reward, lang) }
                            }
                          />
                          <Ledge />
                          {arranging && (
                            <span className="mt-[0.35em] flex items-center justify-center gap-[0.4em]">
                              <button
                                type="button"
                                aria-label={t.moveLeft(name)}
                                disabled={i === 0}
                                onClick={() => move(i, -1)}
                                className="rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-[0.5em] font-arcade-ui text-[0.8em] disabled:opacity-40"
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                aria-label={t.moveRight(name)}
                                disabled={i === shelf.length - 1}
                                onClick={() => move(i, 1)}
                                className="rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-[0.5em] font-arcade-ui text-[0.8em] disabled:opacity-40"
                              >
                                →
                              </button>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {arranging && order !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        feedback('select');
                        persist(null);
                      }}
                      className="mt-[1em] font-arcade-ui text-[0.75em] uppercase tracking-wide text-(--color-ap-muted) underline"
                    >
                      {t.reset}
                    </button>
                  )}
                </>
              )}
            </section>

            {/* ── Still in the case: the ones you haven't earned ─────────── */}
            {lockedAwards.length > 0 && (
              <section aria-label={t.caseLabel} className="flex flex-col gap-2">
                <h2 className="font-arcade-display text-[0.8em] uppercase tracking-wide text-(--color-ap-muted)">
                  {t.caseLabel}
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {lockedAwards.map((a) => {
                    const req = stats !== null ? a.requirement?.(stats, lang) : undefined;
                    const pct =
                      req === undefined
                        ? 0
                        : Math.min(100, Math.round((req.have / req.need) * 100));
                    return (
                      <li
                        key={a.id}
                        /* Locked = ground fill + dimmed icon only: a whole-tile
                           opacity took the requirement text below AA contrast. */
                        className="flex flex-col items-center gap-[0.35em] rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) p-[0.8em] text-center shadow-(--shadow-ap-sm)"
                      >
                        <span
                          className="text-[1.7em] leading-none opacity-40 grayscale"
                          aria-hidden
                        >
                          {a.icon}
                        </span>
                        <span className="font-arcade-display text-[0.8em] uppercase leading-tight text-(--color-ap-text)">
                          {a.name(lang)}
                        </span>
                        <span className="font-arcade-ui text-[0.7em] leading-tight text-(--color-ap-muted)">
                          {a.desc(lang)}
                        </span>
                        {a.reward !== undefined && (
                          <span className="mt-[0.15em] inline-flex items-center gap-[0.3em] rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-[0.55em] py-[0.1em] font-arcade-ui text-[0.62em] font-semibold uppercase tracking-wide text-(--color-ap-muted)">
                            <span aria-hidden>🎁</span>
                            {t.unlocks}: {rewardLabel(a.reward, lang)}
                          </span>
                        )}
                        {req !== undefined && (
                          <>
                            <ProgressBar pct={pct} className="mt-[0.2em] w-full" />
                            <span className="font-arcade-ui text-[0.68em] text-(--color-ap-muted)">
                              {req.text} · {Math.min(req.have, req.need)}/{req.need}
                            </span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export type { Strings as AwardsStrings };
