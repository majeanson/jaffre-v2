import { useEffect, useState } from 'react';
import { PixelWave, useLang, type Lang } from '@jaffre/ui';
import { fetchStats, type Stats } from '../net/history.js';
import { fetchAwards } from '../net/awards.js';
import { AWARDS } from '../awards.js';
import { BONHOMME_SKINS, CARD_SKINS, bonhommeLabel } from '../cosmetics.js';
import { THEMES } from '../theme.js';
import { MetaHeader } from '../components/MetaHeader.js';
import { MetaNav } from '../components/MetaNav.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { ShellNote } from '../components/ShellNote.js';

/** Display label of an award's cosmetic reward, across all three catalogs
 * (bonhommes carry the only localized labels — see bonhommeLabel). */
function rewardLabel(id: string, lang: Lang): string {
  if (BONHOMME_SKINS.some((c) => c.id === id)) return bonhommeLabel(id, lang);
  return CARD_SKINS.find((c) => c.id === id)?.label ?? THEMES.find((c) => c.id === id)?.label ?? id;
}

export interface AwardsProps {
  readonly onLeave: () => void;
  /** Scene viewer: staged data so the screen renders without the network. */
  readonly demoStats?: Stats;
  readonly demoEarned?: readonly string[];
}

const T: Record<
  Lang,
  { title: string; home: string; dealing: string; done: string; unlocks: string }
> = {
  en: {
    title: 'Awards',
    home: 'Home',
    dealing: 'Loading…',
    done: 'Earned',
    unlocks: 'Unlocks',
  },
  fr: {
    title: 'Récompenses',
    home: 'Accueil',
    dealing: 'Chargement…',
    done: 'Obtenu',
    unlocks: 'Débloque',
  },
};

/** The awards showcase — a grid of badge tiles. Earned tiles are lit with the
 * award icon; locked tiles are dimmed with their unlock requirement + a
 * progress bar (mirroring the Collection gallery's locked-tile language). */
export function Awards({ onLeave, demoStats, demoEarned }: AwardsProps) {
  const lang = useLang();
  const t = T[lang];
  const [stats, setStats] = useState<Stats | null>(demoStats ?? null);
  const [earned, setEarned] = useState<ReadonlySet<string> | null>(
    demoEarned !== undefined ? new Set(demoEarned) : null,
  );

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

  const earnedCount = earned === null ? 0 : AWARDS.filter((a) => earned.has(a.id)).length;

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />

        <MetaNav current="awards" />

        {earned === null ? (
          <ShellNote>
            <PixelWave label={t.dealing} />
          </ShellNote>
        ) : (
          <>
            <p className="font-arcade-display text-[0.95em] uppercase tracking-wide text-(--color-ap-muted)">
              {earnedCount}/{AWARDS.length} {t.done}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {AWARDS.map((a) => {
                const has = earned.has(a.id);
                const req = !has && stats !== null ? a.requirement?.(stats, lang) : undefined;
                const pct =
                  req === undefined ? 0 : Math.min(100, Math.round((req.have / req.need) * 100));
                return (
                  <div
                    key={a.id}
                    className={`flex flex-col items-center gap-[0.35em] rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) p-[0.8em] text-center shadow-(--shadow-ap-sm) ${
                      has ? 'bg-(--color-ap-panel)' : 'bg-(--color-ap-panel) opacity-60'
                    }`}
                  >
                    <span
                      className={`text-[2em] leading-none ${has ? '' : 'grayscale'}`}
                      aria-hidden
                    >
                      {a.icon}
                    </span>
                    <span className="font-arcade-display text-[0.85em] uppercase leading-tight text-(--color-ap-text)">
                      {a.name(lang)}
                    </span>
                    <span className="font-arcade-ui text-[0.72em] leading-tight text-(--color-ap-muted)">
                      {a.desc(lang)}
                    </span>
                    {a.reward !== undefined && (
                      <span
                        className={`mt-[0.15em] inline-flex items-center gap-[0.3em] rounded-full border-2 border-(--color-ap-ink) px-[0.55em] py-[0.1em] font-arcade-ui text-[0.62em] font-semibold uppercase tracking-wide ${
                          has
                            ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
                            : 'bg-(--color-ap-ground) text-(--color-ap-muted)'
                        }`}
                      >
                        <span aria-hidden>🎁</span>
                        {t.unlocks}: {rewardLabel(a.reward, lang)}
                      </span>
                    )}
                    {!has && req !== undefined && (
                      <>
                        <ProgressBar pct={pct} className="mt-[0.2em] w-full" />
                        <span className="font-arcade-ui text-[0.68em] text-(--color-ap-muted)">
                          {req.text} · {Math.min(req.have, req.need)}/{req.need}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
