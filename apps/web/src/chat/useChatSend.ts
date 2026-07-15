import { useCallback, useRef } from 'react';
import { send } from '../net/socket.js';

/** Client-side chat throttle: ~1 msg/sec, rejected sends show "slow down". */
export function useChatSend(): (text: string) => boolean {
  const lastAt = useRef(0);
  return useCallback((text: string) => {
    const now = Date.now();
    if (now - lastAt.current < 1000) return false;
    lastAt.current = now;
    send({ t: 'chat', text });
    return true;
  }, []);
}
