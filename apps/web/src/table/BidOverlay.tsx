import type { ClientAction } from '@jaffre/protocol';
import { BidPanel, type BidOption } from '@jaffre/ui';

export interface BidOverlayProps {
  readonly options: readonly BidOption[];
  readonly onAction: (action: ClientAction) => void;
}

/** Owns the centered auction controls shown over the stage on your bidding turn. */
export function BidOverlay({ options, onAction }: BidOverlayProps) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center">
      <BidPanel
        options={options}
        onPass={() => onAction({ type: 'place_bid', choice: { kind: 'pass' } })}
        onBid={(o) =>
          onAction({
            type: 'place_bid',
            choice: { kind: 'bid', value: o.value, sansAtout: o.sansAtout },
          })
        }
      />
    </div>
  );
}
