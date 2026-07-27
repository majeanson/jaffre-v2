import { useEffect, useRef, useState } from 'react';
import { ARCADE, useLang, type Lang } from '@jaffre/ui';
import { send } from '../net/socket.js';
import { useGameStore } from '../state/gameStore.js';
import { useMusicStore } from '../state/musicStore.js';
import { createPlayer, loadIframeApi, YT_ENDED, type YTPlayer } from './youtube.js';

const T: Record<
  Lang,
  {
    nowPlaying: string;
    listen: string;
    stop: string;
    emptyQueue: string;
    minimize: string;
    expand: string;
    volume: string;
  }
> = {
  en: {
    nowPlaying: 'Music playing at this table',
    listen: 'Listen',
    stop: 'Stop listening',
    emptyQueue: 'Queue is empty — add another song to keep it going.',
    minimize: 'Hide the video (music keeps playing)',
    expand: 'Show the video',
    volume: 'Your volume',
  },
  fr: {
    nowPlaying: 'Musique en cours à cette table',
    listen: 'Écouter',
    stop: 'Couper la musique',
    emptyQueue: 'File vide — ajoute une autre chanson pour continuer.',
    minimize: 'Cacher la vidéo (la musique continue)',
    expand: 'Montrer la vidéo',
    volume: 'Ton volume',
  },
};

/** Beyond this many seconds of drift from the room's shared position we snap
 * back with a seek; below it, YouTube's own pacing is close enough. */
const DRIFT_TOLERANCE_S = 2.5;
const DRIFT_CHECK_MS = 15_000;

/** The room's shared playhead in seconds — server clock via clockSkew. */
function targetSeconds(startedAt: number): number {
  const skew = useGameStore.getState().clockSkew;
  return Math.max(0, (Date.now() + skew - startedAt) / 1000);
}

/**
 * The ONE persistent YouTube player for the room, mounted at App level so it
 * survives every lobby/table screen swap — audio never gaps across the
 * transition. Collapsed it's a pill advertising the track with a "Listen"
 * opt-in (the autoplay-policy user gesture); listening, it's a small dock
 * with the ToS-required visible player, its volume, and the stop control.
 * Playback lives here and only here; RoomComms' music tab is the queue
 * editor (add / skip / remove) over the same shared store.
 */
