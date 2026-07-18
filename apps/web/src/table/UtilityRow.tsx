import type { ReactNode } from 'react';
import { LastTrickPeek } from './LastTrickPeek.js';
import { SeatChip } from './SeatChip.js';
import type { LastTrickInfo, SeatChipInfo } from './useTableDerived.js';

export interface UtilityRowProps {
  /** Your own seat chip (table-relative position 0). */
  readonly you: SeatChipInfo | null;
  /** Previous trick for the peek popover; null hides the button. */
  readonly lastTrick: LastTrickInfo | null;
  /** Scene viewer: mount with the peek popover already open. */
  readonly defaultLastTrickOpen?: boolean;
  /** Voice + chat controls slot (online rooms only). */
  readonly comms?: ReactNode;
  /** Sort-hand button — grouped with chat at the row's end. */
  readonly sort?: ReactNode;
}

/** Owns the slim row above the hand: your chip, last-trick peek, chat + sort. */
export function UtilityRow({
  you,
  lastTrick,
  defaultLastTrickOpen = false,
  comms,
  sort,
}: UtilityRowProps) {
  const hasComms = comms !== undefined && comms !== null && comms !== false;
  const hasSort = sort !== undefined && sort !== null && sort !== false;
  return (
    <div className="relative z-30 grid w-full max-w-[min(96vw,100rem)] grid-cols-[1fr_auto_1fr] items-center gap-2 py-1">
      <span className="flex items-center gap-2 justify-self-start">
        {lastTrick !== null && (
          <LastTrickPeek trick={lastTrick} defaultOpen={defaultLastTrickOpen} />
        )}
      </span>
      {/* Your own seat, centered under the felt — the bottom seat mirroring the
          top opponent, so all four players read as sat around the table. */}
      <span className="justify-self-center">
        <SeatChip info={you} peekPlacement="up" />
      </span>
      <span className="flex items-center gap-1.5 justify-self-end">
        {comms}
        {hasComms && hasSort && (
          <span aria-hidden className="h-[1.6em] w-[2px] rounded-full bg-(--color-ap-ink)" />
        )}
        {sort}
      </span>
    </div>
  );
}
