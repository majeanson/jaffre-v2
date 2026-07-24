/**
 * Thin loader around the YouTube IFrame Player API. The API script is only
 * injected once, on first use — i.e. after a user chose to listen — never at
 * page load. If `window.YT` already exists (Playwright installs a stub via
 * addInitScript), we resolve to it without touching the network.
 */

export interface YTPlayer {
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  setVolume(volume: number): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      width: number | string;
      height: number | string;
      playerVars: Record<string, number>;
      events: {
        onReady?: (() => void) | undefined;
        onStateChange?: ((e: { data: number }) => void) | undefined;
        onError?: ((e: { data: number }) => void) | undefined;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** YT.PlayerState.ENDED — stable public constant, usable before the API loads. */
export const YT_ENDED = 0;
export const YT_PLAYING = 1;

let apiPromise: Promise<YTNamespace> | null = null;

export function loadIframeApi(): Promise<YTNamespace> {
  apiPromise ??= new Promise<YTNamespace>((resolve) => {
    if (window.YT?.Player !== undefined) {
      resolve(window.YT);
      return;
    }
    window.onYouTubeIframeAPIReady = () => {
      if (window.YT !== undefined) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function createPlayer(
  el: HTMLElement,
  events: {
    onReady?: () => void;
    onStateChange?: (state: number) => void;
    onError?: (code: number) => void;
  },
  yt: YTNamespace,
): YTPlayer {
  return new yt.Player(el, {
    width: '100%',
    height: '100%',
    // No autoplay: playback always starts from our own playVideo() call,
    // which itself descends from the user's "Listen" click.
    playerVars: { autoplay: 0, playsinline: 1, controls: 0, disablekb: 1, rel: 0 },
    events: {
      onReady: events.onReady,
      onStateChange: (e) => events.onStateChange?.(e.data),
      onError: (e) => events.onError?.(e.data),
    },
  });
}
