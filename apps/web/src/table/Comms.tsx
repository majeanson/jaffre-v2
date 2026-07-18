import { ChatPanel } from '@jaffre/ui';
import type { ReactNode } from 'react';
import { useChatSend } from '../chat/useChatSend.js';
import { useGameStore } from '../state/gameStore.js';

export interface CommsProps {
  /** Mount with the chat popover already open (scene viewer). */
  readonly defaultChatOpen?: boolean;
  /** Voice controls — rendered inside the chat panel next to Send. */
  readonly voice?: ReactNode;
}

/** Owns the online-room chat (utility row); voice sits in the chat's send row. */
export function Comms({ defaultChatOpen = false, voice }: CommsProps) {
  const chat = useGameStore((s) => s.chat);
  const sendChat = useChatSend();
  return (
    <ChatPanel
      collapsible
      defaultOpen={defaultChatOpen}
      entries={chat}
      onSend={sendChat}
      actions={voice}
    />
  );
}
