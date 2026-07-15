import type { ReactNode } from 'react';
import { GHOST_BTN_SM } from '../components/buttonStyles.js';
import { LastTrickPeek } from './LastTrickPeek.js';
import { SeatChip } from './SeatChip.js';
import type { LastTrickInfo, SeatChipInfo } from './useTableDerived.js';

export interface UtilityRowProps {
  /** Your own seat chip (table-relative position 0). */
  readonly you: SeatChipInfo | null;
  /** Previous trick for the peek popover; null hides the button. */
  readonly lastTrick: LastTrickInfo | null;
  readonly logOpen: boolean;
  readonly onToggleLog: () => void;
  /** Voice + chat controls slot (online rooms only). */
  readonly comms?: ReactNode;
}

/** Owns the slim row above the hand: your chip, last-trick peek, log toggle, comms. */
export function UtilityRow({ you, lastTrick, logOpen, onToggleLog, comms }: UtilityRowProps) {
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
      <button type="button" aria-expanded={logOpen} onClick={onToggleLog} className={GHOST_BTN_SM}>
        Log
      </button>
      <span className="ml-auto flex items-center gap-2">{comms}</span>
    </div>
  );
}
