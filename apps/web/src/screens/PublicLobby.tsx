import { useEffect, useState } from 'react';
import { Cta, PixelWave, useLang, type Lang } from '@jaffre/ui';
import { quickPlay, watchPublicRooms, type PublicRoom } from '../net/rooms.js';

export interface PublicLobbyProps {
  readonly onLeave: () => void;
  /** Navigate into a room (sets the hash). */
  readonly onJoin: (code: string) => void;
  /** Scene viewer: staged rooms so the screen renders without the network. */
  readonly demoRooms?: readonly PublicRoom[];
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    loading: string;
    empty: string;
    quickPlay: string;
    live: string;
    join: string;
    watch: string;
    watchHint: string;
    full: string;
    seats: (n: number, cap: number) => string;
    playing: (n: number, cap: number) => string;
  }
> = {
  en: {
    title: 'Public tables',
    home: 'Home',
    loading: 'Finding tables…',
    empty: 'No open tables right now. Quick Play starts one for you.',
    quickPlay: 'Quick Play',
    live: 'Live list',
    join: 'Join',
    watch: 'Watch',
    watchHint: 'Game in progress — join as a spectator',
    full: 'Full',
    seats: (n, cap) => `${String(n)}/${String(cap)} seated`,
    playing: (n, cap) => `${String(n)}/${String(cap)} playing`,
  },
  fr: {
    title: 'Tables publiques',
    home: 'Accueil',
    loading: 'Recherche de tables…',
    empty: 'Aucune table ouverte. Partie rapide en crée une pour toi.',
    quickPlay: 'Partie rapide',
    live: 'Liste en direct',
    join: 'Rejoindre',
    watch: 'Regarder',
    watchHint: 'Partie en cours — regarde en spectateur',
    full: 'Complète',
    seats: (n, cap) => `${String(n)}/${String(cap)} assis`,
    playing: (n, cap) => `${String(n)}/${String(cap)} en jeu`,
  },
};

const SHELL_NOTE =
  'rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1.2em] text-center font-arcade-ui text-(--color-ap-muted) shadow-(--shadow-ap)';

/** Browse open public tables (or Quick Play into one). The list is LIVE — a
 * WebSocket to the Lobby DO pushes it on connect and on every change, so
 * seats fill and tables appear/vanish in front of you with no polling and no
 * refresh button. Join sets the room hash; the connect + seat flow is the
 * same as a code join. */
export function PublicLobby({ onLeave, onJoin, demoRooms }: PublicLobbyProps) {
  const t = T[useLang()];
  const [rooms, setRooms] = useState<readonly PublicRoom[] | null>(demoRooms ?? null);

  useEffect(() => {
    if (demoRooms !== undefined) return;
    return watchPublicRooms(setRooms);
  }, [demoRooms]);

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-arcade-display text-[2.2em] uppercase leading-none text-(--color-ap-gold)">
            {t.title}
          </h1>
          <Cta variant="secondary" onClick={onLeave}>
            {t.home}
          </Cta>
        </header>

        {/* Live badge — the list updates itself; there's nothing to refresh. */}
        <p className="flex items-center gap-2 font-arcade-ui text-[0.8em] text-(--color-ap-muted)">
          <span
            aria-hidden
            className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-(--color-suit-green)"
          />
          {t.live}
        </p>

        {/* Empty-state copy points at Quick Play, so it must render ABOVE the
            button it references — the pointer precedes the CTA. */}
        {rooms === null ? (
          <div className={SHELL_NOTE}>
            <PixelWave label={t.loading} />
          </div>
        ) : rooms.length === 0 ? (
          <p className={SHELL_NOTE}>{t.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rooms.map((r) => {
              const playing = r.phase === 'playing';
              const full = !playing && r.players >= r.capacity;
              return (
                <li
                  key={r.code}
                  title={playing ? t.watchHint : undefined}
                  className="flex items-center gap-3 rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.9em] py-[0.6em] shadow-(--shadow-ap-sm)"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="block truncate font-arcade-display text-[0.95em] uppercase text-(--color-ap-text)">
                        {r.host}
                      </span>
                      {playing && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-(--color-suit-red) bg-(--color-ap-ground) px-[0.5em] py-[0.1em] font-arcade-ui text-[0.6em] uppercase text-(--color-suit-red)">
                          <span
                            aria-hidden
                            className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-(--color-suit-red)"
                          />
                          LIVE
                        </span>
                      )}
                    </span>
                    <span className="block font-arcade-ui text-[0.75em] text-(--color-ap-muted)">
                      {r.code} ·{' '}
                      {playing ? t.playing(r.players, r.capacity) : t.seats(r.players, r.capacity)}
                    </span>
                  </span>
                  {/* aria-label must START with the visible text (WCAG 2.5.3
                      Label in Name) — the hint rides after it, never replaces it. */}
                  <Cta
                    disabled={full}
                    onClick={() => onJoin(r.code)}
                    aria-label={playing ? `${t.watch} — ${t.watchHint}` : undefined}
                  >
                    {full ? t.full : playing ? t.watch : t.join}
                  </Cta>
                </li>
              );
            })}
          </ul>
        )}

        <Cta
          onClick={() => {
            void quickPlay().then(onJoin);
          }}
        >
          {t.quickPlay}
        </Cta>
      </div>
    </main>
  );
}
