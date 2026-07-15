import { TrickArea } from '@jaffre/ui';
import type { ReactNode } from 'react';
import { SeatChip } from './SeatChip.js';
import { TrickBanner } from './TrickBanner.js';
import type { HeldBanner, TableDerived } from './useTableDerived.js';

export interface StageProps {
  readonly trickPlays: TableDerived['trickPlays'];
  readonly sweepTo: TableDerived['sweepTo'];
  readonly banner: HeldBanner | null;
  readonly seatInfo: TableDerived['seatInfo'];
  /** Auction controls, rendered over the stage on your bidding turn. */
  readonly bidOverlay?: ReactNode;
}

/** Owns the center stage: trick area, opponents' seat chips, trick banner, bid overlay. */
export function Stage({ trickPlays, sweepTo, banner, seatInfo, bidOverlay }: StageProps) {
  return (
    <div className="relative w-full max-w-[min(96vw,100rem)] min-h-0 flex-1">
      {/* Trick insets keep cards clear of the seat chips; cards render above
          chips as a fallback so a chip never covers a played card. */}
      <div className="absolute inset-x-[21%] inset-y-[13%] z-10 max-sm:inset-x-[22%] max-sm:inset-y-[14%]">
        <TrickArea plays={trickPlays} sweepTo={sweepTo} />
      </div>
      {banner !== null && <TrickBanner banner={banner} />}
      {/* top-4 keeps the top chip (and its bid bubble) below the top bar */}
      <div className="absolute top-4 left-1/2 z-0 -translate-x-1/2">
        <SeatChip info={seatInfo(2)} compact />
      </div>
      <div className="absolute left-0 top-1/2 z-0 -translate-y-1/2">
        <SeatChip info={seatInfo(1)} compact />
      </div>
      <div className="absolute right-0 top-1/2 z-0 -translate-y-1/2">
        <SeatChip info={seatInfo(3)} compact />
      </div>
      {bidOverlay}
    </div>
  );
}
