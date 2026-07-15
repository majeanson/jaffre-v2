import { create } from 'zustand';

export type VoiceStatus = 'idle' | 'joining' | 'live' | 'error';

export interface VoicePeerState {
  readonly connected: boolean;
  readonly muted: boolean;
  readonly speaking: boolean;
}

interface VoiceStore {
  status: VoiceStatus;
  error: string | null;
  muted: boolean;
  speaking: boolean;
  /** Per-seat state of the other humans in voice, keyed by absolute seat. */
  peers: Readonly<Record<number, VoicePeerState>>;

  setStatus: (status: VoiceStatus, error?: string) => void;
  setSelf: (partial: { muted?: boolean; speaking?: boolean }) => void;
  setPeer: (seat: number, partial: Partial<VoicePeerState>) => void;
  removePeer: (seat: number) => void;
  reset: () => void;
}

const DEFAULT_PEER: VoicePeerState = { connected: false, muted: false, speaking: false };

export const useVoiceStore = create<VoiceStore>((set) => ({
  status: 'idle',
  error: null,
  muted: false,
  speaking: false,
  peers: {},

  setStatus: (status, error) => set({ status, error: error ?? null }),
  setSelf: (partial) => set(partial),
  setPeer: (seat, partial) =>
    set((s) => ({
      peers: { ...s.peers, [seat]: { ...(s.peers[seat] ?? DEFAULT_PEER), ...partial } },
    })),
  removePeer: (seat) =>
    set((s) => ({
      peers: Object.fromEntries(Object.entries(s.peers).filter(([k]) => Number(k) !== seat)),
    })),
  reset: () => set({ status: 'idle', error: null, muted: false, speaking: false, peers: {} }),
}));
