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
  }
> = {
  en: {
    won: 'Won',
    lost: 'Lost',
    room: (code) => `Room ${code}`,
    seat: (n) => `seat ${String(n)}`,
    withMate: (name) => `with ${name}`,
    vsThem: (names) => `vs ${names}`,
  },
  fr: {
    won: 'Gagnée',
    lost: 'Perdue',
    room: (code) => `Salon ${code}`,
    seat: (n) => `siège ${String(n)}`,
    withMate: (name) => `avec ${name}`,
    vsThem: (names) => `contre ${names}`,
  },
};

type Strings = (typeof T)[Lang];

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
        <span className="block truncate font-semibold text-(--color-ap-text)">
          {t.room(game.roomCode)}
        </span>
        <span className="block truncate text-(length:--text-fluid-xs) text-(--color-ap-muted)">
          {formatGameDate(game.finishedAt, lang)} · {t.seat(game.yourSeat + 1)}
          {roster !== null ? ` · ${roster}` : ''}
        </span>
      </span>
      <span className="font-arcade-display text-lg tabular-nums text-(--color-ap-text)">
        {game.scores[0]}
        <span className="mx-1 text-(--color-ap-muted)">—</span>
        {game.scores[1]}
      </span>
      <span aria-hidden className="text-(--color-ap-muted)">
        ›
      </span>
    </a>
  );
}
