import { useState } from 'react';

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

/** The auction controls: value buttons + a sans-atout toggle + pass. */
export function BidPanel({ options, onPass, onBid, disabled = false }: BidPanelProps) {
  const [sansAtout, setSansAtout] = useState(false);
  const values = [7, 8, 9, 10, 11, 12] as const;

  return (
    <div className="inline-flex max-w-full flex-col gap-3 rounded-(--radius-panel) bg-(--color-felt-800) shadow-(--shadow-panel) border border-white/10 p-4 font-ui max-sm:p-3">
      <span className="font-display text-lg text-(--color-lamplight)">Your bid</span>
      <div role="group" aria-label="Bid value" className="flex gap-2 max-sm:gap-1.5">
        {values.map((value) => {
          const legal = options.some((o) => o.value === value && o.sansAtout === sansAtout);
          const enabled = legal && !disabled;
          return (
            <button
              key={value}
              type="button"
              disabled={!enabled}
              onClick={() => onBid({ value, sansAtout })}
              className={
                enabled
                  ? 'h-12 w-12 max-sm:h-11 max-sm:w-11 rounded-lg font-bold tabular-nums text-lg border bg-(--color-card-face) text-(--color-ink) border-black/20 hover:bg-(--color-lamplight) active:translate-y-px cursor-pointer'
                  : 'h-12 w-12 max-sm:h-11 max-sm:w-11 rounded-lg font-bold tabular-nums text-lg border bg-white/5 text-(--color-ivory)/25 border-white/5 cursor-not-allowed'
              }
            >
              {value}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-sm text-(--color-ivory)/85 cursor-pointer">
          <input
            type="checkbox"
            checked={sansAtout}
            disabled={disabled}
            onChange={(e) => setSansAtout(e.target.checked)}
            className="h-5 w-5 accent-(--color-lamplight) cursor-pointer"
          />
          Sans atout <span className="opacity-80">(stake ×2)</span>
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={onPass}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold border border-white/20 text-(--color-ivory)/90 hover:bg-white/10 active:translate-y-px cursor-pointer"
        >
          Pass
        </button>
      </div>
    </div>
  );
}
