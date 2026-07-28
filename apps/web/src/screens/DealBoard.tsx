import { useEffect, useState } from 'react';
import { PixelWave, useLang, type Lang } from '@jaffre/ui';
import { dailyChallenge, weeklyChallenge, type ChallengeDeal } from '@jaffre/engine';
import {
  challengeLog,
  startChallenge,
  stopLocalGame,
  sendLocalAction,
} from '../local/localGame.js';
import { fetchBoard, submitRun, type ChallengeBoard } from '../net/challenge.js';
import { useGameStore } from '../state/gameStore.js';
import { MetaHeader } from '../components/MetaHeader.js';
import { MetaNav } from '../components/MetaNav.js';
import { ShellNote } from '../components/ShellNote.js';
import { Table } from './Table.js';

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    loading: string;
    dailyName: string;
    weeklyName: string;
    blurb: string;
    play: string;
    replayed: string;
    board: string;
    empty: string;
    you: (rank: number) => string;
    scored: (score: number) => string;
    submitting: string;
    rejected: string;
    offline: string;
    alreadyPlayed: string;
    weeklyDeal: (n: number) => string;
  }
> = {
  en: {
    title: 'Deal Board',
    home: 'Home',
    loading: 'Loading…',
    dailyName: 'Hand of the Day',
    weeklyName: 'This week’s set',
    blurb:
      'The same deal for everyone, against the same bots. One try. Three minutes. Come back tomorrow for a new one.',
    play: 'Play the hand',
    replayed: 'You’ve already played this one.',
    board: 'Today’s board',
    empty: 'Nobody has posted a score yet. Be first.',
    you: (rank) => `You’re #${String(rank)}`,
    scored: (score) => `You scored ${String(score)}.`,
    submitting: 'Posting your score…',
    rejected: 'That run could not be verified, so it wasn’t posted.',
    offline: 'Your score needs the online server — it wasn’t posted.',
    alreadyPlayed: 'Only your first run counts, so this one wasn’t posted.',
    weeklyDeal: (n) => `Deal ${String(n)}`,
  },
  fr: {
    title: 'Tableau des donnes',
    home: 'Accueil',
    loading: 'Chargement…',
    dailyName: 'La main du jour',
    weeklyName: 'La série de la semaine',
    blurb:
      'La même donne pour tout le monde, contre les mêmes bots. Un essai. Trois minutes. Reviens demain pour une nouvelle.',
    play: 'Joue la main',
    replayed: 'Tu as déjà joué celle-là.',
    board: 'Le tableau du jour',
    empty: "Personne n'a encore inscrit de pointage. Sois le premier.",
    you: (rank) => `Tu es #${String(rank)}`,
    scored: (score) => `Tu as fait ${String(score)}.`,
    submitting: 'On inscrit ton pointage…',
    rejected: "Cette partie n'a pas pu être vérifiée, donc elle n'a pas été inscrite.",
    offline: "Ton pointage a besoin du serveur en ligne — il n'a pas été inscrit.",
    alreadyPlayed: "Seul ton premier essai compte, donc celui-ci n'a pas été inscrit.",
    weeklyDeal: (n) => `Donne ${String(n)}`,
  },
};

export interface DealBoardProps {
  readonly onLeave: () => void;
  /** Scene viewer: a staged board so the screen renders without the network. */
  readonly demoBoard?: ChallengeBoard;
  /** Scene viewer: pin "now" so the derived deal is stable across shots. */
  readonly demoNow?: number;
}

type Phase = 'browsing' | 'playing' | 'submitting' | 'done';

/**
 * The Deal Board — Hand of the Day and the weekly set, one machine.
 *
 * They are the same thing at two cadences (see @jaffre/engine's challenge.ts),
 * so they share a screen rather than splitting into two that would each be
 * half-empty. The daily is the reason to come back tomorrow; the weekly is the
 * reason to come back if you missed a day.
 */
