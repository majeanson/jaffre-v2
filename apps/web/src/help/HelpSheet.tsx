import { PlayingCard, SUIT_STYLES, SuitShape } from '@jaffre/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TEAMS } from '../teams.js';

export interface HelpSheetProps {
  readonly onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

function Rule({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-4 shadow-(--shadow-ap-sm)">
      <h3 className="font-arcade-display text-(length:--text-fluid-lg) uppercase text-(--color-ap-gold)">
        {title}
      </h3>
      <div className="mt-1.5 space-y-2 text-(length:--text-fluid-sm) leading-relaxed text-(--color-ap-text)/85">
        {children}
      </div>
    </section>
  );
}

function Strong({ children }: { readonly children: ReactNode }) {
  return <strong className="font-semibold text-(--color-ap-text)">{children}</strong>;
}

function Tip({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <p>
      <Strong>{label}</Strong> {children}
    </p>
  );
}

/**
 * The rules, in one themed full-screen sheet. Shared by Home, Lobby, and the
 * table so "how do I play?" is never more than one tap away.
 */
export function HelpSheet({ onClose }: HelpSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the dialog on open; Escape closes; Tab stays inside.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || panelRef.current === null) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Portaled to <body>: an animated (transformed) ancestor — e.g. Home's
  // rise-in footer — would otherwise become the containing block and pin
  // this "fullscreen" sheet to itself.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="pop-in relative flex max-h-[min(88dvh,60rem)] w-[min(96vw,46rem)] flex-col overflow-hidden rounded-(--radius-ap-hero) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) font-arcade-ui shadow-(--shadow-ap-hero)"
      >
        <header className="flex items-center justify-between gap-4 border-b-2 border-(--color-ap-ink) px-5 py-3.5">
          <h2
            id="help-title"
            className="font-arcade-display text-(length:--text-fluid-2xl) uppercase text-(--color-ap-gold)"
          >
            How to play
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close help"
            onClick={onClose}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
          >
            ✕
          </button>
        </header>

        {/* Scrollable region must be keyboard-focusable (axe). */}
        <div
          role="region"
          aria-label="Rules"
          tabIndex={0}
          className="space-y-3 overflow-y-auto px-5 py-4"
        >
          <Rule title="The basics">
            <p>
              Four players, two teams — <Strong>you and the player across from you</Strong> (
              {TEAMS[0].label} vs {TEAMS[1].label}). The deck has <Strong>32 cards</Strong>: four
              suits, values 0–7. Everyone is dealt <Strong>8 cards</Strong>.
            </p>
            <p aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
              {(['red', 'brown', 'green', 'blue'] as const).map((suit) => (
                <span key={suit} className="flex items-center gap-1.5 whitespace-nowrap">
                  <SuitShape suit={suit} size="1.05em" />
                  <span className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                    {SUIT_STYLES[suit].label}
                  </span>
                </span>
              ))}
            </p>
          </Rule>

          <Rule title="Bidding">
            <p>
              One round only — each player speaks once, dealer last:{' '}
              <Strong>bid 7 to 12 trick points</Strong> or pass. Bidding <Strong>sans atout</Strong>{' '}
              means playing with no trump and <Strong>doubles the stake</Strong> — and an equal bid
              played sans atout outbids the plain one. If all four players pass, the dealer is
              forced to a bid of 7.
            </p>
          </Rule>

          <Rule title="Trump">
            <p>
              The <Strong>first card the contract winner leads</Strong> sets the trump suit for the
              round (there is none on a sans-atout contract). You must{' '}
              <Strong>follow the led suit</Strong> whenever you can.
            </p>
          </Rule>

          <Rule title="Tricks">
            <p>
              The <Strong>highest trump</Strong> in the trick wins it; if nobody played a trump, the{' '}
              <Strong>highest card of the led suit</Strong> wins. The winner leads the next trick.
            </p>
          </Rule>

          <Rule title="Points">
            <p>
              Every trick is worth <Strong>1 point</Strong> — and two cards carry a surprise for
              whoever takes the trick they are in:
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-2">
              <figure className="flex flex-col items-center gap-1.5">
                <PlayingCard card={{ suit: 'red', value: 0 }} />
                <figcaption className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                  Red 0 · <span className="font-semibold text-(--color-suit-green)">+5 points</span>
                </figcaption>
              </figure>
              <figure className="flex flex-col items-center gap-1.5">
                <PlayingCard card={{ suit: 'brown', value: 0 }} />
                <figcaption className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">
                  Brown 0 · <span className="font-semibold text-(--color-suit-red)">−2 points</span>
                </figcaption>
              </figure>
            </div>
            <p>
              8 tricks + 5 − 2 means a round always totals <Strong>11 points</Strong>.
            </p>
          </Rule>

