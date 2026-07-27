import { useState } from 'react';
import { useLang, type Lang } from '../i18n.js';
import type { BidOption } from './BidPanel';

const T: Record<
  Lang,
  {
    pass: string;
    you: string;
    bidAria: (label: string, sansAtout: boolean) => string;
    playABet: string;
    biddingOrder: string;
    stillToBid: string;
    betCards: string;
    tapToBid: string;
    bidding: string;
    waitYourTurn: string;
    hailMaryWarn: string;
    pointsHint: string;
    explainToggle: string;
    explainLines: readonly [string, string, string];
  }
> = {
  en: {
    pass: 'Pass',
    you: 'you',
    bidAria: (label, sa) => `Bid ${label}${sa ? ' sans atout' : ''}`,
    playABet: 'Play a bid',
    biddingOrder: 'Bidding order',
    stillToBid: 'still to bid',
    betCards: 'Bid cards',
    tapToBid: 'Tap a card to bid',
    bidding: 'Bidding',
    waitYourTurn: 'Wait for your turn to bid',
    hailMaryWarn: 'All or nothing — make 12 sans atout to win the game, miss it and you lose.',
    pointsHint: 'Bids are points, not tricks — 11 in play each round.',
    explainToggle: 'What do the numbers mean?',
    explainLines: [
      'Each trick is worth 1 point · the Red 0 adds 5 · the Brown 0 removes 2 — 11 in total.',
      'Make your bid and your team scores it; miss and you lose it (doubled sans atout).',
      'Defenders always keep the points they capture.',
    ],
  },
  fr: {
    pass: 'Passe',
    you: 'toi',
    bidAria: (label, sa) => `Miser ${label}${sa ? ' sans atout' : ''}`,
    playABet: 'Joue une mise',
    biddingOrder: 'Ordre des mises',
    stillToBid: 'à miser',
    betCards: 'Cartes de mise',
    tapToBid: 'Touche une carte pour miser',
    bidding: 'Les mises',
    waitYourTurn: 'Attends ton tour pour miser',
    hailMaryWarn: 'Tout ou rien — réussis 12 sans atout pour gagner, rate-le et tu perds.',
    pointsHint: 'Les mises sont des points, pas des levées — 11 en jeu par ronde.',
    explainToggle: 'Que veulent dire les chiffres?',
    explainLines: [
      'Chaque levée vaut 1 point · le Rouge 0 ajoute 5 · le Brun 0 enlève 2 — 11 au total.',
      'Mise réussie : ton équipe la marque; ratée : tu la perds (doublée sans atout).',
      'Les défenseurs gardent toujours les points qu’ils prennent.',
    ],
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
  /**
   * Another seat is bidding: the panel stays up so everyone follows the
   * auction, but every card is disabled and the copy says whose turn it is.
   */
  readonly waiting?: boolean;
  /** The Coach's suggested bid — null means it recommends passing. */
  readonly recommended?: BidOption | null;
  /** True when the Coach is on (drives the recommend styling). */
  readonly coaching?: boolean;
  /** True when the "Hail-Mary 12 sans atout" house rule is on for this game. */
  readonly hailMary12?: boolean;
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
  hot = false,
  onCommit,
}: {
  label: string;
  pass?: boolean;
  sansAtout?: boolean;
  enabled: boolean;
  recommended: boolean;
  /** The all-or-nothing 12 sans atout — a gold danger ring under the hail-mary rule. */
  hot?: boolean;
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
          : 'bg-(--color-ap-paper) text-(--color-ap-ink)'
      } ${recommended ? 'outline outline-[3px] outline-(--color-ap-violet) outline-offset-2 -translate-y-1' : ''} ${
        hot
          ? 'outline outline-[3px] outline-(--color-ap-gold-deep) outline-offset-2 -translate-y-1'
          : ''
      }`}
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
  waiting = false,
  recommended = null,
  coaching = false,
  hailMary12 = false,
}: BetCardsProps) {
  const tt = T[useLang()];
  const [sansAtout, setSansAtout] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const values = [7, 8, 9, 10, 11, 12] as const;
  const locked = disabled || waiting;
  const recommendPass = coaching && recommended === null;
  // The hail-mary is armed when the rule is on and the sans-atout toggle is up
  // (only on your turn — the warning is about a bid you could commit now).
  const hailMaryArmed = hailMary12 && sansAtout && !waiting;

  return (
    <div className="inline-flex max-w-full flex-col items-center gap-[1.4vmin] rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-[clamp(0.6rem,1.8vmin,1.1rem)] font-arcade-ui shadow-(--shadow-ap-lg) max-sm:max-w-[92vw]">
      <div className="flex w-full items-center justify-between gap-4">
        <span className="font-arcade-display text-(length:--text-fluid-lg) uppercase text-(--color-ap-gold)">
          {waiting ? tt.bidding : tt.playABet}
        </span>
        <button
          type="button"
          aria-pressed={sansAtout}
          disabled={locked}
          onClick={() => setSansAtout((v) => !v)}
          className={`cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-[0.9em] py-[0.45em] font-arcade-display text-(length:--text-fluid-xs) uppercase shadow-(--shadow-ap-sm) disabled:cursor-not-allowed disabled:opacity-45 ${
            sansAtout
              ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
              : 'bg-(--color-ap-panel) text-(--color-ap-violet-soft) hover:bg-(--color-ap-panel-hover)'
          }`}
        >
          {sansAtout ? '★ Sans atout' : '☆ Sans atout'}
        </button>
      </div>

      {/* The one line a first-timer needs before the numbers make sense —
          always visible, with the full why behind a single tap. */}
      <p className="w-full text-center text-(length:--text-fluid-xs) text-(--color-ap-muted)">
        {tt.pointsHint}{' '}
        <button
          type="button"
          aria-expanded={explaining}
          onClick={() => setExplaining((v) => !v)}
          className="cursor-pointer whitespace-nowrap text-(--color-ap-violet-soft) underline decoration-dotted underline-offset-2 hover:text-(--color-ap-text)"
        >
          {tt.explainToggle}
        </button>
      </p>
      {explaining && (
        <ul className="w-full space-y-1 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel-hover) px-3 py-2 text-left text-(length:--text-fluid-xs) text-(--color-ap-text)">
          {tt.explainLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

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
                {t.you && (
                  <span className="text-[0.85em] text-(--color-ap-violet-soft)">({tt.you})</span>
                )}
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

      {hailMaryArmed && (
        <p
          role="alert"
          className="w-full rounded-(--radius-ap-control) border-2 border-(--color-ap-gold-deep) bg-(--color-ap-gold)/15 px-3 py-2 text-center text-(length:--text-fluid-xs) font-semibold text-(--color-ap-text)"
        >
          {tt.hailMaryWarn}
        </p>
      )}

      {/* flex-wrap: on a 320px screen the seven cards outgrow the row at the
          clamp floor — Pass wraps to a centered second line instead of
          pushing the sheet into horizontal overflow. */}
      <div
        role="group"
        aria-label={tt.betCards}
        className="flex flex-wrap items-end justify-center gap-[0.9vmin]"
      >
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
              enabled={legal && !locked}
              recommended={isRecommended}
              hot={hailMaryArmed && value === 12}
              onCommit={() => onBid({ value, sansAtout })}
            />
          );
        })}
        <BetCard
          key="pass"
          label={tt.pass}
          pass
          enabled={!locked}
          recommended={recommendPass}
          onCommit={onPass}
        />
      </div>

      <span className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
        {waiting ? tt.waitYourTurn : tt.tapToBid}
      </span>
    </div>
  );
}