export function DealBoard({ onLeave, demoBoard, demoNow }: DealBoardProps) {
  const lang = useLang();
  const t = T[lang];
  const now = demoNow ?? Date.now();
  const [deal, setDeal] = useState<ChallengeDeal>(() => dailyChallenge(now));
  const [board, setBoard] = useState<ChallengeBoard | null>(demoBoard ?? null);
  const [loading, setLoading] = useState(demoBoard === undefined);
  const [phase, setPhase] = useState<Phase>('browsing');
  const [outcome, setOutcome] = useState<string | null>(null);
  const gamePhase = useGameStore((s) => s.view?.phase);

  useEffect(() => {
    if (demoBoard !== undefined) return;
    let live = true;
    setLoading(true);
    fetchBoard(deal.id)
      .then((b) => {
        if (!live) return;
        setBoard(b);
        setLoading(false);
      })
      .catch(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [deal.id, demoBoard]);

  // Tear the challenge down on the way out — a half-played daily left running
  // would otherwise still be there behind the next screen.
  useEffect(() => () => stopLocalGame(), []);

  // The run ends when the ROUND ends: a challenge is one deal, not a game.
  useEffect(() => {
    if (phase !== 'playing') return;
    if (gamePhase !== 'round_over' && gamePhase !== 'game_over') return;
    const actions = challengeLog();
    if (actions === null) return;
    setPhase('submitting');
    void submitRun(deal.id, actions).then((result) => {
      stopLocalGame();
      if (!result.ok) {
        setOutcome(result.reason === 'offline' ? t.offline : t.rejected);
      } else if (!result.accepted) {
        setOutcome(`${t.alreadyPlayed} ${t.scored(result.score)}`);
      } else {
        setOutcome(t.scored(result.score));
      }
      setPhase('done');
      // Re-read the board so the player sees where their score landed.
      void fetchBoard(deal.id).then((b) => b !== null && setBoard(b));
    });
  }, [phase, gamePhase, deal.id, t]);

  if (phase === 'playing') return <Table onAction={sendLocalAction} onLeave={onLeave} />;

  const alreadyPlayed = board?.you != null;
  const weekly = weeklyChallenge(now);

  return (
    <main className="min-h-full overflow-y-auto bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text) max-sm:p-4">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />
        <MetaNav current="dealboard" />

        {/* Which deal you're looking at: today's, or one of the week's three. */}
        <nav className="flex flex-wrap gap-2" aria-label={t.title}>
          {[dailyChallenge(now), ...weekly].map((d, i) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDeal(d)}
              aria-current={d.id === deal.id}
              className={`rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-[0.7em] py-[0.25em] font-arcade-ui text-[0.78em] uppercase tracking-wide shadow-(--shadow-ap-sm) ${
                d.id === deal.id
                  ? 'bg-(--color-ap-violet) text-white'
                  : 'bg-(--color-ap-panel) text-(--color-ap-muted)'
              }`}
            >
              {i === 0 ? t.dailyName : t.weeklyDeal(i)}
            </button>
          ))}
        </nav>

        <ShellNote>
          <p className="font-arcade-ui text-[0.85em] text-(--color-ap-text)/85">{t.blurb}</p>
        </ShellNote>

        {outcome !== null && (
          <p
            data-testid="deal-outcome"
            className="rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[0.8em] font-arcade-ui text-[0.85em] shadow-(--shadow-ap-sm)"
          >
            {outcome}
          </p>
        )}

        {phase === 'submitting' ? (
          <PixelWave label={t.submitting} />
        ) : (
          <button
            type="button"
            disabled={alreadyPlayed}
            onClick={() => {
              startChallenge(deal);
              setOutcome(null);
              setPhase('playing');
            }}
            className="rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-violet) px-[1em] py-[0.5em] font-arcade-display text-[1em] uppercase tracking-wide shadow-(--shadow-ap) disabled:bg-(--color-ap-panel) disabled:text-(--color-ap-muted)"
          >
            {alreadyPlayed ? t.replayed : t.play}
          </button>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="font-arcade-display text-[0.9em] uppercase tracking-wide text-(--color-ap-muted)">
            {t.board}
          </h2>
          {loading ? (
            <PixelWave label={t.loading} />
          ) : board === null || board.board.length === 0 ? (
            <ShellNote>{t.empty}</ShellNote>
          ) : (
            <ol className="flex flex-col gap-1">
              {board.board.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.7em] py-[0.35em] font-arcade-ui text-[0.85em]"
                >
                  <span className="w-[2em] shrink-0 tabular-nums text-(--color-ap-muted)">
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-(--color-ap-gold)">{row.score}</span>
                </li>
              ))}
            </ol>
          )}
          {board?.you != null && (
            <p className="font-arcade-ui text-[0.8em] text-(--color-ap-muted)">
              {t.you(board.you.rank)} · {t.scored(board.you.score)}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
