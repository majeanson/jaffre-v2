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
  // On a bidding turn the centered bet panel owns the middle-to-bottom of the
  // stage; BidOverlay renders the coach tip stacked above it there, so the
  // bottom-anchored hint below would only duplicate it (and get overlapped).
  const bidding = Boolean(bidOverlay);
  return (
    <div className="relative w-full max-w-[min(96vw,100rem)] min-h-0 flex-1">
      {/* The green felt playing surface — a discrete oval on the arcade ground.
          On a phone it swells to nearly the whole stage so no space is wasted;
          on desktop, where there's room to breathe, it keeps its margins. */}
      <div
        aria-hidden
        className="felt-oval pointer-events-none absolute inset-[7%] rounded-[46%] max-sm:inset-x-[2%] max-sm:inset-y-[3%]"
      />
      {/* Trick insets keep cards clear of the seat chips. On phones the box
          widens with the felt so the bigger cards use the space. */}
      <div className="absolute inset-x-[21%] inset-y-[13%] z-10 max-sm:inset-x-[15%] max-sm:inset-y-[10%]">
        <TrickArea plays={trickPlays} sweepTo={sweepTo} highlight={winnerPosition} size="lg" />
      </div>
      {banner !== null && <TrickBanner banner={banner} />}
      {banner === null && !bidding && coachTip !== null && coachTip !== '' && (
        <CoachHint tip={coachTip} />
      )}
      {/* Desktop: full nameplates on the rim (there's space to show "Marcel ·
          bot"). Phone: compact avatar tokens pulled ONTO the felt, diagonally
          offset beside their own played card, so the rim isn't dead space.
          z-20 keeps the chips — and everything they pop up (tap peek, bid
          bubble, bot-swap countdown) — ABOVE the played cards: an outer z-0
          would trap those popovers under the trick no matter their own z.
          The seat positions are chosen to stay clear of the card slots.
          top-4 keeps the top chip (and its bid bubble) below the top bar. */}
      <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2 max-sm:top-[3%] max-sm:left-[30%]">
        <SeatChip info={seatInfo(2)} compact />
      </div>
      {/* Position 1 sits low on the left (not mid-rim) — the table reads as an
          anti-clockwise turn of the classic N/S/E/W diamond. Its peek opens
          upward so it can't spill past the stage's bottom edge. */}
      {/* Phone: your own chip lives right of the utility bar (UtilityRow), so
          the felt's bottom rim is free — this seat hugs the bottom-left corner
          instead of floating mid-rim, keeping the middle clear for cards. */}
      <div className="absolute bottom-[4%] left-0 z-20 max-sm:bottom-[4%] max-sm:left-[2%]">
        <SeatChip info={seatInfo(1)} compact peekAlign="start" peekPlacement="up" />
      </div>
      <div className="absolute right-0 top-1/2 z-20 -translate-y-1/2 max-sm:right-[2%] max-sm:top-[34%]">
        <SeatChip info={seatInfo(3)} compact peekAlign="end" />
      </div>
      {bidOverlay}
    </div>
  );
}
