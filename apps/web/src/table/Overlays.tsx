import type { SeatView } from '@jaffre/engine';
import type { Roster } from '@jaffre/protocol';
import { useGameStore } from '../state/gameStore.js';
import { GameRecap } from './GameRecap.js';
import { RoundSummaryOverlay } from './RoundSummaryOverlay.js';

export interface OverlaysProps {
  readonly view: SeatView;
  readonly roster: Roster;
  readonly onRematch?: (() => void) | undefined;
  readonly onLeave: () => void;
}

/** Owns the modal layer: round summary between rounds, game recap at the end. */
export function Overlays({ view, roster, onRematch, onLeave }: OverlaysProps) {
  // Every scored round this game — feeds the end-of-game recap.
  const rounds = useGameStore((s) => s.roundHistory);
  return (
    <>
      {view.phase === 'round_over' && view.lastRoundSummary !== null && (
        <RoundSummaryOverlay
          summary={view.lastRoundSummary}
          contractName={roster.seats[view.lastRoundSummary.contract.seat]?.name ?? 'Player'}
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
