import type { BidChoice } from '@jaffre/engine';
import type { ClientAction } from '@jaffre/protocol';
import { BetCards, type AuctionTurn, type BidOption } from '@jaffre/ui';
import { feedback } from '../audio/clicks.js';

export interface BidOverlayProps {
  readonly options: readonly BidOption[];
  /** The four seats in bidding order — who bid what, who's up, who waits. */
  readonly order?: readonly AuctionTurn[];
  readonly onAction: (action: ClientAction) => void;
  /** The Coach's suggested bid on this turn, when it's switched on. */
  readonly recommended?: BidChoice | null;
  /** True when the "Hail-Mary 12 sans atout" house rule is on this game. */
  readonly hailMary12?: boolean;
  /** Another seat is up: keep the auction visible but lock every card. */
  readonly waiting?: boolean;
}

/** Owns the centered auction panel shown over the stage for the whole bidding phase. */
export function BidOverlay({
  options,
  order,
  onAction,
  recommended = null,
  hailMary12 = false,
  waiting = false,
}: BidOverlayProps) {
  const coaching = recommended !== null;
  const recommendedOption: BidOption | null =
    recommended !== null && recommended.kind === 'bid'
      ? { value: recommended.value, sansAtout: recommended.sansAtout }
      : null;
  return (
    // pointer-events: only the panel itself catches taps — the seat chips
    // around it stay peekable while the auction goes around the table.
    // z-[15]: above the trick area (z-10) but below the seat chips (z-20),
    // so a chip's peek popover opens OVER the auction panel, never under it.
    <div className="pointer-events-none absolute inset-0 z-[15] grid place-items-center *:pointer-events-auto">
      <BetCards
        options={options}
        {...(order !== undefined ? { order } : {})}
        coaching={coaching}
        recommended={recommendedOption}
        hailMary12={hailMary12}
        waiting={waiting}
        onPass={() => {
          feedback('play');
          onAction({ type: 'place_bid', choice: { kind: 'pass' } });
        }}
        onBid={(o) => {
          feedback('play');
          onAction({
            type: 'place_bid',
            choice: { kind: 'bid', value: o.value, sansAtout: o.sansAtout },
          });
        }}
      />
    </div>
  );
}
