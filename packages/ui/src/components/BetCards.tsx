import { useState } from 'react';
import { useLang, type Lang } from '../i18n.js';
import type { BidOption } from './BidPanel';

const T: Record<
  Lang,
  {
    pass: string;
    bidAria: (label: string, sansAtout: boolean) => string;
    playABet: string;
    biddingOrder: string;
    stillToBid: string;
    betCards: string;
    tapToBid: string;
  }
> = {
  en: {
    pass: 'Pass',
    bidAria: (label, sa) => `Bid ${label}${sa ? ' sans atout' : ''}`,
    playABet: 'Play a bet',
    biddingOrder: 'Bidding order',
    stillToBid: 'still to bid',
    betCards: 'Bet cards',
    tapToBid: 'Tap a card to bid',
  },
  fr: {
    pass: 'Passe',
    bidAria: (label, sa) => `Miser ${label}${sa ? ' sans atout' : ''}`,
    playABet: 'Joue une mise',
    biddingOrder: 'Ordre des mises',
    stillToBid: 'à miser',
    betCards: 'Cartes de mise',
    tapToBid: 'Touche une carte pour miser',
  },
};

/** The declaration strings the app sends for a pass, in either language. */
const PASS_WORDS: readonly string[] = [T.en.pass, T.fr.pass];

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
 * A single bet tile — an ivory card with a big Silkscreen value (per the 7b
 * design), or a dark PASS face. The Coach's pick takes a violet ring + lift.
 * Tap (or keyboard-Enter) commits — no drag gesture here, bids are a deliberate
 * single choice.
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
  const t = T[useLang()];
  return (
    <button
      type="button"
      disabled={!enabled}
      aria-label={pass ? t.pass : t.bidAria(label, sansAtout)}
      onClick={() => {
        if (enabled) onCommit();
      }}
      className={`relative grid w-[clamp(2.6rem,7vmin,4.2rem)] aspect-2/3 shrink-0 place-items-center rounded-(--radius-ap-inner) border-[3px] border-(--color-ap-ink) font-arcade-display text-[clamp(0.8rem,2.1vmin,1.3rem)] shadow-(--shadow-ap) transition-transform hover:-translate-y-1 ${
        enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-45 saturate-50'
      } ${
        pass
          ? 'bg-(--color-ap-panel) text-(--color-ap-muted)'
          : 'bg-(--color-card-face) text-(--color-ap-ink)'
      } ${recommended ? 'outline outline-[3px] outline-(--color-ap-violet) outline-offset-2 -translate-y-1' : ''}`}
    >
      <span className={pass ? 'text-[0.9em] tracking-wide uppercase' : 'text-[1.9em]'}>
        {label}
      </span>
      {!pass && sansAtout && (
        <span
          aria-hidden
          className="absolute top-[0.3em] right-[0.4em] text-[0.75em] text-(--color-ap-gold-deep)"
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
  const tt = T[useLang()];
  const [sansAtout, setSansAtout] = useState(false);
  const values = [7, 8, 9, 10, 11, 12] as const;
  const recommendPass = coaching && recommended === null;

  return (
    <div className="inline-flex max-w-full flex-col items-center gap-[1.4vmin] rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[clamp(0.6rem,1.8vmin,1.1rem)] font-arcade-ui shadow-(--shadow-ap-lg)">
      <div className="flex w-full items-center justify-between gap-4">
        <span className="font-arcade-display text-(length:--text-fluid-lg) uppercase text-(--color-ap-gold)">
          {tt.playABet}
        </span>
        <button
          type="button"
          aria-pressed={sansAtout}
          disabled={disabled}
          onClick={() => setSansAtout((v) => !v)}
          className={`cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-[0.9em] py-[0.45em] font-arcade-display text-(length:--text-fluid-xs) uppercase shadow-(--shadow-ap-sm) ${
            sansAtout
              ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
              : 'bg-(--color-ap-panel) text-(--color-ap-violet-soft) hover:bg-(--color-ap-panel-hover)'
          }`}
        >
          {sansAtout ? '★ Sans atout' : '☆ Sans atout'}
        </button>
      </div>

      {order !== undefined && order.length > 0 && (
        // The auction in turn order: who already declared what, whose turn it
        // is (lit), and who still waits — the round's progression at a glance.
        <ol
          aria-label={tt.biddingOrder}
          className="flex w-full flex-wrap items-center justify-center gap-x-1 gap-y-1 text-(length:--text-fluid-xs)"
        >
          {order.map((t, i) => (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden className="text-(--color-ap-muted)/50">
                  →
                </span>
              )}
              <span
                className={`flex items-center gap-[0.4em] rounded-full border-2 px-[0.7em] py-[0.2em] whitespace-nowrap ${
                  t.current
                    ? 'border-(--color-ap-violet) text-(--color-ap-text)'
                    : 'border-(--color-ap-ink) text-(--color-ap-muted)'
                }`}
              >
                <span className={t.you ? 'font-bold text-(--color-ap-text)' : ''}>{t.name}</span>
                {t.bid !== null ? (
                  <span
                    className={`font-arcade-display ${
                      PASS_WORDS.includes(t.bid)
                        ? 'text-(--color-ap-muted)'
                        : 'text-(--color-ap-gold)'
                    }`}
                  >
                    {t.bid}
                  </span>
                ) : (
                  !t.current && (
                    <span aria-label={tt.stillToBid} className="text-(--color-ap-muted)/60">
                      …
                    </span>
                  )
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div role="group" aria-label={tt.betCards} className="flex items-end gap-[0.9vmin]">
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
          label={tt.pass}
          pass
          enabled={!disabled}
          recommended={recommendPass}
          onCommit={onPass}
        />
      </div>

      <span className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">{tt.tapToBid}</span>
    </div>
  );
}
