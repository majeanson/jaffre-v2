import { TrickArea } from '@jaffre/ui';
import type { ReactNode } from 'react';
import { CoachHint } from './CoachHint.js';
import { SeatChip } from './SeatChip.js';
import { TrickBanner } from './TrickBanner.js';
import type { HeldBanner, TableDerived } from './useTableDerived.js';

export interface StageProps {
  readonly trickPlays: TableDerived['trickPlays'];
  readonly sweepTo: TableDerived['sweepTo'];
  readonly banner: HeldBanner | null;
  /** Winning card's position while the resolved trick is held (glow). */
  readonly winnerPosition: 0 | 1 | 2 | 3 | null;
  readonly seatInfo: TableDerived['seatInfo'];
  /** Auction controls, rendered over the stage on your bidding turn. */
  readonly bidOverlay?: ReactNode;
  /** The Coach's one-line tip, shown when a trick result isn't already up. */
  readonly coachTip?: string | null;
}

/** Owns the center stage: trick area, opponents' seat chips, trick banner, bid overlay. */
export function Stage({
  trickPlays,
  sweepTo,
  banner,
  winnerPosition,
  seatInfo,
  bidOverlay,
  coachTip = null,
}: StageProps) {
  return (
    <div className="relative flex w-full max-w-[min(96vw,100rem)] min-h-0 flex-1 items-center justify-center">
      {/* Feltless arena: a soft violet pool of light gives the trick a centre of
          gravity without a hard table edge. */}
      <div
        aria-hidden
        className="arena-glow pointer-events-none absolute left-1/2 top-1/2 size-[min(88%,44rem)] -translate-x-1/2 -translate-y-1/2 rounded-full"
      />
      {/* Bounded, centred arena — a dense diamond that reads full in every state
          (one card, two, or four). The four seats hug the cluster's N/W/E/S
          vertices, each beside its own played card. Capped so ultra-wide screens
          keep calm margins instead of a stretched void. */}
      <div className="relative h-full max-h-[40rem] w-full max-w-[46rem]">
        {/* The trick cluster — the biggest cards on the table. They render above
            the seat chips so a chip never covers a played card. */}
        <div className="absolute inset-x-[26%] inset-y-[17%] z-10 max-sm:inset-x-[24%] max-sm:inset-y-[15%]">
          <TrickArea plays={trickPlays} sweepTo={sweepTo} highlight={winnerPosition} size="xl" />
        </div>
        {/* Fused seats — pulled in beside their card, not stranded at the frame. */}
        <div className="absolute top-0 left-1/2 z-20 -translate-x-1/2">
          <SeatChip info={seatInfo(2)} compact />
        </div>
        <div className="absolute left-[4%] top-1/2 z-20 -translate-y-1/2 max-sm:left-0">
          <SeatChip info={seatInfo(1)} compact peekAlign="start" />
        </div>
        <div className="absolute right-[4%] top-1/2 z-20 -translate-y-1/2 max-sm:right-0">
          <SeatChip info={seatInfo(3)} compact peekAlign="end" />
        </div>
        {/* You — the diamond's bottom vertex, right above your hand. */}
        <div className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2">
          <SeatChip info={seatInfo(0)} compact peekPlacement="up" />
        </div>
      </div>
      {banner !== null && <TrickBanner banner={banner} />}
      {banner === null && coachTip !== null && coachTip !== '' && <CoachHint tip={coachTip} />}
      {bidOverlay}
    </div>
  );
}
