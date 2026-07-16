import type { BidChoice } from '@jaffre/engine';
import type { ClientAction } from '@jaffre/protocol';
import { BidPanel, type BidOption } from '@jaffre/ui';

export interface BidOverlayProps {
  readonly options: readonly BidOption[];
  readonly onAction: (action: ClientAction) => void;
  /** The Coach's suggested bid on this turn, when it's switched on. */
  readonly recommended?: BidChoice | null;
}

/** Owns the centered auction controls shown over the stage on your bidding turn. */
export function BidOverlay({ options, onAction, recommended = null }: BidOverlayProps) {
  const coaching = recommended !== null;
  const recommendedOption: BidOption | null =
    recommended !== null && recommended.kind === 'bid'
      ? { value: recommended.value, sansAtout: recommended.sansAtout }
      : null;
  return (
    <div className="absolute inset-0 z-20 grid place-items-center">
      <BidPanel
        options={options}
        coaching={coaching}
        recommended={recommendedOption}
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
