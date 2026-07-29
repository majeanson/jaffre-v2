import { useEffect, useState } from 'react';
import { PixelWave, useLang, type Lang } from '@jaffre/ui';
import type { GameState } from '@jaffre/engine';
import { fetchReplay, type ReplayData } from '../net/history.js';
import { stateAt, trickStartIndex, type HandPosition } from '../replay/position.js';
import { sendLocalAction, startLocalGameFrom, stopLocalGame } from '../local/localGame.js';
import { MetaHeader } from '../components/MetaHeader.js';
import { ShellNote } from '../components/ShellNote.js';
import { Table } from './Table.js';

const T: Record<
  Lang,
  {
    title: string;
    home: string;
    loading: string;
    failed: string;
    intro: (seat: number) => string;
    introBody: string;
    play: string;
    watch: string;
    back: string;
  }
> = {
  en: {
    title: 'Check this play',
    home: 'Home',
    loading: 'Loading the hand…',
    failed: "That hand could not be loaded — the link may be for a game that's gone.",
    intro: (seat) => `You're in seat ${String(seat)}.`,
    introBody:
      'This is a real position from a real game, rewound to the top of the trick. Play it out and see how you do — nothing here touches your record.',
    play: 'Play it out',
    watch: 'Just show me',
    back: '← Back',
  },
  fr: {
    title: 'Essaie cette main',
    home: 'Accueil',
    loading: 'Chargement de la main…',
    failed: 'Impossible de charger cette main — le lien pointe peut-être sur une partie disparue.',
    intro: (seat) => `Tu es au siège ${String(seat)}.`,
    introBody:
      'C’est une vraie position d’une vraie partie, reculée au début de la levée. Joue-la et vois ce que ça donne — rien ici ne touche à ton record.',
    play: 'Joue-la',
    watch: 'Montre-moi ça',
    back: '← Retour',
  },
};

export interface HandProps {
  readonly position: HandPosition;
  readonly onLeave: () => void;
  /** Scene viewer: staged replay data so the screen renders without a network. */
  readonly demo?: ReplayData;
}

/**
 * A shared POSITION, played out.
 *
 * "Share this hand" and "check this play" are the same link (see
 * replay/position.ts); this screen is the interactive half. It folds the
 * stored action log forward to the position, rewinds to the top of that trick,
 * and hands the resulting state to practice mode so the visitor takes that
 * seat against bots.
 *
 * PRIVACY: the state goes through `startLocalGameFrom`, which publishes it via
 * `viewFor(state, seat)` — the same redaction the live server applies. The raw
 * `RoundSummary.startingHands` (which names every seat's cards) is never on
 * screen. A shared link therefore reveals no more than sitting down would.
 */
export function Hand({ position, onLeave, demo }: HandProps) {
  const lang = useLang();
  const t = T[lang];
  const [start, setStart] = useState<GameState | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let live = true;
    const load = (data: ReplayData) => {
      if (!live) return;
      // Rewind to the top of the trick: being dropped in after three cards are
      // down is a quiz about one card, not a question about how you'd play.
      const index = trickStartIndex(data.seed, data.actions, position.actionIndex);
      const state = stateAt(data.seed, data.actions, index);
      if (state === null || state.phase === 'game_over') setFailed(true);
      else setStart(state);
    };
    if (demo !== undefined) {
      load(demo);
      return () => {
        live = false;
      };
    }
    fetchReplay(position.gameId)
      .then(load)
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [position.gameId, position.actionIndex, demo]);

  // Tear the practice game down on the way out, so a half-played shared hand
  // never leaks into the next thing the player opens.
  useEffect(() => () => stopLocalGame(), []);

  if (failed) {
    return (
      <main className="min-h-full bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text)">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />
          <ShellNote>{t.failed}</ShellNote>
        </div>
      </main>
    );
  }

  if (start === null) {
    return (
      <main className="grid min-h-full place-items-center bg-(--color-ap-ground)">
        <PixelWave label={t.loading} />
      </main>
    );
  }

  // Practice mode: `sendLocalAction` is the same entry point Home's practice
  // door uses, and `online={false}` keeps chat/voice off — bots don't talk.
  if (playing) return <Table onAction={sendLocalAction} onLeave={onLeave} />;

  const seat = position.seat;
  return (
    <main className="min-h-full bg-(--color-ap-ground) p-6 pt-[min(11vh,7rem)] text-(--color-ap-text)">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <MetaHeader title={t.title} homeLabel={t.home} onLeave={onLeave} />
        <ShellNote>
          <p className="font-arcade-display text-[1em] uppercase tracking-wide">
            {t.intro(seat + 1)}
          </p>
          <p className="mt-[0.5em] font-arcade-ui text-[0.85em] text-(--color-ap-text)/80">
            {t.introBody}
          </p>
        </ShellNote>
        <button
          type="button"
          onClick={() => {
            startLocalGameFrom(start, seat);
            setPlaying(true);
          }}
          // Ink on violet, like every other primary CTA in the app (Home, the
          // PLAY door, the toolbar toggles). Inheriting the page text colour
          // instead puts light-on-violet at 2.6:1 — axe caught it the moment
          // this screen got a scene of its own to be scanned in.
          className="rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-violet) px-[1em] py-[0.5em] font-arcade-display text-[1em] uppercase tracking-wide text-(--color-ap-ink) shadow-(--shadow-ap)"
        >
          {t.play}
        </button>
        <button
          type="button"
          onClick={() => {
            location.hash = `#replay/${position.gameId}`;
          }}
          className="font-arcade-ui text-[0.8em] uppercase tracking-wide text-(--color-ap-muted) underline"
        >
          {t.watch}
        </button>
      </div>
    </main>
  );
}
