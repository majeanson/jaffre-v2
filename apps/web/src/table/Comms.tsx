import { ChatPanel } from '@jaffre/ui';
import { useChatSend } from '../chat/useChatSend.js';
import { useGameStore } from '../state/gameStore.js';

export interface CommsProps {
  /** Mount with the chat popover already open (scene viewer). */
  readonly defaultChatOpen?: boolean;
}

/** Owns the online-room chat (utility row); voice lives in the header Options. */
export function Comms({ defaultChatOpen = false }: CommsProps) {
  const chat = useGameStore((s) => s.chat);
  const sendChat = useChatSend();
  return <ChatPanel collapsible defaultOpen={defaultChatOpen} entries={chat} onSend={sendChat} />;
}
