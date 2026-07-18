import { useGameStore } from '../state/gameStore.js';

/**
 * App-icon badge (installed app only): a dot while it's your turn and the tab
 * is hidden — the "come back, the table's waiting" signal. Cleared the moment
 * the tab is visible again or the turn passes. No-op where unsupported.
 */
interface BadgingNavigator {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export function initBadge(): void {
  const nav = navigator as BadgingNavigator;
  if (nav.setAppBadge === undefined) return;

  const sync = () => {
    const s = useGameStore.getState();
    const myTurn =
      typeof s.viewer === 'number' &&
      s.view !== null &&
      s.view.turn === s.viewer &&
      s.view.phase !== 'game_over';
    if (myTurn && document.visibilityState === 'hidden') {
      nav.setAppBadge?.().catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  };

  useGameStore.subscribe(sync);
  document.addEventListener('visibilitychange', sync);
}
