import type { SeatView } from '@jaffre/engine';
import type { Roster } from '@jaffre/protocol';
import { useGameStore } from '../state/gameStore.js';
import { GameRecap } from './GameRecap.js';
import { RoundSummaryOverlay } from './RoundSummaryOverlay.js';

export interface OverlaysProps {
  readonly view: SeatView;
  readonly roster: Roster;
  /** Your absolute seat, or null when spectating. */
  readonly me: number | null;
  /** Declare readiness for the next round. */
  readonly onReady: () => void;
  readonly onRematch?: (() => void) | undefined;
  readonly onLeave: () => void;
}

/** Owns the modal layer: round summary between rounds, game recap at the end. */
export function Overlays({ view, roster, me, onReady, onRematch, onLeave }: OverlaysProps) {
  // Every scored round this game — feeds the end-of-game recap.
  const rounds = useGameStore((s) => s.roundHistory);
  const readySeats = roster.seats.map((s) => s?.ready ?? s?.isBot ?? false);
  return (
    <>
      {view.phase === 'round_over' && view.lastRoundSummary !== null && (
        <RoundSummaryOverlay
          summary={view.lastRoundSummary}
          contractName={roster.seats[view.lastRoundSummary.contract.seat]?.name ?? 'Player'}
          names={roster.seats.map((s) => s?.name ?? '—')}
          readySeats={readySeats}
          youReady={me !== null ? (readySeats[me] ?? false) : true}
          onReady={onReady}
        />
      )}
      {view.phase === 'game_over' && (
        <GameRecap
          winner={view.winner as 0 | 1}
          scores={view.scores}
          rounds={rounds}
          names={roster.seats.map((s) => s?.name ?? '—')}
          onRematch={onRematch}
          onLeave={onLeave}
        />
      )}
    </>
  );
}
