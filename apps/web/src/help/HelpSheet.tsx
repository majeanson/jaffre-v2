import { PlayingCard, SUIT_STYLES } from '@jaffre/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { TEAMS } from '../teams.js';

export interface HelpSheetProps {
  readonly onClose: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

function Rule({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="rounded-(--radius-panel) border border-white/8 bg-black/20 p-4">
      <h3 className="font-display text-(length:--text-fluid-lg) font-semibold text-(--color-lamplight)">
        {title}
      </h3>
      <div className="mt-1.5 space-y-2 text-(length:--text-fluid-sm) leading-relaxed text-(--color-ivory)/80">
        {children}
      </div>
    </section>
  );
}

function Strong({ children }: { readonly children: ReactNode }) {
  return <strong className="font-semibold text-(--color-ivory)">{children}</strong>;
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

  return (
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
        className="pop-in relative flex max-h-[min(88dvh,60rem)] w-[min(96vw,46rem)] flex-col overflow-hidden rounded-(--radius-panel) border border-white/10 bg-(--color-felt-900) shadow-(--shadow-panel)"
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-3.5">
          <h2
            id="help-title"
            className="font-display text-(length:--text-fluid-2xl) font-semibold text-(--color-lamplight)"
          >
            How to play
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close help"
            onClick={onClose}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/15 text-(--color-ivory)/80 hover:bg-white/10"
          >
            ✕
          </button>
        </header>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <Rule title="The basics">
            <p>
              Four players, two teams — <Strong>you and the player across from you</Strong> (
              {TEAMS[0].label} vs {TEAMS[1].label}). The deck has <Strong>32 cards</Strong>: four
              suits, values 0–7. Everyone is dealt <Strong>8 cards</Strong>.
            </p>
            <p aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
              {(['red', 'brown', 'green', 'blue'] as const).map((suit) => (
                <span key={suit} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-lg leading-none" style={{ color: SUIT_STYLES[suit].color }}>
                    {SUIT_STYLES[suit].glyph}
                  </span>
                  <span className="text-(length:--text-fluid-xs) text-(--color-ivory)/60">
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
                <figcaption className="text-(length:--text-fluid-xs) text-(--color-ivory)/70">
                  Red 0 · <span className="font-semibold text-(--color-ok)">+5 points</span>
                </figcaption>
              </figure>
              <figure className="flex flex-col items-center gap-1.5">
                <PlayingCard card={{ suit: 'brown', value: 0 }} />
                <figcaption className="text-(length:--text-fluid-xs) text-(--color-ivory)/70">
                  Brown 0 · <span className="font-semibold text-(--color-danger)">−2 points</span>
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
        </div>
      </div>
    </div>
  );
}
