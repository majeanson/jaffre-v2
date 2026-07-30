import { useLang, type Lang } from '@jaffre/ui';
import type { HistoryGame } from '../net/history.js';

/**
 * One finished game as a link into its replay.
 *
 * Lives here rather than inside Your record because two screens list the same
 * games: the record's "All" view, and the head-to-head view's shared games. A
 * row that looked different in the two places would read as a different kind
 * of thing — it isn't.
 */

const T: Record<
  Lang,
  {
    won: string;
    lost: string;
    room: (code: string) => string;
    seat: (n: number) => string;
    withMate: (name: string) => string;
    vsThem: (names: string) => string;
    chipHailMary: string;
    chipComeback: string;
    chipSweep: string;
  }
> = {
  en: {
    won: 'Won',
    lost: 'Lost',
    room: (code) => `Room ${code}`,
    seat: (n) => `seat ${String(n)}`,
    withMate: (name) => `with ${name}`,
    vsThem: (names) => `vs ${names}`,
    chipHailMary: '12 SA!',
    chipComeback: 'Comeback',
    chipSweep: 'Sweep',
  },
  fr: {
    won: 'Gagnée',
    lost: 'Perdue',
    room: (code) => `Salon ${code}`,
    seat: (n) => `siège ${String(n)}`,
    withMate: (name) => `avec ${name}`,
    vsThem: (names) => `contre ${names}`,
    chipHailMary: '12 SA!',
    chipComeback: 'Remontée',
    chipSweep: 'Rafle',
  },
};

type Strings = (typeof T)[Lang];

/** Your team's score first, then the opponents' — mirrors Stats.tsx's
 * `yourScore` (the ScorepadRow convention) so a game reads the same score
 * order everywhere it's listed, not just in "Recent". */
export function yourScore(game: HistoryGame): readonly [number, number] {
  const you = game.yourSeat % 2;
  return you === 0 ? [game.scores[0], game.scores[1]] : [game.scores[1], game.scores[0]];
}

/** At most one memorable-game chip. Priority: the boldest possible bid beats
 * a turnaround beats a dominant round — 12 SA is the rarest and hardest, a
 * comeback is a whole-game story, a sweep is "just" one great round. */
export function memorableChip(
  game: Pick<HistoryGame, 'hailMary' | 'comeback' | 'sweep'>,
  t: Pick<Strings, 'chipHailMary' | 'chipComeback' | 'chipSweep'>,
): string | null {
  if (game.hailMary === true) return t.chipHailMary;
  if (game.comeback === true) return t.chipComeback;
  if (game.sweep === true) return t.chipSweep;
  return null;
}

export function formatGameDate(ms: number | null, lang: Lang): string {
  if (ms === null) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    month: 'short',
    day: 'numeric',
  });
}

/** "with Ginette · vs Marcel & Réal" — teammate first, then both opponents. */
function rosterLine(game: HistoryGame, t: Strings): string | null {
  const yourTeam = game.yourSeat % 2;
  const teammate = game.players.find((p) => p.seat !== game.yourSeat && p.seat % 2 === yourTeam);
  const opponents = game.players.filter((p) => p.seat % 2 !== yourTeam);
  if (teammate === undefined && opponents.length === 0) return null;
  const vs = opponents.map((p) => p.name).join(' & ');
  if (teammate === undefined) return vs === '' ? null : t.vsThem(vs);
  return vs === '' ? t.withMate(teammate.name) : `${t.withMate(teammate.name)} · ${t.vsThem(vs)}`;
}

export function GameRow({ game }: { readonly game: HistoryGame }) {
  const lang = useLang();
  const t = T[lang];
  const won = game.winnerTeam !== null && game.winnerTeam === game.yourSeat % 2;
  const decided = game.winnerTeam !== null;
  const roster = rosterLine(game, t);
  const [mine, theirs] = yourScore(game);
  const chip = memorableChip(game, t);
  return (
    <a
      href={`#replay/${game.id}`}
      className="flex items-center gap-3 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-4 py-3 shadow-(--shadow-ap-sm) transition-colors hover:bg-(--color-ap-panel-hover)"
    >
      <span
        className={`inline-block shrink-0 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) px-[0.5em] py-1 text-center font-arcade-display text-sm uppercase shadow-(--shadow-ap-sm) ${
          !decided
            ? 'bg-(--color-ap-panel-hover) text-(--color-ap-muted)'
            : won
              ? 'bg-(--color-ap-ok) text-(--color-ap-ink)'
              : 'bg-(--color-ap-danger) text-(--color-ap-ink)'
        }`}
      >
        {decided ? (won ? t.won : t.lost) : '—'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-semibold text-(--color-ap-text)">
            {t.room(game.roomCode)}
          </span>
          {/* At most one — see memorableChip's priority comment. A tint
              (bg-.../NN), not a solid violet fill, so it doesn't need its own
              ink-text pairing (violetInk.test.ts scopes to solid fills). */}
          {chip !== null && (
            <span className="shrink-0 rounded-(--radius-ap-inner) border border-(--color-ap-gold-deep)/50 bg-(--color-ap-gold)/20 px-[0.45em] py-[0.05em] font-arcade-ui text-[0.65em] font-semibold uppercase tracking-wide text-(--color-ap-gold-deep)">
              {chip}
            </span>
          )}
        </span>
        <span className="block truncate text-(length:--text-fluid-xs) text-(--color-ap-muted)">
          {formatGameDate(game.finishedAt, lang)} · {t.seat(game.yourSeat + 1)}
          {roster !== null ? ` · ${roster}` : ''}
        </span>
      </span>
      <span className="font-arcade-display text-lg tabular-nums text-(--color-ap-text)">
        {mine}
        <span className="mx-1 text-(--color-ap-muted)">—</span>
        {theirs}
      </span>
      <span aria-hidden className="text-(--color-ap-muted)">
        ›
      </span>
    </a>
  );
}
