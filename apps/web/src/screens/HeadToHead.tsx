import { useEffect, useState } from 'react';
import { AvatarChip, PixelWave, StatPanel, useLang, type Lang } from '@jaffre/ui';
import { fetchHeadToHead, type HeadToHead as H2H, type SharedGame } from '../net/history.js';
import { AWARDS } from '../awards.js';
import { formatGameDate, GameRow, yourScore } from '../components/GameRow.js';
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
    partnered: string;
    across: string;
    sharedCount: (n: number) => string;
    edge: (name: string) => string;
    evenEdge: string;
    yourEdge: string;
    lastPlayed: (date: string) => string;
    streakYou: (n: number) => string;
    streakThem: (name: string, n: number) => string;
    marginBoth: (name: string, you: number, them: number) => string;
    marginYou: (you: number) => string;
    marginThem: (name: string, them: number) => string;
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
    partnered: 'Partnered',
    across: 'Across the table',
    sharedCount: (n) => `${String(n)} game${n === 1 ? '' : 's'} shared`,
    edge: (name) => `${name} has the edge.`,
    evenEdge: 'Dead even.',
    yourEdge: 'You have the edge.',
    lastPlayed: (date) => `Last played ${date}`,
    streakYou: (n) => `You've won the last ${String(n)}.`,
    streakThem: (name, n) => `${name} has won the last ${String(n)}.`,
    marginBoth: (name, you, them) =>
      `Biggest win: you by ${String(you)}, ${name} by ${String(them)}.`,
    marginYou: (you) => `Biggest win: you by ${String(you)}.`,
    marginThem: (name, them) => `Biggest win: ${name} by ${String(them)}.`,
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
    partnered: 'En équipe',
    across: 'En face',
    sharedCount: (n) => `${String(n)} partie${n === 1 ? '' : 's'} en commun`,
    edge: (name) => `${name} a le dessus.`,
    evenEdge: 'Égalité parfaite.',
    yourEdge: 'Tu as le dessus.',
    lastPlayed: (date) => `Dernière partie : ${date}`,
    streakYou: (n) => `Tu as gagné les ${String(n)} dernières.`,
    streakThem: (name, n) => `${name} a gagné les ${String(n)} dernières.`,
    marginBoth: (name, you, them) =>
      `Plus grosse victoire : toi par ${String(you)}, ${name} par ${String(them)}.`,
    marginYou: (you) => `Plus grosse victoire : toi par ${String(you)}.`,
    marginThem: (name, them) => `Plus grosse victoire : ${name} par ${String(them)}.`,
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

/** "Last played <date>" off the newest shared game — `data.games` is already
 * newest-first (see routes/head2head.ts), so that's simply the first row,
 * with AND against both counting (unlike the edge line above, this is just
 * "when did we last sit together at all"). */
function lastPlayedLine(data: H2H, t: Strings, lang: Lang): string | null {
  const finishedAt = data.games[0]?.finishedAt ?? null;
  return finishedAt === null ? null : t.lastPlayed(formatGameDate(finishedAt, lang));
}

/** Did you win this share game? Mirrors Stats.tsx's `youWon`, narrowed to a
 * SharedGame (same seat/winnerTeam fields). */
function wonGame(game: SharedGame): boolean {
  return game.winnerTeam !== null && game.winnerTeam === game.yourSeat % 2;
}

/**
 * The run of consecutive VS results, newest first, stopping at the first
 * flip (or an undecided game, which is simply skipped rather than breaking
 * the run — a reconciled game with no winner isn't a result either way).
 * Games played TOGETHER say nothing about who's ahead of whom, so — like
 * `edgeLine` — this reads the `against` half only. A run of 1 isn't a
 * streak worth a line; the screen stays quiet until it's at least 2.
 */
function vsStreakLine(data: H2H, t: Strings): string | null {
  const vs = data.games.filter((g) => g.side === 'vs' && g.winnerTeam !== null);
  const first = vs[0];
  if (first === undefined || data.name === null) return null;
  const firstWon = wonGame(first);
  let count = 0;
  for (const g of vs) {
    if (wonGame(g) !== firstWon) break;
    count++;
  }
  if (count < 2) return null;
  return firstWon ? t.streakYou(count) : t.streakThem(data.name, count);
}

/** The biggest final-score margin each of you has taken a VS game by — like
 * the streak, `together` games don't belong: this is a rivalry fact, not a
 * partnership one. Null on a side that has never won across the table. */
