import { create } from 'zustand';
import type { MusicState } from '@jaffre/protocol';

const VOLUME_KEY = 'jaffre-music-volume';

/** Opting in with a saved volume below this floor bumps it up — pressing
 * "Listen" and hearing silence reads as "broken", not "muted". */
const LISTEN_VOLUME_FLOOR = 20;

function storedVolume(): number {
  const raw = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 60;
}

interface MusicStore {
  /** Last server music payload — the room's authoritative queue view. */
  state: MusicState | null;
  /** This user opted into hearing the room's music (the autoplay-policy
   * gesture). Off by default; never persisted — a fresh tab must re-opt-in
   * so playback always starts from a click. */
  listening: boolean;
  /** Local volume 0–100, persisted per device. */
  volume: number;

  setState: (state: MusicState) => void;
  setListening: (on: boolean) => void;
  setVolume: (volume: number) => void;
  /** Room teardown: drop room state but keep the device volume preference. */
  reset: () => void;
}

export const useMusicStore = create<MusicStore>((set) => ({
  state: null,
  listening: false,
  volume: storedVolume(),

  setState: (state) => set({ state }),
  setListening: (listening) =>
    set((prev) => {
      if (listening && prev.volume < LISTEN_VOLUME_FLOOR) {
        localStorage.setItem(VOLUME_KEY, String(LISTEN_VOLUME_FLOOR));
        return { listening, volume: LISTEN_VOLUME_FLOOR };
      }
      return { listening };
    }),
  setVolume: (volume) => {
    localStorage.setItem(VOLUME_KEY, String(volume));
    set({ volume });
  },
  reset: () => set({ state: null, listening: false }),
}));
