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
      <div className="absolute inset-x-[16%] inset-y-[10%] max-sm:inset-x-[20%] max-sm:inset-y-[12%]">
        <TrickArea plays={trickPlays} sweepTo={sweepTo} />
      </div>
      {banner !== null && <TrickBanner text={banner.text} special={banner.special} />}
      <div className="absolute top-0 left-1/2 z-10 -translate-x-1/2">
        <SeatChip info={seatInfo(2)} compact />
      </div>
      <div className="absolute left-0 top-1/2 z-10 -translate-y-1/2">
        <SeatChip info={seatInfo(1)} compact />
      </div>
      <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2">
        <SeatChip info={seatInfo(3)} compact />
      </div>
      {bidOverlay}
    </div>
  );
}
