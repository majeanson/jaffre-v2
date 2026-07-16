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
  /** The Coach's suggested bid — null means it recommends passing. */
  readonly recommended?: BidOption | null;
  /** True when the Coach is on (drives the recommend styling + pass hint). */
  readonly coaching?: boolean;
}

/** The auction controls: value buttons + a sans-atout toggle + pass. */
export function BidPanel({
  options,
  onPass,
  onBid,
  disabled = false,
  recommended = null,
  coaching = false,
}: BidPanelProps) {
  const [sansAtout, setSansAtout] = useState(false);
  const values = [7, 8, 9, 10, 11, 12] as const;
  const recommendPass = coaching && recommended === null;

  return (
    <div className="inline-flex max-w-full flex-col gap-3 rounded-(--radius-panel) bg-(--color-felt-800) shadow-(--shadow-panel) border border-white/10 p-4 font-ui max-sm:p-3">
      <span className="font-display text-lg text-(--color-lamplight)">Your bid</span>
      <div role="group" aria-label="Bid value" className="flex gap-2 max-sm:gap-1.5">
        {values.map((value) => {
          const legal = options.some((o) => o.value === value && o.sansAtout === sansAtout);
          const enabled = legal && !disabled;
          const isRecommended =
            coaching &&
            recommended !== null &&
            recommended.value === value &&
            recommended.sansAtout === sansAtout;
          return (
            <button
              key={value}
              type="button"
              disabled={!enabled}
              onClick={() => onBid({ value, sansAtout })}
              className={`${
                enabled
                  ? 'h-12 w-12 max-sm:h-11 max-sm:w-11 rounded-lg font-bold tabular-nums text-lg border bg-(--color-card-face) text-(--color-ink) border-black/20 hover:bg-(--color-lamplight) active:translate-y-px cursor-pointer'
                  : 'h-12 w-12 max-sm:h-11 max-sm:w-11 rounded-lg font-bold tabular-nums text-lg border bg-white/5 text-(--color-ivory)/25 border-white/5 cursor-not-allowed'
              } ${isRecommended ? 'outline outline-2 outline-(--color-lamplight) outline-offset-2' : ''}`}
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
          className={`rounded-lg px-5 py-2.5 text-sm font-semibold border text-(--color-ivory)/90 hover:bg-white/10 active:translate-y-px cursor-pointer ${
            recommendPass
              ? 'border-(--color-lamplight) outline outline-2 outline-(--color-lamplight) outline-offset-2'
              : 'border-white/20'
          }`}
        >
          Pass
        </button>
      </div>
    </div>
  );
}
