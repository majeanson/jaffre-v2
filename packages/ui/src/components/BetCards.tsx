import { useState } from 'react';
import type { BidOption } from './BidPanel';

/** One player's slot in the auction, in bidding order. */
export interface AuctionTurn {
  readonly name: string;
  readonly you: boolean;
  /** The declaration ("Pass", "8 SA") once made; null while still to come. */
  readonly bid: string | null;
  /** True for the seat bidding right now. */
  readonly current: boolean;
}

export interface BetCardsProps {
  /** Legal raises right now (pass is always legal). */
  readonly options: readonly BidOption[];
  /** The four seats in bidding order — shows who bid what and who's next. */
  readonly order?: readonly AuctionTurn[];
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
      className={`relative grid w-[clamp(2.6rem,7vmin,4.2rem)] aspect-2/3 shrink-0 place-items-center rounded-xl border-2 font-display text-[clamp(0.8rem,2.1vmin,1.3rem)] shadow-(--shadow-panel) transition-transform hover:-translate-y-1 ${
        enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-40 saturate-50'
      } ${
        pass
          ? 'border-(--color-ivory)/30 bg-(--color-felt-950) text-(--color-ivory)/85'
          : 'border-(--color-lamplight) bg-linear-to-b from-(--color-felt-900) to-(--color-felt-950) text-(--color-lamplight)'
      } ${recommended ? 'outline outline-2 outline-(--color-lamplight) outline-offset-2' : ''}`}
    >
      <span
        className={
          pass ? 'text-[0.85em] font-bold tracking-wide uppercase' : 'text-[1.9em] font-black'
        }
      >
        {label}
      </span>
      {!pass && sansAtout && (
        <span
          aria-hidden
          className="absolute top-[0.3em] right-[0.4em] text-[0.75em] text-(--color-lamplight)"
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
  order,
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
    <div className="inline-flex max-w-full flex-col items-center gap-[1.4vmin] rounded-(--radius-panel) border border-white/10 bg-(--color-felt-800)/95 p-[clamp(0.6rem,1.8vmin,1.1rem)] font-ui shadow-(--shadow-panel)">
      <div className="flex w-full items-center justify-between gap-4">
        <span className="font-display text-(length:--text-fluid-lg) text-(--color-lamplight)">
          Play a bet
        </span>
        <button
          type="button"
          aria-pressed={sansAtout}
          disabled={disabled}
          onClick={() => setSansAtout((v) => !v)}
          className={`rounded-lg border px-[0.9em] py-[0.45em] text-(length:--text-fluid-xs) font-semibold ${
            sansAtout
              ? 'border-(--color-lamplight) bg-(--color-lamplight)/15 text-(--color-lamplight)'
              : 'border-white/20 text-(--color-ivory)/80 hover:bg-white/8'
          } cursor-pointer`}
        >
          {sansAtout ? '★ Sans atout' : '☆ Sans atout'}
        </button>
      </div>

      {order !== undefined && order.length > 0 && (
        // The auction in turn order: who already declared what, whose turn it
        // is (lit), and who still waits — the round's progression at a glance.
        <ol
          aria-label="Bidding order"
          className="flex w-full flex-wrap items-center justify-center gap-x-1 gap-y-1 text-(length:--text-fluid-xs)"
        >
          {order.map((t, i) => (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden className="text-(--color-ivory)/30">
                  →
                </span>
              )}
              <span
                className={`flex items-center gap-[0.4em] rounded-full border px-[0.7em] py-[0.2em] whitespace-nowrap ${
                  t.current
                    ? 'border-(--color-lamplight) bg-(--color-lamplight)/12 text-(--color-lamplight)'
                    : 'border-white/10 text-(--color-ivory)/70'
                }`}
              >
                <span className={t.you ? 'font-bold' : ''}>{t.name}</span>
                {t.bid !== null ? (
                  <span
                    className={`font-semibold ${
                      t.bid === 'Pass' ? 'text-(--color-ivory)/45' : 'text-(--color-lamplight)'
                    }`}
                  >
                    {t.bid}
                  </span>
                ) : (
                  !t.current && (
                    <span aria-label="still to bid" className="text-(--color-ivory)/40">
                      …
                    </span>
                  )
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div role="group" aria-label="Bet cards" className="flex items-end gap-[0.9vmin]">
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