export function MusicDock() {
  const t = T[useLang()];
  const { state, listening, volume, setListening, setVolume } = useMusicStore();
  const current = state?.current ?? null;
  const [minimized, setMinimized] = useState(false);
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  /** The entry id the player is currently loaded with — guards late ENDED /
   * error events from a track the room already moved past. */
  const loadedIdRef = useRef<string | null>(null);
  const currentIdRef = useRef<string | null>(null);
  currentIdRef.current = current?.id ?? null;

  // Create/destroy the player with the listening opt-in. The holder div only
  // exists while listening (the dock renders it), so this effect runs after it
  // is in the DOM.
  useEffect(() => {
    if (!listening) return undefined;
    const holder = holderRef.current;
    if (holder === null) return undefined;
    let cancelled = false;
    // The API replaces the target element — give it a disposable child.
    const target = document.createElement('div');
    holder.appendChild(target);
    void loadIframeApi().then((yt) => {
      if (cancelled) return;
      playerRef.current = createPlayer(
        target,
        {
          onReady: () => setPlayerReady(true),
          onStateChange: (playerState) => {
            const id = loadedIdRef.current;
            if (playerState === YT_ENDED && id !== null && id === currentIdRef.current) {
              send({ t: 'music_ended', id });
            }
          },
          onError: () => {
            const id = loadedIdRef.current;
            if (id !== null && id === currentIdRef.current) send({ t: 'music_error', id });
          },
        },
        yt,
      );
    });
    return () => {
      cancelled = true;
      setPlayerReady(false);
      loadedIdRef.current = null;
      playerRef.current?.destroy();
      playerRef.current = null;
      holder.replaceChildren();
    };
  }, [listening]);

  // Load whatever the room is playing, seeked to the shared position.
  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || player === null) return;
    if (current === null) {
      loadedIdRef.current = null;
      player.pauseVideo();
      return;
    }
    if (loadedIdRef.current === current.id) return;
    loadedIdRef.current = current.id;
    player.loadVideoById({
      videoId: current.videoId,
      startSeconds: targetSeconds(current.startedAt),
    });
    player.setVolume(useMusicStore.getState().volume);
    player.playVideo();
  }, [playerReady, current]);

  // Local volume, applied live.
  useEffect(() => {
    if (playerReady) playerRef.current?.setVolume(volume);
  }, [playerReady, volume]);

  // Gentle drift correction against the room's shared playhead.
  useEffect(() => {
    if (!playerReady || current === null) return undefined;
    const startedAt = current.startedAt;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (player === null) return;
      const target = targetSeconds(startedAt);
      if (Math.abs(player.getCurrentTime() - target) > DRIFT_TOLERANCE_S) {
        player.seekTo(target, true);
      }
    }, DRIFT_CHECK_MS);
    return () => clearInterval(interval);
  }, [playerReady, current]);

  // Nothing to advertise and not opted in — no dock at all.
  if (state === null || (current === null && !listening)) return null;

  // Collapsed pill: the track is playing for others; one click opts in.
  if (!listening) {
    if (current === null) return null;
    return (
      <div
        data-testid="music-pill"
        className={`${ARCADE.popover} fixed bottom-3 left-3 z-40 flex max-w-64 items-center gap-2 p-1.5`}
      >
        {current.thumb !== '' && (
          <img src={current.thumb} alt="" className="h-8 w-10 shrink-0 rounded object-cover" />
        )}
        <span
          className="min-w-0 flex-1 truncate text-xs text-(--color-ap-text)"
          title={t.nowPlaying}
        >
          {current.title}
        </span>
        <button
          type="button"
          data-testid="music-pill-listen"
          onClick={() => {
            setMinimized(false);
            setListening(true);
          }}
          className="shrink-0 cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-2 py-1 font-arcade-display text-[0.6em] uppercase text-(--color-ap-ink) shadow-(--shadow-ap-sm)"
        >
          {t.listen}
        </button>
      </div>
    );
  }

  // Listening: the dock with the player. Minimizing must NOT unmount or
  // destroy the iframe — that is what stops the audio — so the holder stays
  // in the DOM and is only visually collapsed. "Stop" remains the way to
  // actually end playback.
  return (
    <div
      data-testid="music-dock"
      className={`${ARCADE.popover} fixed bottom-3 left-3 z-40 flex flex-col gap-1.5 p-1.5 ${
        minimized ? 'max-w-[calc(100vw-1.5rem)]' : 'w-80 max-w-[calc(100vw-1.5rem)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-(--color-ap-text)">
          {current?.title ?? t.emptyQueue}
        </span>
        <button
          type="button"
          data-testid={minimized ? 'music-expand' : 'music-minimize'}
          onClick={() => setMinimized(!minimized)}
          aria-label={minimized ? t.expand : t.minimize}
          title={minimized ? t.expand : t.minimize}
          className="shrink-0 cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-2 py-1 font-arcade-display text-[0.6em] uppercase text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
        >
          {minimized ? '▴' : '▾'}
        </button>
        <button
          type="button"
          data-testid="music-stop"
          onClick={() => setListening(false)}
          className="shrink-0 cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-2 py-1 font-arcade-display text-[0.6em] uppercase text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
        >
          {t.stop}
        </button>
      </div>
      {/* Volume sits with the player it controls — it used to live in the
          queue panel, two surfaces away from the sound. */}
      {!minimized && (
        <label className="flex items-center gap-2 px-0.5 text-[11px] text-(--color-ap-muted)">
          <span className="shrink-0">{t.volume}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            aria-label={t.volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="min-w-0 flex-1 accent-(--color-ap-gold)"
          />
        </label>
      )}
      <div
        ref={holderRef}
        data-testid="music-player"
        aria-hidden={minimized}
        className={
          minimized
            ? // Collapsed, not display:none — some mobile browsers pause a
              // media iframe that leaves layout entirely; 1px keeps it "live".
              'pointer-events-none absolute bottom-0 left-0 h-px w-px overflow-hidden opacity-0 [&_iframe]:h-full [&_iframe]:w-full'
            : 'h-[200px] w-full overflow-hidden rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-black [&_iframe]:h-full [&_iframe]:w-full'
        }
      />
    </div>
  );
}
