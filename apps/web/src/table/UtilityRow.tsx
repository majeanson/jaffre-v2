import type { ReactNode } from 'react';
import { LastTrickPeek } from './LastTrickPeek.js';
import { SeatChip } from './SeatChip.js';
import type { LastTrickInfo, SeatChipInfo } from './useTableDerived.js';

export interface UtilityRowProps {
  /** Your own seat chip (table-relative position 0). */
  readonly you: SeatChipInfo | null;
  /** Previous trick for the peek popover; null hides the button. */
  readonly lastTrick: LastTrickInfo | null;
  /** Voice + chat controls slot (online rooms only). */
  readonly comms?: ReactNode;
}

/** Owns the slim row above the hand: your chip, last-trick peek, comms. */
export function UtilityRow({ you, lastTrick, comms }: UtilityRowProps) {
  return (
    <div className="relative z-30 flex w-full max-w-[min(96vw,100rem)] items-center gap-2 py-1">
      <SeatChip info={you} />
      {lastTrick !== null && (
        <LastTrickPeek
          cards={lastTrick.cards}
          winnerName={lastTrick.winnerName}
          points={lastTrick.points}
        />
      )}
      <span className="ml-auto flex items-center gap-2">{comms}</span>
    </div>
  );
}
