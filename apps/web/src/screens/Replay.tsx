import { useEffect, useMemo, useState } from 'react';
import { PixelWave, useLang, type Lang } from '@jaffre/ui';
import { GHOST_BTN_SM, GHOST_BTN_SM_DARK } from '../components/buttonStyles.js';
import { formatGameDate } from '../components/GameRow.js';
import { buildFrames, type ReplayFrame } from '../replay/buildFrames.js';
import { fetchReplay, type ReplayData } from '../net/history.js';
import { useGameStore } from '../state/gameStore.js';
import { loadCoachPref, saveCoachPref } from '../table/coachPref.js';
import { paced } from '../table/pacePref.js';
import { Table } from './Table.js';
import { shareHand } from '../replay/position.js';
import type { Seat, Viewer } from '@jaffre/engine';
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
    prevRound: string;
    nextRound: string;
    play: string;
    pause: string;
    position: string;
    viewAs: string;
    shareHand: string;
    seat: (n: number) => string;
    room: (code: string) => string;
    speed: (x: 1 | 2) => string;
    speedAria: (x: 1 | 2) => string;
    coach: string;
    coachAria: string;
  }
> = {
  en: {
    fallbackPlayer: (n) => `Player ${String(n)}`,
    failed: 'This replay could not be loaded.',
    back: '← Back',
    loading: 'Loading replay…',
    prev: 'Previous frame',
    next: 'Next frame',
    prevRound: 'Previous round',
    nextRound: 'Next round',
    play: 'Play',
    pause: 'Pause',
    position: 'Replay position',
    viewAs: 'View as',
    shareHand: 'Share this hand',
    seat: (n) => `Seat ${String(n)}`,
    room: (code) => `Room ${code}`,
    speed: (x) => `${String(x)}×`,
    speedAria: (x) => `Playback speed: ${String(x)}×`,
    coach: 'Coach',
    coachAria: 'Coach — suggest a move on the replayed seat’s turns',
  },
  fr: {
    fallbackPlayer: (n) => `Joueur ${String(n)}`,
    failed: 'Impossible de charger cette reprise.',
    back: '← Retour',
    loading: 'Chargement de la reprise…',
    prev: 'Image précédente',
    next: 'Image suivante',
    prevRound: 'Ronde précédente',
    nextRound: 'Ronde suivante',
    play: 'Jouer',
    pause: 'Pause',
    position: 'Position dans la reprise',
    viewAs: 'Voir comme',
    shareHand: 'Partager cette main',
    seat: (n) => `Siège ${String(n)}`,
    room: (code) => `Salon ${code}`,
    speed: (x) => `${String(x)}×`,
    speedAria: (x) => `Vitesse de lecture : ${String(x)}×`,
    coach: 'Coach',
    coachAria: 'Coach — suggère un coup aux tours du siège rejoué',
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

/** Base step between frames while auto-playing, before speed/pacing scale it. */
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

/** The frame index at the start of each round: frame 0 (the deal) plus every
 * frame whose action was a `continue` (buildFrames' label for it is "New
 * round"). Feeds the round-jump buttons — the simplest "markers vs prev/next
 * buttons" choice that still reads at a glance on a 40rem bar. */
function roundStarts(frames: readonly ReplayFrame[]): readonly number[] {
  const starts: number[] = [];
  frames.forEach((f, i) => {
    if (i === 0 || f.label === 'New round') starts.push(i);
  });
  return starts;
}

/**
 * Replays a finished game frame by frame through the real table. Rebuilds the
 * frame list from (seed, actions) for the chosen viewer seat, injects the
 * current frame into the store, and drives it with a scrubber + play controls.
 */
export function Replay({ gameId, demo, onLeave }: ReplayProps) {
  const lang = useLang();
  const t = T[lang];
  const [data, setData] = useState<ReplayData | null>(demo ?? null);
  const [failed, setFailed] = useState(false);
  // A Seat, not a Viewer: the selector only ever offers the four seats, and a
  // shared position has to name one (there is no "check this play" from the
  // spectator's chair).
  const [viewer, setViewer] = useState<Seat>(0);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [shared, setShared] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  // The felt's Coach toggle, surfaced here instead of buried in Options — see
  // Table.tsx's `coachOn`/`onToggleCoach` doc comments. Same persisted pref
  // (table/coachPref.ts) as every other table, defaulting on like practice.
  const [coachOn, setCoachOn] = useState(() => loadCoachPref(true));

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
  const rounds = useMemo(() => roundStarts(frames), [frames]);

  useEffect(() => {
    const frame = frames[clamped];
    if (frame !== undefined) injectFrame(frame, viewer, clamped, roster);
  }, [frames, clamped, viewer, roster]);

  // The injected frame dies with the viewer: its roster says `started: true`,
  // and a replay left in the store makes the next screen think that game is
  // live. Same contract as stopLocalGame's.
  useEffect(() => () => useGameStore.getState().reset(), []);

  useEffect(() => {
    if (!playing) return undefined;
    if (clamped >= last) {
      setPlaying(false);
      return undefined;
    }
    const id = setTimeout(() => setIdx(clamped + 1), paced(STEP_MS) / speed);
    return () => clearTimeout(id);
  }, [playing, clamped, last, speed]);

  // Keyboard: ← → step a frame, space plays/pauses. Ignored while an
  // input/select has focus — the range slider and the "View as" select
  // already own arrow keys/space themselves, and hijacking them there would
  // fight the browser's own control instead of stepping the replay.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPlaying(false);
        setIdx((i) => Math.max(0, Math.min(i, last) - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        setIdx((i) => Math.min(last, i + 1));
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  // Shared by the felt's own Coach toggle (via Table's controlled coachOn
  // prop) and the replay bar's copy of it below — one state, one writer.
  function toggleCoach(): void {
    setCoachOn((on) => {
      saveCoachPref(!on);
      return !on;
    });
  }

  function jumpRound(dir: 1 | -1): void {
    const target =
      dir === 1 ? rounds.find((i) => i > clamped) : [...rounds].reverse().find((i) => i < clamped);
    if (target === undefined) return;
    setPlaying(false);
    setIdx(target);
  }

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
        <PixelWave label={t.loading} />
      </main>
    );
  }

  // "Room X · date · 41–33" — the same D1 row /api/history lists this game
  // from (see routes/games.ts's handleReplay), so no second fetch. Absent for
  // an older cached response or a scene without those fields staged.
  const header =
    data !== null &&
    data.roomCode !== undefined &&
    data.finishedAt !== undefined &&
    data.scores !== undefined
      ? `${t.room(data.roomCode)} · ${formatGameDate(data.finishedAt, lang)} · ${String(data.scores[0])}–${String(data.scores[1])}`
      : null;
  const label = frames[clamped]?.label ?? '';

  return (
    <>
      <Table
        key="replay"
        onAction={() => undefined}
        onLeave={onLeave}
        bottomInset
        noDealIntro
        replay
        coachOn={coachOn}
        onToggleCoach={toggleCoach}
      />
        // ← → step frames here (the effect above), which is what an arrow
        // should mean on a replay — so this screen keeps the arrows and the
        // app-wide focus d-pad stands down while it is mounted. Both listen on
        // window, where bubble order alone couldn't settle it.
        data-nav-suspend=""
      <div
        data-testid="replay-controls"
        className="fixed bottom-2 left-1/2 z-[60] flex w-[min(94vw,40rem)] -translate-x-1/2 flex-col gap-1 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-2 font-arcade-ui text-white shadow-(--shadow-ap) max-sm:px-3"
      >
        {/* Compact info row: which game this is, and what just happened —
            both read-only, so they sit above the interactive controls. */}
        {(header !== null || label !== '') && (
          <div className="flex items-center justify-between gap-2 text-[0.68em] text-white/70">
            {header !== null && (
              <span data-testid="replay-header" className="truncate">
                {header}
              </span>
            )}
            <span data-testid="replay-label" className="ml-auto shrink-0 truncate text-right">
              {label}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 max-sm:gap-2">
          {/* Round jump — the simplest of the two options the plan offered
              (markers on the range vs prev/next buttons); hidden on phones
              since the scrubber still reaches every round boundary. */}
          <button
            type="button"
            aria-label={t.prevRound}
            onClick={() => jumpRound(-1)}
            className={`${GHOST_BTN_SM_DARK} max-sm:hidden`}
          >
            «
          </button>
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
          <button
            type="button"
            aria-label={t.nextRound}
            onClick={() => jumpRound(1)}
            className={`${GHOST_BTN_SM_DARK} max-sm:hidden`}
          >
            »
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
            className="shrink-0 text-xs tabular-nums whitespace-nowrap text-white/80 max-sm:hidden"
          >
            {clamped + 1} / {frames.length}
          </span>
          {/* 1×/2× — halves the auto-play step (still through paced(), so
              reduced motion stays instant regardless of speed). */}
          <button
            type="button"
            aria-label={t.speedAria(speed)}
            onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
            className={`${GHOST_BTN_SM_DARK} max-sm:hidden`}
          >
            {t.speed(speed)}
          </button>
          {/* The accidental Coach, surfaced: it already worked here (Table
              reads the same pref), just two taps deep in Options — this is
              the one control most worth not hiding on a screen about
              LEARNING from a past hand. */}
          <button
            type="button"
            aria-label={t.coachAria}
            title={t.coach}
            aria-pressed={coachOn}
            onClick={toggleCoach}
            className={
              coachOn
                ? 'rounded-(--radius-ap-control) border-2 border-(--color-ap-violet-soft) bg-(--color-ap-violet)/40 px-[1em] py-[0.66em] text-(length:--text-fluid-xs) font-arcade-display uppercase tracking-wide text-white shadow-(--shadow-ap-sm) hover:bg-(--color-ap-violet)/55 cursor-pointer'
                : GHOST_BTN_SM_DARK
            }
          >
            {t.coach}
          </button>
          {/* Share THIS moment, not just the game. The scrubber position is
              already a precise index into the action log, so a position link is
              free here — see replay/position.ts. Hidden for a demo (scene
              viewer) replay, which has no real game id to point at. */}
          {gameId !== null && (
            <button
              type="button"
              aria-label={t.shareHand}
              title={t.shareHand}
              onClick={() => {
                void shareHand({ gameId, actionIndex: clamped, seat: viewer }, () =>
                  setShared(true),
                );
              }}
              className={GHOST_BTN_SM_DARK}
            >
              {shared ? '✓' : '⇗'}
            </button>
          )}
          {/* "View as" seat selector — kept available on phones (compact:
              tighter padding/text) instead of hidden; the frame counter yields
              the room instead, since the position is already on the slider. */}
          <select
            aria-label={t.viewAs}
            value={viewer}
            onChange={(e) => setViewer(Number(e.target.value) as Seat)}
            className="w-[4.2em] shrink-0 cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-black/40 px-1.5 py-1 text-xs text-white max-sm:w-auto max-sm:px-1 max-sm:py-0.5 max-sm:text-[10px]"
          >
            {[0, 1, 2, 3].map((s) => (
              <option key={s} value={s} className="text-black">
                {t.seat(s + 1)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
