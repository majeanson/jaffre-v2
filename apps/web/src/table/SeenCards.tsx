import type { Card, SeatView, Suit } from '@jaffre/engine';
import { SUIT_NAMES, SuitShape, useLang, type Lang } from '@jaffre/ui';

const T: Record<Lang, { title: string; hint: string; gone: string; left: string }> = {
  en: {
    title: 'Cards seen',
    hint: 'Dimmed values are already played (yours included).',
    gone: 'played',
    left: 'still out',
  },
  fr: {
    title: 'Cartes vues',
    hint: 'Les valeurs pâles sont déjà jouées (les tiennes incluses).',
    gone: 'jouée',
    left: 'encore en jeu',
  },
};

const SUITS: readonly Suit[] = ['red', 'brown', 'green', 'blue'];
const VALUES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** Every card the viewer can legitimately account for: played to a trick
 * (captured or on the table) plus the ones still in their own hand. */
function seenSet(view: SeatView): ReadonlySet<string> {
  const seen = new Set<string>();
  const add = (c: Card): void => void seen.add(`${c.suit}${String(c.value)}`);
  for (const trick of view.capturedTricks) for (const c of trick.cards) add(c);
  for (const play of view.currentTrick) add(play.card);
  for (const c of view.hand) add(c);
  return seen;
}

/**
 * The card-counting aid: per suit, which of 0–7 are already accounted for.
 * Purely derived from what the viewer can already see (the log has the same
 * information, one line at a time) — it saves the bookkeeping, not the
 * knowledge. Off by default; lives in the expanded score strip.
 */
export function SeenCards({ view }: { readonly view: SeatView }) {
  const lang = useLang();
  const t = T[lang];
  const seen = seenSet(view);

  return (
    <div
      data-testid="seen-cards"
      className="flex w-full flex-col gap-1.5 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2"
    >
      <span className="font-arcade-display text-(length:--text-fluid-xs) uppercase tracking-wide text-(--color-ap-muted)">
        {t.title}
      </span>
      <ul className="flex flex-col gap-1">
        {SUITS.map((suit) => (
          <li key={suit} className="flex items-center gap-2">
            <SuitShape suit={suit} size="1em" />
            <span className="sr-only">{SUIT_NAMES[lang][suit]}</span>
            <span className="flex flex-1 items-center justify-between gap-1">
              {VALUES.map((value) => {
                const isGone = seen.has(`${suit}${String(value)}`);
                return (
                  <span
                    key={value}
                    aria-label={`${SUIT_NAMES[lang][suit]} ${String(value)} — ${
                      isGone ? t.gone : t.left
                    }`}
                    className={`grid size-[1.4em] place-items-center rounded-(--radius-ap-inner) border-2 font-arcade-display text-[0.72em] tabular-nums ${
                      isGone
                        ? 'border-transparent text-(--color-ap-muted)/40 line-through'
                        : 'border-(--color-ap-ink) bg-(--color-ap-paper) text-(--color-ap-ink)'
                    }`}
                  >
                    {value}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-(length:--text-fluid-xs) text-(--color-ap-muted)">{t.hint}</span>
    </div>
  );
}
