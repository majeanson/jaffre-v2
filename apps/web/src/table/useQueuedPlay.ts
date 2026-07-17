import { legalCards, sameCard } from '@jaffre/engine';
import type { ClientAction } from '@jaffre/protocol';
import { useEffect, useRef } from 'react';
import { feedback } from '../audio/clicks.js';
import { useGameStore } from '../state/gameStore.js';
import { queueStillValid } from './queue.js';

/** Pause after your turn arrives before a queued card fires — the play should
 * read as a play, not a glitch, and leave a beat to see the table. */
const QUEUE_FIRE_DELAY_MS = 400;

/**
 * Owns the queued-card lifecycle: drops the queue the moment it stops making
 * sense, and auto-plays it (through the same `onAction` as a manual tap) once
 * it's genuinely your turn and the trick-hold sweep has cleared.
 *
 * A play that would SET TRUMP (the round's first card, non-SA contract) never
 * auto-fires: the card stays queued and highlighted, and the player commits
 * it with a normal tap.
 */
export function useQueuedPlay(onAction: (action: ClientAction) => void): void {
  const { view, viewer, heldTrick, queued, setQueued } = useGameStore();

  const me = viewer === 'spectator' || viewer === null ? null : viewer;
  const myTurn = view !== null && me !== null && view.turn === me && view.phase !== 'game_over';

  // The action callback changes identity per render; keep the latest without
  // re-arming the fire timer.
  const onActionRef = useRef(onAction);
  useEffect(() => {
    onActionRef.current = onAction;
  });

  // Invalidation: a new round recycles suit/value pairs, so "still in hand"
  // alone can't tell a stale queue from a fresh deal — track roundIndex too.
  const lastRound = useRef<number | null>(null);
  useEffect(() => {
    if (view === null) return;
    const roundChanged = lastRound.current !== null && lastRound.current !== view.roundIndex;
    lastRound.current = view.roundIndex;
    if (queued === null) return;
    if (me === null || roundChanged || !queueStillValid(queued, view, me, myTurn)) {
      setQueued(null);
    }
  }, [view, me, myTurn, queued, setQueued]);

  useEffect(() => {
    if (queued === null || view === null || me === null) return;
    if (!myTurn || view.phase !== 'playing' || heldTrick !== null) return;
    if (!view.trumpDecided) return;
    const ledSuit = view.currentTrick[0]?.card.suit ?? null;
    if (!legalCards(view.hand, ledSuit).some((c) => sameCard(c, queued))) return;
    const timer = setTimeout(() => {
      // Clear before sending: the store update re-runs this effect, which now
      // no-ops — the double-fire guard.
      setQueued(null);
      feedback('play');
      onActionRef.current({ type: 'play_card', card: queued });
    }, QUEUE_FIRE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [queued, view, me, myTurn, heldTrick, setQueued]);
}
