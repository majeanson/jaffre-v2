import { useEffect, useMemo, useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { GHOST_BTN_SM, GHOST_BTN_SM_DARK } from '../components/buttonStyles.js';
import { buildFrames, type ReplayFrame } from '../replay/buildFrames.js';
import { fetchReplay, type ReplayData } from '../net/history.js';
import { useGameStore } from '../state/gameStore.js';
import { Table } from './Table.js';
import type { Viewer } from '@jaffre/engine';
import type { Roster } from '@jaffre/protocol';

const T: Record<
  Lang,
  {
    fallbackPlayer: (n: number) => string;
    failed: string;
    back: string;
    loading: string;
    prev: string;
    next: string;
    play: string;
    pause: string;
    position: string;
    viewAs: string;
    seat: (n: number) => string;
  }
> = {
  en: {
    fallbackPlayer: (n) => `Player ${String(n)}`,
    failed: 'This replay could not be loaded.',
    back: '← Back',
    loading: 'Loading replay…',
    prev: 'Previous frame',
    next: 'Next frame',
    play: 'Play',
    pause: 'Pause',
    position: 'Replay position',
    viewAs: 'View as',
    seat: (n) => `Seat ${String(n)}`,
  },
  fr: {
    fallbackPlayer: (n) => `Joueur ${String(n)}`,
    failed: 'Impossible de charger cette reprise.',
    back: '← Retour',
    loading: 'Chargement de la reprise…',
    prev: 'Image précédente',
    next: 'Image suivante',
    play: 'Jouer',
    pause: 'Pause',
    position: 'Position dans la reprise',
    viewAs: 'Voir comme',
    seat: (n) => `Siège ${String(n)}`,
  },
};

type Strings = (typeof T)[Lang];

/** Roster from the game's stored players — falls back to "Player N" for any
 * seat the server didn't have a name for (older rows predating M10). */
function rosterFromPlayers(players: ReplayData['players'], t: Strings): Roster {
  return {
    seats: [0, 1, 2, 3].map((i) => {
      const p = players?.find((pl) => pl.seat === i);
      return {
        name: p?.name ?? t.fallbackPlayer(i + 1),
        isBot: p?.isBot ?? false,
        connected: true,
      };
    }),
    spectators: 0,
    started: true,
  };
}

const STEP_MS = 800;

export interface ReplayProps {
  /** Game id to fetch; null when `demo` is supplied (scene viewer). */
  readonly gameId: string | null;
  readonly demo?: ReplayData;
  readonly onLeave: () => void;
}

/** Push one replay frame into the store, exactly as the network layer would. */
function injectFrame(frame: ReplayFrame, viewer: Viewer, seq: number, roster: Roster): void {
  const store = useGameStore.getState();
  store.reset();
  store.welcome(viewer, frame.view, seq, roster, []);
  if (frame.summaries.length > 0) {
    store.applyEvents(
      frame.summaries.map((summary) => ({ type: 'round_scored' as const, summary })),
      seq,
    );
  }
}

/**
 * Replays a finished game frame by frame through the real table. Rebuilds the
 * frame list from (seed, actions) for the chosen viewer seat, injects the
 * current frame into the store, and drives it with a scrubber + play controls.
 */
export function Replay({ gameId, demo, onLeave }: ReplayProps) {
  const t = T[useLang()];
  const [data, setData] = useState<ReplayData | null>(demo ?? null);
  const [failed, setFailed] = useState(false);
  const [viewer, setViewer] = useState<Viewer>(0);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (demo !== undefined || gameId === null) return;
    let live = true;
    fetchReplay(gameId)
      .then((r) => live && setData(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [gameId, demo]);

  const frames = useMemo<readonly ReplayFrame[]>(() => {
    if (data === null) return [];
    try {
      return buildFrames(data.seed, data.actions, viewer);
    } catch {
      return [];
    }
  }, [data, viewer]);

  const last = Math.max(0, frames.length - 1);
  const clamped = Math.min(idx, last);
  const roster = useMemo(() => rosterFromPlayers(data?.players, t), [data, t]);

  useEffect(() => {
    const frame = frames[clamped];
    if (frame !== undefined) injectFrame(frame, viewer, clamped, roster);
  }, [frames, clamped, viewer, roster]);

  useEffect(() => {
    if (!playing) return undefined;
    if (clamped >= last) {
      setPlaying(false);
      return undefined;
    }
    const id = setTimeout(() => setIdx(clamped + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, clamped, last]);

  if (failed) {
    return (
      <main className="table-felt grid min-h-full place-items-center p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="font-arcade-ui text-(--color-ap-muted)">{t.failed}</p>
          <button type="button" onClick={onLeave} className={GHOST_BTN_SM}>
            {t.back}
          </button>
        </div>
      </main>
    );
  }

  if (frames.length === 0) {
    return (
      <main className="table-felt grid min-h-full place-items-center">
        <p className="animate-pulse font-arcade-display uppercase tracking-wide text-(--color-ap-muted)">
          {t.loading}
        </p>
      </main>
    );
  }

  return (
    <>
      <Table key="replay" onAction={() => undefined} onLeave={onLeave} bottomInset />
      <div
        data-testid="replay-controls"
        className="fixed bottom-2 left-1/2 z-[60] flex w-[min(94vw,40rem)] -translate-x-1/2 items-center gap-3 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-2 font-arcade-ui text-white shadow-(--shadow-ap) max-sm:gap-2 max-sm:px-3"
      >
        <button
          type="button"
          aria-label={t.prev}
          onClick={() => setIdx(Math.max(0, clamped - 1))}
          className={GHOST_BTN_SM_DARK}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={playing ? t.pause : t.play}
          onClick={() => setPlaying((p) => !p)}
          className={GHOST_BTN_SM_DARK}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          aria-label={t.next}
          onClick={() => setIdx(Math.min(last, clamped + 1))}
          className={GHOST_BTN_SM_DARK}
        >
          ›
        </button>
        <input
          type="range"
          aria-label={t.position}
          min={0}
          max={last}
          value={clamped}
          onChange={(e) => {
            setPlaying(false);
            setIdx(Number(e.target.value));
          }}
          className="min-w-0 flex-1 accent-(--color-ap-violet)"
        />
        <span
          data-testid="replay-frame"
          className="shrink-0 text-xs tabular-nums whitespace-nowrap text-white/80"
        >
          {clamped + 1} / {frames.length}
        </span>
        <select
          aria-label={t.viewAs}
          value={viewer}
          onChange={(e) => setViewer(Number(e.target.value) as Viewer)}
          className="shrink-0 cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-black/40 px-1.5 py-1 text-xs text-white max-sm:hidden"
        >
          {[0, 1, 2, 3].map((s) => (
            <option key={s} value={s} className="text-black">
              {t.seat(s + 1)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
