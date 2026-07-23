import { useEffect, useState } from 'react';
import { AvatarChip, Cta, PixelWave, useLang, type Lang } from '@jaffre/ui';
import { fetchStats, type Stats } from '../net/history.js';
import { fetchAwards } from '../net/awards.js';
import { AWARDS } from '../awards.js';
import { getProfile } from '../net/auth.js';
import { playerName } from '../net/socket.js';

export interface AwardsProps {
  readonly onLeave: () => void;
  /** Scene viewer: staged data so the screen renders without the network. */
  readonly demoStats?: Stats;
  readonly demoEarned?: readonly string[];
}

const T: Record<Lang, { title: string; home: string; dealing: string; done: string }> = {
  en: { title: 'Awards', home: 'Home', dealing: 'Loading…', done: 'Earned' },
  fr: { title: 'Récompenses', home: 'Accueil', dealing: 'Chargement…', done: 'Obtenu' },
};

const SHELL_NOTE =
  'rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1.2em] text-center font-arcade-ui text-(--color-ap-muted) shadow-(--shadow-ap)';

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

        {earned === null ? (
          <div className={SHELL_NOTE}>
            <PixelWave label={t.dealing} />
          </div>
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
                    {!has && req !== undefined && (
                      <>
                        <div className="mt-[0.2em] h-[0.4em] w-full overflow-hidden rounded-full bg-(--color-ap-ink)/20">
                          <div
                            className="h-full bg-(--color-ap-violet)"
                            style={{ width: `${String(pct)}%` }}
                          />
                        </div>
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
