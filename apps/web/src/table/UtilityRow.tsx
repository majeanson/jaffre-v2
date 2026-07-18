import { ARCADE } from '@jaffre/ui';
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

/** A full-height ink separator between the bar's cells. */
function Divider() {
  return <span aria-hidden className={`${ARCADE.divider} self-stretch`} />;
}

/** Owns the slim row above the hand: your chip centered, and ONE bordered bar
 * of utility buttons — last-trick, chat, sort — as borderless cells separated
 * by ink lines (the bar owns the border/shadow, not each button). */
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
      <span aria-hidden />
      {/* Your own seat, centered under the felt — the bottom seat mirroring the
          top opponent, so all four players read as sat around the table. */}
      <span className="justify-self-center">
        <SeatChip info={you} peekPlacement="up" />
      </span>
      {/* No overflow-hidden here: the last-trick and chat popovers anchor to
          their cells and must escape the bar's box. */}
      <span className="flex items-stretch justify-self-end rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[2px] shadow-(--shadow-ap-sm)">
        <LastTrickPeek trick={lastTrick} defaultOpen={defaultLastTrickOpen} />
        {hasComms && <Divider />}
        {comms}
        {hasSort && <Divider />}
        {sort}
      </span>
    </div>
  );
}
