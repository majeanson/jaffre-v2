import { ChatPanel } from '@jaffre/ui';
import { useChatSend } from '../chat/useChatSend.js';
import { useGameStore } from '../state/gameStore.js';
import { VoiceControls } from '../voice/VoiceControls.js';

export interface CommsProps {
  /** Your absolute seat, or null when spectating (voice needs a seat). */
  readonly me: number | null;
  /** Mount with the chat popover already open (scene viewer). */
  readonly defaultChatOpen?: boolean;
}

/** Owns the online-room comms: voice bar + chat panel (rendered in the utility row). */
export function Comms({ me, defaultChatOpen = false }: CommsProps) {
  const chat = useGameStore((s) => s.chat);
  const sendChat = useChatSend();
  return (
    <>
      {me !== null && <VoiceControls me={me} />}
      <ChatPanel collapsible defaultOpen={defaultChatOpen} entries={chat} onSend={sendChat} />
    </>
  );
}