          <Rule title="Scoring">
            <p>
              Make your bet and your team scores <Strong>+bet</Strong> (×2 sans atout); miss it and
              you score <Strong>−bet</Strong> (×2 sans atout). The defenders always keep the trick
              points they took. First team to <Strong>41</Strong> wins — if both teams cross in the
              same round, the higher total takes it (the contract team on an exact tie).
            </p>
          </Rule>

          <Rule title="Reading the table">
            <ul className="list-disc space-y-1 pl-4">
              <li>
                The <Strong>top bar</Strong> shows score · bet · trump; tap it for round details,
                the skin picker, and the game log.
              </li>
              <li>
                During the auction, <Strong>bid bubbles</Strong> appear over each seat as players
                speak.
              </li>
              <li>
                The <Strong>trick banner</Strong> calls out who took the trick before the cards
                sweep away.
              </li>
            </ul>
          </Rule>

          <div className="flex items-center gap-3 pt-1" aria-hidden>
            <span className="h-0.5 flex-1 bg-(--color-ap-ink)/25" />
            <span className="text-(length:--text-fluid-xs) tracking-wide text-(--color-ap-muted)">
              for when you&rsquo;ve played a few rounds
            </span>
            <span className="h-0.5 flex-1 bg-(--color-ap-ink)/25" />
          </div>

          <details className="group rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap-sm)">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-(--radius-ap-card) p-4 hover:bg-(--color-ap-panel-hover)">
              <span className="font-arcade-display text-(length:--text-fluid-lg) uppercase text-(--color-ap-gold)">
                Advanced strategy
                <span className="ml-2 align-middle text-(length:--text-fluid-xs) font-normal text-(--color-ap-muted)">
                  optional
                </span>
              </span>
              <span
                aria-hidden
                className="text-(--color-ap-muted) transition-transform duration-(--duration-flick) group-open:rotate-90"
              >
                ▸
              </span>
            </summary>
            <div className="space-y-2 border-t-2 border-(--color-ap-ink) px-4 pb-4 pt-3 text-(length:--text-fluid-sm) leading-relaxed text-(--color-ap-text)/85">
              <Tip label="Bidding is about your best suit.">
                Size up your hand once for each suit as trump — your longest, strongest suit is your
                real strength. Then bid the <Strong>smallest number that wins the auction</Strong>:
                making 12 on a bet of 7 still only scores 7.
              </Tip>
              <Tip label="When you win the bet, you set trump.">
                Your <Strong>first card names the trump suit</Strong> — lead your best suit, and
                lead trumps high to strip them from the defenders. Once your points reach your bet,
                stop pushing; extra tricks are worthless to you.
              </Tip>
              <Tip label="When you&rsquo;re defending, take everything.">
                Every point you win, you <Strong>keep</Strong> — so grab all you can. And if one
                more trick would push the bettors below their number, spend anything to win it and{' '}
                <Strong>set the contract</Strong>.
              </Tip>
              <Tip label="The red 0 is the whole game (+5).">
                Never lead it and never throw it away. <Strong>Cash it</Strong> on a trick your
                partner has already won. On defense, hold a high trump for the trick it shows up in.
              </Tip>
              <Tip label="The brown 0 is a gift you re-gift (−2).">
                Hand it to a trick the <Strong>opponents</Strong> are winning — best of all when you
                can&rsquo;t follow suit and would waste a card anyway. Never dump it on your
                partner.
              </Tip>
              <Tip label="Count what&rsquo;s been played.">
                Every played card is public. Track the high cards that are gone — yours may now be
                <Strong> unbeatable</Strong> — and note who <Strong>failed to follow a suit</Strong>
                : they&rsquo;re out of it, so don&rsquo;t lead it into their trump.
              </Tip>
              <Tip label="Play with your partner.">
                If your partner is already winning the trick, <Strong>play low</Strong> — never
                overtake your own side or waste a trump on a trick you were going to win anyway.
              </Tip>
            </div>
          </details>
        </div>
      </div>
    </div>,
    document.body,
  );
}
