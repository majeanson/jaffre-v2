import { useEffect } from 'react';

let locks = 0;

/**
 * Freeze the app's real scroll container while a full-screen sheet is mounted.
 * The document never scrolls — #root is the one scroll container (tokens.css)
 * — so locking body would do nothing; a touch-drag on a sheet's backdrop
 * would still scroll the screen behind it. Re-entrant: sheets can stack.
 */
export function useScrollLock() {
  useEffect(() => {
    const root = document.getElementById('root');
    if (root === null) return undefined;
    locks += 1;
    if (locks === 1) root.style.overflow = 'hidden';
    return () => {
      locks -= 1;
      if (locks === 0) root.style.overflow = '';
    };
  }, []);
}
