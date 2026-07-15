import { useState } from 'react';
import { Button, Switch } from 'react-aria-components';

export interface BidOption {
  readonly value: 7 | 8 | 9 | 10 | 11 | 12;
  readonly sansAtout: boolean;
}

export interface BidPanelProps {
  /** Legal raises right now (pass is always legal). */
  readonly options: readonly BidOption[];
  readonly onPass: () => void;
  readonly onBid: (option: BidOption) => void;
  readonly disabled?: boolean;
}

/** The auction controls: value buttons + a sans-atout switch + pass. */
export function BidPanel({ options, onPass, onBid, disabled = false }: BidPanelProps) {
  const [sansAtout, setSansAtout] = useState(false);
  const values = [7, 8, 9, 10, 11, 12] as const;

  return (
    <div className="inline-flex flex-col gap-3 rounded-(--radius-panel) bg-(--color-felt-800)/90 shadow-(--shadow-panel) border border-white/8 p-4 font-ui">
      <span className="font-display text-lg text-(--color-lamplight)">Your bid</span>
      <div role="group" aria-label="Bid value" className="flex gap-1.5">
        {values.map((value) => {
          const legal = options.some((o) => o.value === value && o.sansAtout === sansAtout);
          return (
            <Button
              key={value}
              isDisabled={disabled || !legal}
              onPress={() => onBid({ value, sansAtout })}
              className={`size-11 rounded-lg font-bold tabular-nums text-lg border transition-colors duration-(--duration-flick) ${
                legal && !disabled
                  ? 'bg-(--color-ivory) text-(--color-ink) border-black/20 hover:bg-(--color-lamplight) pressed:translate-y-px cursor-pointer'
                  : 'bg-white/5 text-(--color-ivory)/25 border-white/5 cursor-not-allowed'
              }`}
            >
              {value}
            </Button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-4">
        <Switch
          isSelected={sansAtout}
          onChange={setSansAtout}
          isDisabled={disabled}
          className="group flex items-center gap-2 text-sm text-(--color-ivory)/85 cursor-pointer"
        >
          <span className="h-6 w-10 rounded-full bg-white/12 p-0.5 transition-colors duration-(--duration-flick) group-selected:bg-(--color-lamplight)">
            <span className="block size-5 rounded-full bg-(--color-ivory) transition-transform duration-(--duration-flick) group-selected:translate-x-4" />
          </span>
          Sans atout <span className="opacity-55">(stake ×2)</span>
        </Switch>
        <Button
          isDisabled={disabled}
          onPress={onPass}
          className="rounded-lg px-4 py-2 text-sm font-semibold border border-white/15 text-(--color-ivory)/90 hover:bg-white/8 pressed:translate-y-px cursor-pointer"
        >
          Pass
        </Button>
      </div>
    </div>
  );
}
