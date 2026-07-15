import { ChatPanel, VoiceBar, type VoicePeerChip } from '@jaffre/ui';
import { useChatSend } from '../chat/useChatSend.js';
import { useGameStore } from '../state/gameStore.js';
import { useVoiceStore } from '../state/voiceStore.js';
import { joinVoice, leaveVoice, toggleMute } from '../voice/rtc.js';

export interface CommsProps {
  /** Your absolute seat, or null when spectating (voice needs a seat). */
  readonly me: number | null;
}

/** Resolve the other humans' voice presence into chips, keyed off the roster. */
function useVoicePeers(me: number | null): VoicePeerChip[] {
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

/** Owns the online-room comms: voice bar + chat panel (rendered in the utility row). */
export function Comms({ me }: CommsProps) {
  const voice = useVoiceStore();
  const chat = useGameStore((s) => s.chat);
  const voicePeers = useVoicePeers(me);
  const sendChat = useChatSend();
  return (
    <>
      {me !== null && (
        <VoiceBar
          status={voice.status}
          {...(voice.error !== null ? { errorMessage: voice.error } : {})}
          peers={voicePeers}
          muted={voice.muted}
          speaking={voice.speaking}
          onJoin={() => void joinVoice()}
          onLeave={leaveVoice}
          onToggleMute={toggleMute}
        />
      )}
      <ChatPanel collapsible entries={chat} onSend={sendChat} />
    </>
  );
}
