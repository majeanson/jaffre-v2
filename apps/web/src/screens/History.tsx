import { useEffect, useState } from 'react';
import { Cta, useLang, type Lang } from '@jaffre/ui';
import { fetchHistory, type HistoryGame } from '../net/history.js';
import { MetaNav } from '../components/MetaNav.js';

export interface HistoryProps {
  readonly onLeave: () => void;
  /** Scene viewer: staged games so the screen renders without the network. */
  readonly demoGames?: readonly HistoryGame[];
}

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    won: string;
    lost: string;
    room: (code: string) => string;
    seat: (n: number) => string;
    withMate: (name: string) => string;
    vsThem: (names: string) => string;
    loading: string;
    empty: string;
    practiceNote: string;
    error: string;
  }
> = {
  en: {
    title: 'Your games',
    home: 'Home',
    won: 'Won',
    lost: 'Lost',
    room: (code) => `Room ${code}`,
    seat: (n) => `seat ${String(n)}`,
    withMate: (name) => `with ${name}`,
    vsThem: (names) => `vs ${names}`,
    loading: 'Loading…',
    empty: 'No finished games yet. Finish a game and it will appear here to replay.',
    practiceNote: 'Practice games against bots stay off the record — only room games count.',
    error: 'History needs the online server. Play a room game and it will show up here.',
  },
  fr: {
    title: 'Tes parties',
    home: 'Accueil',
    won: 'Gagnée',
    lost: 'Perdue',
    room: (code) => `Salon ${code}`,
    seat: (n) => `siège ${String(n)}`,
    withMate: (name) => `avec ${name}`,
    vsThem: (names) => `contre ${names}`,
    loading: 'Chargement…',
    empty: 'Pas encore de partie terminée. Finis une partie et elle apparaîtra ici pour la revoir.',
    practiceNote:
      'Les parties de pratique contre les bots ne comptent pas — seules les parties en salon sont enregistrées.',
    error:
      "L'historique a besoin du serveur en ligne. Joue une partie en salon et elle apparaîtra ici.",
  },
};

type Strings = (typeof T)[Lang];

function formatDate(ms: number | null, lang: Lang): string {
  if (ms === null) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en', { month: 'short', day: 'numeric' });
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

/** One finished game as a link into its replay. */
function GameRow({ game }: { readonly game: HistoryGame }) {
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
          {formatDate(game.finishedAt, lang)} · {t.seat(game.yourSeat + 1)}
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

/** "Your games": finished games from the server, each a link into its replay. */
export function History({ onLeave, demoGames }: HistoryProps) {
  const t = T[useLang()];
  const [games, setGames] = useState<readonly HistoryGame[] | null>(demoGames ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (demoGames !== undefined) return;
    let live = true;
    fetchHistory()
      .then((g) => live && setGames(g))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [demoGames]);

  return (
    <main className="table-felt min-h-full overflow-y-auto p-6 max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="font-arcade-display text-(length:--text-fluid-2xl) uppercase text-(--color-ap-gold)">
            {t.title}
          </h1>
          <Cta variant="secondary" onClick={onLeave}>
            {t.home}
          </Cta>
        </header>

        <MetaNav current="history" />

        {error ? (
          <p className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-6 text-center text-(--color-ap-muted) shadow-(--shadow-ap)">
            {t.error}
          </p>
        ) : games === null ? (
          <p className="p-6 text-center text-(--color-ap-muted)">{t.loading}</p>
        ) : games.length === 0 ? (
          <div className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-6 text-center text-(--color-ap-muted) shadow-(--shadow-ap)">
            <p>{t.empty}</p>
            <p className="mt-2 text-[0.85em]">{t.practiceNote}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {games.map((g) => (
              <GameRow key={g.id} game={g} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
