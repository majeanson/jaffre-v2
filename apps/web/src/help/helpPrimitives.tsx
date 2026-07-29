import { PlayingCard, type CardData } from '@jaffre/ui';
import { createContext, useContext, type ReactNode } from 'react';
import { CONCEPTS, type ConceptId } from './concepts.js';

/** A rule card: a titled section on the base felt. */
export function Rule({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
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

export function Strong({ children }: { readonly children: ReactNode }) {
  return <strong className="font-semibold text-(--color-ap-text)">{children}</strong>;
}

export function Tip({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div>
      <h4 className="text-(length:--text-fluid-sm) font-semibold leading-snug text-(--color-ap-gold)/90">
        {label}
      </h4>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

/** A themed group of tips inside the Advanced-strategy disclosure. */
export function TipSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <details className="group/tips rounded-(--radius-ap-control) border-2 border-(--color-ap-ink)/50 bg-(--color-ap-ground)/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-(--radius-ap-control) px-3 py-2.5 hover:bg-(--color-ap-panel-hover)">
        <span className="font-arcade-display text-(length:--text-fluid-sm) uppercase tracking-wide text-(--color-ap-gold)">
          {title}
        </span>
        <span
          aria-hidden
          className="text-(--color-ap-muted) transition-transform duration-(--duration-flick) group-open/tips:rotate-90"
        >
          ▸
        </span>
      </summary>
      <div className="space-y-2 border-t-2 border-(--color-ap-ink)/50 px-3 pb-3 pt-2.5">
        {children}
      </div>
    </details>
  );
}

/**
 * A featured mini example under a tip: the trick so far, and "your" card
 * looping a gentle played-onto-the-trick animation. Uses the real PlayingCard,
 * so examples render in whatever card skin the player has equipped.
 */
export function TipExample({
  trick,
  you,
  caption,
}: {
  readonly trick: readonly CardData[];
  readonly you: CardData;
  readonly caption: string;
}) {
  return (
    <figure className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-(--radius-ap-control) border border-(--color-ap-ink)/40 bg-(--color-ap-ground)/50 p-2.5">
      <span className="flex items-center gap-1.5" aria-hidden>
        {trick.map((c) => (
          <PlayingCard key={`${c.suit}${c.value}`} card={c} size="sm" />
        ))}
        <span className="px-0.5 text-(--color-ap-muted)">←</span>
        <span className="tip-play">
          <PlayingCard card={you} size="sm" raised />
        </span>
      </span>
      <figcaption className="min-w-40 flex-1 text-(length:--text-fluid-xs) leading-snug text-(--color-ap-muted)">
        {caption}
      </figcaption>
    </figure>
  );
}

/** Opens the mini glossary popup for a concept, anchored at the clicked term. */
export const GlossOpenCtx = createContext<(id: ConceptId, el: HTMLElement) => void>(() => {});

/** A concept color blended toward the theme's text color — keeps the family
 * hue recognizable while passing contrast on the panel in both themes. */
export function termColor(id: ConceptId): string {
  return `color-mix(in srgb, ${CONCEPTS[id].color} 45%, var(--color-ap-text))`;
}

/** An inline glossary term — colored by its concept family, pops the mini card
 * in place so the reader never loses their spot in the rules. */
export function G({ id, children }: { readonly id: ConceptId; readonly children: ReactNode }) {
  const open = useContext(GlossOpenCtx);
  return (
    <button
      type="button"
      onClick={(e) => open(id, e.currentTarget)}
      className="cursor-pointer font-semibold underline decoration-dotted underline-offset-2 hover:brightness-125"
      style={{ color: termColor(id), textDecorationColor: CONCEPTS[id].color }}
    >
      {children}
    </button>
  );
}
