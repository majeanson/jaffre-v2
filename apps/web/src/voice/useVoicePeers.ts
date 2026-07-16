import type { VoicePeerChip } from '@jaffre/ui';
import { useGameStore } from '../state/gameStore.js';
import { useVoiceStore } from '../state/voiceStore.js';

/** Resolve the other humans' voice presence into chips, keyed off the roster. */
export function useVoicePeers(me: number | null): VoicePeerChip[] {
  const roster = useGameStore((s) => s.roster);
  const peers = useVoiceStore((s) => s.peers);
  if (me === null || roster === null) return [];
  return roster.seats.flatMap((s, i) => {
    if (s === null || s.isBot || i === me) return [];
    const p = peers[i];
    return [
      {
        name: s.name,
        connected: p?.connected ?? false,
        muted: p?.muted ?? false,
        speaking: p?.speaking ?? false,
      },
    ];
  });
}
