import { useState } from 'react';
import type { BidOption } from './BidPanel';

export interface BetCardsProps {
  /** Legal raises right now (pass is always legal). */
  readonly options: readonly BidOption[];
  readonly onPass: () => void;
  readonly onBid: (option: BidOption) => void;
  readonly disabled?: boolean;
  /** The Coach's suggested bid — null means it recommends passing. */
  readonly recommended?: BidOption | null;
  /** True when the Coach is on (drives the recommend styling). */
  readonly coaching?: boolean;
}

/**
 * A single bet "chip" card — deliberately NOT a playing card: a dark brass
 * token with a gold value, no suit, a Pass face, and a ★ when sans-atout is
 * on. Tap (or keyboard-Enter) commits — no drag gesture here, bids are a
 * deliberate single choice.
 */
function BetCard({
  label,
  pass = false,
  sansAtout = false,
  enabled,
  recommended,
  onCommit,
}: {
  label: string;
  pass?: boolean;
  sansAtout?: boolean;
  enabled: boolean;
  recommended: boolean;
  onCommit: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      aria-label={pass ? 'Pass' : `Bid ${label}${sansAtout ? ' sans atout' : ''}`}
      onClick={() => {
        if (enabled) onCommit();
      }}
      className={`relative grid h-24 w-16 shrink-0 place-items-center rounded-xl border-2 font-display shadow-(--shadow-panel) transition-transform hover:-translate-y-1 max-sm:h-16 max-sm:w-11 ${
        enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-40 saturate-50'
      } ${
        pass
          ? 'border-(--color-ivory)/30 bg-(--color-felt-950) text-(--color-ivory)/85'
          : 'border-(--color-lamplight) bg-linear-to-b from-(--color-felt-900) to-(--color-felt-950) text-(--color-lamplight)'
      } ${recommended ? 'outline outline-2 outline-(--color-lamplight) outline-offset-2' : ''}`}
    >
      <span
        className={
          pass
            ? 'text-base font-bold tracking-wide uppercase max-sm:text-xs'
            : 'text-3xl font-black max-sm:text-xl'
        }
      >
        {label}
      </span>
      {!pass && sansAtout && (
        <span
          aria-hidden
          className="absolute top-1 right-1.5 text-xs text-(--color-lamplight)"
          title="Sans atout"
        >
          ★
        </span>
      )}
    </button>
  );
}

/**
 * Card-based auction: tap a bet card (7–12 or Pass) to play it. A ★ toggle
 * switches every value card to sans-atout. Looks unmistakably different from
 * the ivory playing cards in your hand.
 */
export function BetCards({
  options,
  onPass,
  onBid,
  disabled = false,
  recommended = null,
  coaching = false,
}: BetCardsProps) {
  const [sansAtout, setSansAtout] = useState(false);
  const values = [7, 8, 9, 10, 11, 12] as const;
  const recommendPass = coaching && recommended === null;

  return (
    <div className="inline-flex max-w-full flex-col items-center gap-3 rounded-(--radius-panel) border border-white/10 bg-(--color-felt-800)/95 p-4 font-ui shadow-(--shadow-panel) max-sm:p-3">
      <div className="flex w-full items-center justify-between gap-4">
        <span className="font-display text-lg text-(--color-lamplight)">Play a bet</span>
        <button
          type="button"
          aria-pressed={sansAtout}
          disabled={disabled}
          onClick={() => setSansAtout((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            sansAtout
              ? 'border-(--color-lamplight) bg-(--color-lamplight)/15 text-(--color-lamplight)'
              : 'border-white/20 text-(--color-ivory)/80 hover:bg-white/8'
          } cursor-pointer`}
        >
          {sansAtout ? '★ Sans atout' : '☆ Sans atout'}
        </button>
      </div>

      <div role="group" aria-label="Bet cards" className="flex items-end gap-2 max-sm:gap-1">
        {values.map((value) => {
          const legal = options.some((o) => o.value === value && o.sansAtout === sansAtout);
          const isRecommended =
            coaching &&
            recommended !== null &&
            recommended.value === value &&
            recommended.sansAtout === sansAtout;
          return (
            <BetCard
              key={value}
              label={String(value)}
              sansAtout={sansAtout}
              enabled={legal && !disabled}
              recommended={isRecommended}
              onCommit={() => onBid({ value, sansAtout })}
            />
          );
        })}
        <BetCard
          key="pass"
          label="Pass"
          pass
          enabled={!disabled}
          recommended={recommendPass}
          onCommit={onPass}
        />
      </div>

      <span className="text-(length:--text-fluid-xs) text-(--color-ivory)/60">
        Tap a card to bid
      </span>
    </div>
  );
}
