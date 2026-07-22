import { useCallback, useEffect, useState } from 'react';
import { Cta, PixelWave, useLang, type Lang } from '@jaffre/ui';
import { fetchPublicRooms, quickPlay, type PublicRoom } from '../net/rooms.js';

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
    refresh: string;
    join: string;
    seats: (n: number, cap: number) => string;
  }
> = {
  en: {
    title: 'Public tables',
    home: 'Home',
    loading: 'Finding tables…',
    empty: 'No open tables right now. Quick Play starts one for you.',
    quickPlay: 'Quick Play',
    refresh: 'Refresh',
    join: 'Join',
    seats: (n, cap) => `${String(n)}/${String(cap)} seated`,
  },
  fr: {
    title: 'Tables publiques',
    home: 'Accueil',
    loading: 'Recherche de tables…',
    empty: 'Aucune table ouverte. Partie rapide en crée une pour toi.',
    quickPlay: 'Partie rapide',
    refresh: 'Rafraîchir',
    join: 'Rejoindre',
    seats: (n, cap) => `${String(n)}/${String(cap)} assis`,
  },
};

const SHELL_NOTE =
  'rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[1.2em] text-center font-arcade-ui text-(--color-ap-muted) shadow-(--shadow-ap)';

/** Browse open public tables (or Quick Play into one). Join sets the room hash;
 * the connect + seat flow is the same as a code join. */
export function PublicLobby({ onLeave, onJoin, demoRooms }: PublicLobbyProps) {
  const t = T[useLang()];
  const [rooms, setRooms] = useState<readonly PublicRoom[] | null>(demoRooms ?? null);

  const refresh = useCallback(() => {
    if (demoRooms !== undefined) return;
    let live = true;
    setRooms(null);
    fetchPublicRooms()
      .then((r) => live && setRooms(r))
      .catch(() => live && setRooms([]));
    return () => {
      live = false;
    };
  }, [demoRooms]);

  useEffect(() => refresh(), [refresh]);

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-arcade-display text-[2.2em] uppercase leading-none text-(--color-ap-gold)">
            {t.title}
          </h1>
          <Cta variant="secondary" onClick={onLeave}>
            {t.home}
          </Cta>
        </header>

        <div className="flex flex-wrap gap-2">
          <Cta
            className="flex-1"
            onClick={() => {
              void quickPlay().then(onJoin);
            }}
          >
            {t.quickPlay}
          </Cta>
          <Cta variant="secondary" onClick={refresh}>
            {t.refresh}
          </Cta>
        </div>

        {rooms === null ? (
          <div className={SHELL_NOTE}>
            <PixelWave label={t.loading} />
          </div>
        ) : rooms.length === 0 ? (
          <p className={SHELL_NOTE}>{t.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rooms.map((r) => (
              <li
                key={r.code}
                className="flex items-center gap-3 rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.9em] py-[0.6em] shadow-(--shadow-ap-sm)"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-arcade-display text-[0.95em] uppercase text-(--color-ap-text)">
                    {r.host}
                  </span>
                  <span className="block font-arcade-ui text-[0.75em] text-(--color-ap-muted)">
                    {r.code} · {t.seats(r.players, r.capacity)}
                  </span>
                </span>
                <Cta onClick={() => onJoin(r.code)}>{t.join}</Cta>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
