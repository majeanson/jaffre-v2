import { VoiceBar } from '@jaffre/ui';
import { useVoiceStore } from '../state/voiceStore.js';
import { joinVoice, leaveVoice, toggleMute } from './rtc.js';
import { useVoicePeers } from './useVoicePeers.js';

export interface VoiceControlsProps {
  /** Your absolute seat — voice needs a seat to place you in the mesh. */
  readonly me: number;
}

/**
 * The voice bar wired to the RTC mesh: join/leave/mute plus live peer chips.
 * Shared by the in-game table and the lobby so table-mates can talk while
 * still picking seats.
 */
export function VoiceControls({ me }: VoiceControlsProps) {
  const voice = useVoiceStore();
  const peers = useVoicePeers(me);
  return (
    <VoiceBar
      status={voice.status}
      {...(voice.error !== null ? { errorMessage: voice.error } : {})}
      peers={peers}
      muted={voice.muted}
      speaking={voice.speaking}
      onJoin={() => void joinVoice()}
      onLeave={leaveVoice}
      onToggleMute={toggleMute}
    />
  );
}