function biggestMarginLine(data: H2H, t: Strings): string | null {
  if (data.name === null) return null;
  let you = 0;
  let them = 0;
  for (const g of data.games) {
    if (g.side !== 'vs' || g.winnerTeam === null) continue;
    const [mine, theirs] = yourScore(g);
    const margin = Math.abs(mine - theirs);
    if (wonGame(g)) you = Math.max(you, margin);
    else them = Math.max(them, margin);
  }
  if (you === 0 && them === 0) return null;
  if (you > 0 && them > 0) return t.marginBoth(data.name, you, them);
  return you > 0 ? t.marginYou(you) : t.marginThem(data.name, them);
}

/** One side's games, or nothing at all when you have never sat that way. */
function GameList({
  heading,
  record,
  games,
}: {
  readonly heading: string;
  readonly record: string;
  readonly games: readonly SharedGame[];
}) {
  if (games.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap) [&_:focus-visible]:outline-offset-[-2px]">
      <div className="flex items-center justify-between gap-3 border-b-2 border-(--color-ap-ink) px-[0.9em] py-[0.7em] font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
        <span>{heading}</span>
        <span className="tabular-nums normal-case tracking-normal">{record}</span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        {games.map((g) => (
          <GameRow key={g.id} game={g} />
        ))}
      </div>
    </section>
  );
}

export function HeadToHead({ pid, onLeave, demo, demoLoading = false }: HeadToHeadProps) {
  const lang = useLang();
  const t = T[lang];
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
  const lastPlayed = data === null ? null : lastPlayedLine(data, t, lang);
  const streak = data === null ? null : vsStreakLine(data, t);
  const margin = data === null ? null : biggestMarginLine(data, t);
  const trophy = data === null ? undefined : AWARDS.find((a) => a.id === data.award);

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
            {/* Who this is: the name, big, with the shared-game count under it.
                Real colour+paint when they've set any — the same fields the
                leaderboard and Stats tiles wear — falling back to the shell's
                thematic brown for someone who never painted a card. */}
            <section className="flex items-center gap-[0.8em] rounded-(--radius-ap-card) border-[3px] border-(--color-ap-ink) bg-(--color-ap-panel) p-[1em] shadow-(--shadow-ap-lg)">
              <AvatarChip
                name={data.name}
                color={data.color ?? 'var(--color-suit-brown)'}
                paint={data.paint}
                size="lg"
              />
              <div className="min-w-0 flex-1">
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
              {/* The trophy shelf, finally with a viewer: their showcased
                  award (the first id on their own shelf), when they've
                  arranged one. Absent, not a locked/empty placeholder — a
                  shelf nobody's arranged yet says nothing about them. */}
              {trophy !== undefined && (
                <div
                  data-testid="h2h-trophy"
                  // Gold carries the chip's identity through its border and
                  // tint, never its TEXT: gold-deep on a gold wash fails AA
                  // (axe caught it on the head-to-head scene). Same law as
                  // violet-pairs-with-ink — the label takes the theme's own
                  // text colour so it reads in both skins.
                  className="flex shrink-0 items-center gap-[0.4em] rounded-(--radius-ap-inner) border-2 border-(--color-ap-gold-deep)/60 bg-(--color-ap-gold)/15 px-[0.6em] py-[0.35em] font-arcade-ui text-[0.78em] text-(--color-ap-text)"
                >
                  <span aria-hidden>{trophy.icon}</span>
                  <span className="max-w-[8em] truncate">{trophy.name(lang)}</span>
                </div>
              )}
            </section>

            {/* Three quiet derived facts — last played, the current run
                across the table, and each side's biggest win. Each line
                appears only when it has something to say (a fresh pairing,
                or one still tied, shows none of them). */}
            {(lastPlayed !== null || streak !== null || margin !== null) && (
              <section className="flex flex-col gap-[0.3em] rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[0.9em] font-arcade-ui text-[0.82em] text-(--color-ap-text)/80 shadow-(--shadow-ap-sm)">
                {lastPlayed !== null && <p data-testid="h2h-last-played">{lastPlayed}</p>}
                {streak !== null && <p data-testid="h2h-streak">{streak}</p>}
                {margin !== null && <p data-testid="h2h-margin">{margin}</p>}
              </section>
            )}

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

            {/* Every shared game, newest first, split by which side of the
                table they were on. Two lists rather than one: each row's own
                subtitle already names the whole roster, so on a screen about
                ONE person a single list repeated "with Ginette" on every row
                while never stating the thing that actually differs. The header
                says the side once, and the rows stay the record's own rows. */}
            <GameList
              heading={t.partnered}
              record={t.record(data.together.wins, data.together.games)}
              games={data.games.filter((g) => g.side === 'with')}
            />
            <GameList
              heading={t.across}
              record={t.record(data.against.wins, data.against.games)}
              games={data.games.filter((g) => g.side === 'vs')}
            />
          </div>
        )}
      </div>
    </main>
  );
}
