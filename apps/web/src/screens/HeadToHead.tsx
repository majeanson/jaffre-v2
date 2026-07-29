import { useEffect, useState } from 'react';
import { AvatarChip, PixelWave, StatPanel, useLang, type Lang } from '@jaffre/ui';
import { fetchHeadToHead, type HeadToHead as H2H } from '../net/history.js';
import { GameRow } from '../components/GameRow.js';
import { MetaHeader } from '../components/MetaHeader.js';
import { ShellNote } from '../components/ShellNote.js';

/**
 * Face to face with one other player: your record beside them, your record
 * across from them, and every game the two of you were in.
 *
 * Reached from Your record — the best-partner and nemesis tiles, and the
 * regulars strip — and nowhere else: it is a detail view of a person the
 * record already named, not a directory you browse. So it carries no MetaNav
 * and its Home button goes back to the record it came from.
 *
 * Everything here is derived server-side from the games you both played
 * (`/api/head2head`). There is no stored social graph in this game, and this
 * screen deliberately doesn't create the appearance of one: no friending, no
 * following, no messaging — just the record.
 */

export interface HeadToHeadProps {
  /** The other player's public id (the `#h2h/<pid>` hash). */
  readonly pid: string;
  readonly onLeave: () => void;
  /** Scene viewer: a staged record so the screen renders without the network. */
  readonly demo?: H2H;
  /** Scene viewer: hold the screen in its loading (pixel-wave) state. */
  readonly demoLoading?: boolean;
}

const T: Record<
  Lang,
  {
    title: string;
    back: string;
    dealing: string;
    error: string;
    unknown: string;
    unknownBody: string;
    together: string;
    against: string;
    record: (wins: number, games: number) => string;
    sharedGames: string;
    sharedCount: (n: number) => string;
    edge: (name: string) => string;
    evenEdge: string;
    yourEdge: string;
  }
> = {
  en: {
    title: 'Head to head',
    back: 'Your record',
    dealing: 'Dealing…',
    error: 'This needs the online server. Play a room game and it will show up here.',
    unknown: 'No shared table',
    unknownBody: "You haven't finished a game with this player yet.",
    together: 'together',
    against: 'across',
    record: (wins, games) => `${String(wins)} won of ${String(games)}`,
    sharedGames: 'Your games together',
    sharedCount: (n) => `${String(n)} game${n === 1 ? '' : 's'} shared`,
    edge: (name) => `${name} has the edge.`,
    evenEdge: 'Dead even.',
    yourEdge: 'You have the edge.',
  },
  fr: {
    title: 'Face à face',
    back: 'Ton record',
    dealing: 'On brasse…',
    error: 'Ça a besoin du serveur en ligne. Joue une partie en salon et ça apparaîtra ici.',
    unknown: 'Jamais à la même table',
    unknownBody: "Tu n'as pas encore terminé de partie avec cette personne.",
    together: 'avec',
    against: 'contre',
    record: (wins, games) => `${String(wins)} gagnée${wins === 1 ? '' : 's'} sur ${String(games)}`,
    sharedGames: 'Vos parties ensemble',
    sharedCount: (n) => `${String(n)} partie${n === 1 ? '' : 's'} en commun`,
    edge: (name) => `${name} a le dessus.`,
    evenEdge: 'Égalité parfaite.',
    yourEdge: 'Tu as le dessus.',
  },
};

type Strings = (typeof T)[Lang];

/**
 * Who is ahead — read from the games you played AGAINST each other only.
 * Games you won side by side say nothing about which of you is better, so
 * folding them in would make every good partner look like a rival you beat.
 */
function edgeLine(data: H2H, t: Strings): string | null {
  const { games, wins } = data.against;
  if (games === 0 || data.name === null) return null;
  const theirs = games - wins;
  if (wins === theirs) return t.evenEdge;
  return wins > theirs ? t.yourEdge : t.edge(data.name);
}

export function HeadToHead({ pid, onLeave, demo, demoLoading = false }: HeadToHeadProps) {
  const t = T[useLang()];
  const [data, setData] = useState<H2H | null>(demo ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (demo !== undefined || demoLoading) return;
    let live = true;
    // A different person: drop the previous record first. The screen stays
    // mounted across a hash change (#h2h/a → #h2h/b), so without this it would
    // show one player's name over another's games until the fetch lands.
    setData(null);
    setError(false);
    fetchHeadToHead(pid)
      .then((d) => live && setData(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [pid, demo, demoLoading]);

  const edge = data === null ? null : edgeLine(data, t);

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.back} onLeave={onLeave} />

        {error ? (
          <ShellNote>{t.error}</ShellNote>
        ) : data === null ? (
          <ShellNote>
            <PixelWave label={t.dealing} />
          </ShellNote>
        ) : data.name === null ? (
          <ShellNote>
            <div className="font-arcade-display text-[1.3em] uppercase text-(--color-ap-ok)">
              {t.unknown}
            </div>
            <p className="mt-[0.5em]">{t.unknownBody}</p>
          </ShellNote>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Who this is: the name, big, with the shared-game count under it. */}
            <section className="flex items-center gap-[0.8em] rounded-(--radius-ap-card) border-[3px] border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap-lg)">
              <AvatarChip name={data.name} color="var(--color-suit-brown)" size="lg" />
              <div className="min-w-0">
                <div
                  data-testid="h2h-name"
                  className="truncate font-arcade-display text-[1.8em] uppercase leading-none text-(--color-ap-text) max-sm:text-[1.4em]"
                >
                  {data.name}
                </div>
                <div className="mt-[0.3em] font-arcade-ui text-[0.8em] tabular-nums text-(--color-ap-muted)">
                  {t.sharedCount(data.together.games + data.against.games)}
                </div>
              </div>
            </section>

            {/* The two records, side by side — the whole point of the screen.
                StatPanel's value is the W–G pair; the label says which side of
                the table it was. */}
            <section className="grid grid-cols-2 gap-4 max-sm:gap-3">
              <StatPanel
                value={`${String(data.together.wins)}/${String(data.together.games)}`}
                label={t.together}
                tone="ok"
                sub={t.record(data.together.wins, data.together.games)}
              />
              <StatPanel
                value={`${String(data.against.wins)}/${String(data.against.games)}`}
                label={t.against}
                tone="violet"
                sub={t.record(data.against.wins, data.against.games)}
              />
            </section>
            {edge !== null && (
              <p
                data-testid="h2h-edge"
                className="font-arcade-ui text-[0.9em] text-(--color-ap-text)/80"
              >
                {edge}
              </p>
            )}

            {/* Every shared game, newest first — each row into its replay, the
                same row the record's own games list uses. */}
            {data.games.length > 0 && (
              <section className="overflow-hidden rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap) [&_:focus-visible]:outline-offset-[-2px]">
                <div className="flex items-center justify-between gap-3 border-b-2 border-(--color-ap-ink) px-[0.9em] py-[0.7em] font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
                  <span>{t.sharedGames}</span>
                  <span className="tabular-nums">{data.games.length}</span>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  {data.games.map((g) => (
                    <GameRow key={g.id} game={g} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
