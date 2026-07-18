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
}

/** Owns the centered auction controls shown over the stage on your bidding turn. */
export function BidOverlay({
  options,
  order,
  onAction,
  recommended = null,
  hailMary12 = false,
}: BidOverlayProps) {
  const coaching = recommended !== null;
  const recommendedOption: BidOption | null =
    recommended !== null && recommended.kind === 'bid'
      ? { value: recommended.value, sansAtout: recommended.sansAtout }
      : null;
  return (
    <div className="absolute inset-0 z-20 grid place-items-center">
      <BetCards
        options={options}
        {...(order !== undefined ? { order } : {})}
        coaching={coaching}
        recommended={recommendedOption}
        hailMary12={hailMary12}
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
