import type { ReactNode } from 'react';
import { LastTrickPeek } from './LastTrickPeek.js';
import type { LastTrickInfo } from './useTableDerived.js';

export interface UtilityRowProps {
  /** Previous trick for the peek popover; null hides the button. */
  readonly lastTrick: LastTrickInfo | null;
  /** Scene viewer: mount with the peek popover already open. */
  readonly defaultLastTrickOpen?: boolean;
  /** Voice + chat controls slot (online rooms only). */
  readonly comms?: ReactNode;
  /** Sort-hand button — grouped with chat at the row's end. */
  readonly sort?: ReactNode;
}

/**
 * The table's slim controls: last-trick peek, chat, and hand-sort. On desktop
 * it floats over the hand's empty side gutters (last-trick left, chat + sort
 * right) so it costs no vertical space; on a phone — where the fan spans the
 * full width — it drops to a centred slim row just above the hand instead.
 * Your own seat is no longer here: it's the diamond's bottom vertex on the
 * stage (see Stage), sitting right above this row.
 */
export function UtilityRow({ lastTrick, defaultLastTrickOpen = false, comms, sort }: UtilityRowProps) {
  const hasComms = comms !== undefined && comms !== null && comms !== false;
  const hasSort = sort !== undefined && sort !== null && sort !== false;
  return (
    <div className="pointer-events-none z-30 flex w-full max-w-[min(96vw,100rem)] items-center gap-2 px-3 max-sm:justify-center max-sm:py-1 sm:absolute sm:inset-x-0 sm:bottom-1 sm:justify-between sm:px-4">
      <span className="pointer-events-auto flex items-center">
        {lastTrick !== null && (
          <LastTrickPeek trick={lastTrick} defaultOpen={defaultLastTrickOpen} />
        )}
      </span>
      <span className="pointer-events-auto flex items-center gap-1.5">
        {comms}
        {hasComms && hasSort && (
          <span aria-hidden className="h-[1.6em] w-[2px] rounded-full bg-(--color-ap-ink)" />
        )}
        {sort}
      </span>
    </div>
  );
}
