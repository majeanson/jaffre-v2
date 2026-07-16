import { useEffect, useMemo, useState } from 'react';
import { GHOST_BTN_SM } from '../components/buttonStyles.js';
import { buildFrames, type ReplayFrame } from '../replay/buildFrames.js';
import { fetchReplay, type ReplayData } from '../net/history.js';
import { useGameStore } from '../state/gameStore.js';
import { Table } from './Table.js';
import type { Viewer } from '@jaffre/engine';
import type { Roster } from '@jaffre/protocol';

/** Names are not in the replay data — seats read as Player 1–4 (viewer = You). */
const REPLAY_ROSTER: Roster = {
  seats: [0, 1, 2, 3].map((i) => ({
    name: `Player ${String(i + 1)}`,
    isBot: false,
    connected: true,
  })),
  spectators: 0,
  started: true,
};

const STEP_MS = 800;

export interface ReplayProps {
  /** Game id to fetch; null when `demo` is supplied (scene viewer). */
  readonly gameId: string | null;
  readonly demo?: ReplayData;
  readonly onLeave: () => void;
}

/** Push one replay frame into the store, exactly as the network layer would. */
function injectFrame(frame: ReplayFrame, viewer: Viewer, seq: number): void {
  const store = useGameStore.getState();
  store.reset();
  store.welcome(viewer, frame.view, seq, REPLAY_ROSTER, []);
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

  useEffect(() => {
    const frame = frames[clamped];
    if (frame !== undefined) injectFrame(frame, viewer, clamped);
  }, [frames, clamped, viewer]);

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
      <main className="table-felt grid min-h-dvh place-items-center p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-(--color-ivory)/75">This replay could not be loaded.</p>
          <button
            type="button"
            onClick={onLeave}
            className={`px-4 py-2 text-sm text-(--color-ivory)/80 ${GHOST_BTN_SM}`}
          >
            ← Back
          </button>
        </div>
      </main>
    );
  }

  if (frames.length === 0) {
    return (
      <main className="table-felt grid min-h-dvh place-items-center">
        <p className="animate-pulse text-(--color-ivory)/60">Loading replay…</p>
      </main>
    );
  }

  return (
    <>
      <Table key="replay" onAction={() => undefined} onLeave={onLeave} />
      <div
        data-testid="replay-controls"
        className="fixed bottom-2 left-1/2 z-[60] flex w-[min(94vw,40rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-white/12 bg-black/85 px-4 py-2 text-white shadow-(--shadow-panel) max-sm:gap-2 max-sm:px-3"
      >
        <button
          type="button"
          aria-label="Previous frame"
          onClick={() => setIdx(Math.max(0, clamped - 1))}
          className={GHOST_BTN_SM}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => setPlaying((p) => !p)}
          className={GHOST_BTN_SM}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          aria-label="Next frame"
          onClick={() => setIdx(Math.min(last, clamped + 1))}
          className={GHOST_BTN_SM}
        >
          ›
        </button>
        <input
          type="range"
          aria-label="Replay position"
          min={0}
          max={last}
          value={clamped}
          onChange={(e) => {
            setPlaying(false);
            setIdx(Number(e.target.value));
          }}
          className="min-w-0 flex-1 accent-(--color-lamplight)"
        />
        <span
          data-testid="replay-frame"
          className="shrink-0 text-xs tabular-nums whitespace-nowrap text-white/80"
        >
          {clamped + 1} / {frames.length}
        </span>
        <select
          aria-label="View as"
          value={viewer}
          onChange={(e) => setViewer(Number(e.target.value) as Viewer)}
          className="shrink-0 cursor-pointer rounded-lg border border-white/15 bg-black/40 px-1.5 py-1 text-xs text-white max-sm:hidden"
        >
          {[0, 1, 2, 3].map((s) => (
            <option key={s} value={s} className="text-black">
              Seat {s + 1}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
