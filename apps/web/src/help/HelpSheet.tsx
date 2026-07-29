import { useLang, type Lang } from '@jaffre/ui';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../components/useScrollLock.js';
import { ReplayTutorialButton } from '../components/ReplayTutorialButton.js';
import { loadTutorialSeen } from '../table/tutorialPref.js';
import { MARK_ORDER, MARKS } from '../table/tutorialSteps.js';
import { CONCEPTS, GLOSSARY_GROUPS, type ConceptId } from './concepts.js';
import { G, GlossOpenCtx, Rule, Tip, TipSection, termColor } from './helpPrimitives.js';
import { RULES, TIP_SECTIONS } from './helpContent.js';

// Re-exported so existing imports (tutorialSteps.ts, TutorialCoach.tsx) keep
// working — ConceptId's home is concepts.ts, HelpSheet just re-shares it.
export type { ConceptId } from './concepts.js';

export interface HelpSheetProps {
  readonly onClose: () => void;
  /** Open with the glossary expanded and this concept scrolled into view. */
  readonly jumpTo?: ConceptId;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

const T: Record<
  Lang,
  {
    title: string;
    close: string;
    rules: string;
    divider: string;
    advanced: string;
    optional: string;
    glossary: string;
    seeAlso: string;
    learning: string;
    learningHint: string;
    replay: string;
  }
> = {
  en: {
    title: 'How to play',
    close: 'Close help',
    rules: 'Rules',
    divider: 'for when you’ve played a few rounds',
    advanced: 'Advanced strategy',
    optional: 'optional',
    glossary: 'Glossary',
    seeAlso: 'See also',
    learning: 'Learning the game',
    learningHint: 'The practice table flags each of these as it comes up.',
    replay: 'Replay tutorial',
  },
  fr: {
    title: 'Comment jouer',
    close: "Fermer l'aide",
    rules: 'Règles',
    divider: 'pour quand tu auras joué quelques rondes',
    advanced: 'Stratégie avancée',
    optional: 'facultatif',
    glossary: 'Glossaire',
    seeAlso: 'Voir aussi',
    learning: 'Apprendre le jeu',
    learningHint: 'La table d’entraînement te signale chacun de ces points quand il arrive.',
    replay: 'Rejouer le tutoriel',
  },
};

/** Open the glossary disclosure and scroll its entry into view, with a flash. */
function jumpToTerm(id: ConceptId): void {
  const details = document.getElementById('help-glossary');
  if (details instanceof HTMLDetailsElement) details.open = true;
  const entry = document.getElementById(`gloss-${id}`);
  if (entry === null) return;
  entry.scrollIntoView({ behavior: 'smooth', block: 'center' });
  entry.animate(
    [
      { backgroundColor: 'color-mix(in srgb, currentColor 18%, transparent)' },
      { backgroundColor: 'transparent' },
    ],
    { duration: 1100, easing: 'ease-out' },
  );
}

/** Where a mini glossary popup should appear, in scroll-region coordinates. */
interface PopState {
  readonly id: ConceptId;
  readonly x: number;
  readonly y: number;
  readonly up: boolean;
}

/** The mini glossary popup: definition + see-also hops, anchored at the term. */
function GlossaryPopover({
  pop,
  lang,
  onClose,
  popRef,
}: {
  readonly pop: PopState;
  readonly lang: Lang;
  readonly onClose: () => void;
  readonly popRef: React.RefObject<HTMLDivElement | null>;
}) {
  const c = CONCEPTS[pop.id];
  return (
    <div
      id="gloss-pop"
      ref={popRef}
      role="dialog"
      aria-label={c.term[lang]}
      className="absolute z-20 w-[min(21rem,88%)] rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-3 text-(length:--text-fluid-xs) leading-relaxed shadow-(--shadow-ap-hero)"
      style={{
        left: pop.x,
        top: pop.y,
        marginTop: 0, // opt out of the region's space-y rhythm
        transform: pop.up ? 'translateY(-100%)' : undefined,
        borderLeftColor: c.color,
        borderLeftWidth: 4,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="font-arcade-display uppercase tracking-wide"
          style={{ color: termColor(pop.id) }}
        >
          {c.term[lang]}
        </p>
        <button
          type="button"
          aria-label={lang === 'fr' ? 'Fermer' : 'Close'}
          onClick={onClose}
          className="-mr-1 -mt-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) text-(--color-ap-muted) hover:bg-(--color-ap-panel-hover) hover:text-(--color-ap-text)"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 text-(--color-ap-text)/85">{c.def[lang]}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-(--color-ap-muted)">
        {c.see.length > 0 && (
          <>
            <span>{T[lang].seeAlso}</span>
            {c.see.map((s) => (
              <G key={s} id={s}>
                {CONCEPTS[s].term[lang]}
              </G>
            ))}
          </>
        )}
        <button
          type="button"
          onClick={() => {
            onClose();
            jumpToTerm(pop.id);
          }}
          className="ml-auto cursor-pointer underline decoration-dotted underline-offset-2 hover:text-(--color-ap-text)"
        >
          {T[lang].glossary} ↓
        </button>
      </p>
    </div>
  );
}

function GlossaryEntry({ id, lang }: { readonly id: ConceptId; readonly lang: Lang }) {
  const c = CONCEPTS[id];
  return (
    <div
      id={`gloss-${id}`}
      className="rounded-r-(--radius-ap-control) border-l-4 py-1.5 pl-3"
      style={{ borderColor: c.color, color: termColor(id) }}
    >
      <p className="font-arcade-display text-(length:--text-fluid-sm) uppercase tracking-wide">
        {c.term[lang]}
      </p>
      <p className="mt-0.5 text-(--color-ap-text)/85">{c.def[lang]}</p>
      {c.see.length > 0 && (
        <p className="mt-1 text-(length:--text-fluid-xs) text-(--color-ap-muted)">
          {T[lang].seeAlso}{' '}
          {c.see.map((s, i) => (
            <span key={s}>
              {i > 0 && ' · '}
              <G id={s}>{CONCEPTS[s].term[lang]}</G>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** The wiki-style glossary: entries grouped by color family, cross-linked. */
function Glossary({ lang }: { readonly lang: Lang }) {
  return (
    <details
      id="help-glossary"
      className="group rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap-sm)"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-(--radius-ap-card) p-4 hover:bg-(--color-ap-panel-hover)">
        <span className="font-arcade-display text-(length:--text-fluid-lg) uppercase text-(--color-ap-gold)">
          {T[lang].glossary}
        </span>
        <span
          aria-hidden
          className="text-(--color-ap-muted) transition-transform duration-(--duration-flick) group-open:rotate-90"
        >
          ▸
        </span>
      </summary>
      <div className="space-y-4 border-t-2 border-(--color-ap-ink) px-4 pb-4 pt-3 text-(length:--text-fluid-sm) leading-relaxed">
        {GLOSSARY_GROUPS.map((g) => (
          <div key={g.ids[0]} className="space-y-2.5">
            {g.ids.map((id) => (
              <GlossaryEntry key={id} id={id} lang={lang} />
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * The learning checklist: the seven tutorial concepts, each ticked once the
 * player has met it on the practice table, plus a "Replay tutorial" control.
 * Progress is read once on open (Help opens fresh, so live reactivity isn't
 * needed here) and shares its source of truth — tutorialSteps + tutorialPref —
 * with the felt's live progress pip. Guards gracefully at 0/7 before anything
 * has started, since the sheet is also shown from Home and the Lobby.
 */
function LearningChecklist({
  lang,
  onReplay,
}: {
  readonly lang: Lang;
  readonly onReplay: () => void;
}) {
  const t = T[lang];
  const [seen, setSeen] = useState<Set<string>>(() => loadTutorialSeen());
  const total = MARK_ORDER.length;
  const done = MARK_ORDER.filter((s) => seen.has(s)).length;

  return (
    <section
      aria-label={`${t.learning} — ${done}/${total}`}
      className="rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-4 shadow-(--shadow-ap-sm)"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-arcade-display text-(length:--text-fluid-lg) uppercase text-(--color-ap-gold)">
          {t.learning}
        </h3>
        <span className="font-arcade-ui text-(length:--text-fluid-sm) tabular-nums text-(--color-ap-muted)">
          {done}/{total}
        </span>
      </div>
      <p className="mt-1 text-(length:--text-fluid-xs) leading-snug text-(--color-ap-muted)">
        {t.learningHint}
      </p>
      <ul role="list" className="mt-2.5 space-y-1.5">
        {MARK_ORDER.map((id) => {
          const isDone = seen.has(id);
          return (
            <li key={id} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={`grid size-5 shrink-0 place-items-center rounded-(--radius-ap-control) border-2 text-(length:--text-fluid-xs) ${
                  isDone
                    ? 'border-(--color-ap-gold) bg-(--color-ap-gold) text-(--color-ap-ink)'
                    : 'border-(--color-ap-ink)/60 text-transparent'
                }`}
              >
                ✓
              </span>
              <span
                className={`text-(length:--text-fluid-sm) ${
                  isDone ? 'text-(--color-ap-text)' : 'text-(--color-ap-text)/60'
                }`}
              >
                {MARKS[id][lang].title}
              </span>
              <span className="sr-only">
                {isDone
                  ? lang === 'fr'
                    ? '(fait)'
                    : '(done)'
                  : lang === 'fr'
                    ? '(à venir)'
                    : '(not yet)'}
              </span>
            </li>
          );
        })}
      </ul>
      {/* Asks before it acts, then lands you on a fresh practice table with
          the marks re-armed — the checklist above empties with it. */}
      <div className="mt-3">
        <ReplayTutorialButton
          label={`♺ ${t.replay}`}
          onConfirm={() => {
            setSeen(new Set());
            onReplay();
          }}
        />
      </div>
    </section>
  );
}

/**
 * The rules, in one themed full-screen sheet. Shared by Home, Lobby, and the
 * table so "how do I play?" is never more than one tap away.
 */
export function HelpSheet({ onClose, jumpTo }: HelpSheetProps) {
  const lang = useLang();
  const t = T[lang];
  useScrollLock();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Mini glossary popup, anchored where the term was clicked (region coords).
  const [pop, setPop] = useState<PopState | null>(null);
  const popOpenRef = useRef(false);
  popOpenRef.current = pop !== null;

  const openTerm = (id: ConceptId, el: HTMLElement): void => {
    setPop((prev) => {
      // A see-also hop from inside the popup keeps the anchor — wiki style.
      if (prev !== null && popRef.current !== null && popRef.current.contains(el)) {
        return { ...prev, id };
      }
      const region = regionRef.current;
      if (region === null) return prev;
      const rr = region.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const up = er.top - rr.top > region.clientHeight * 0.55;
      const x = Math.max(8, Math.min(er.left - rr.left, region.clientWidth - 320));
      const y = up
        ? er.top - rr.top + region.scrollTop - 6
        : er.bottom - rr.top + region.scrollTop + 6;
      return { id, x, y, up };
    });
  };

  // The popup dismisses on any press outside it (a press on another term
  // closes it here, then that term's click reopens it at the new anchor).
  useEffect(() => {
    if (pop === null) return;
    const onDown = (e: PointerEvent): void => {
      const target = e.target;
      if (target instanceof Node && popRef.current?.contains(target)) return;
      setPop(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [pop]);

  // Focus moves into the dialog on open; Escape closes; Tab stays inside.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        // First Escape only dismisses the glossary popup; the sheet stays.
        if (popOpenRef.current) {
          setPop(null);
          return;
        }
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

  // Deep-link from a tutorial "Learn more": once painted, open the glossary
  // at the requested concept so the reader lands right on its entry.
  useEffect(() => {
    if (jumpTo === undefined) return undefined;
    const raf = requestAnimationFrame(() => jumpToTerm(jumpTo));
    return () => cancelAnimationFrame(raf);
  }, [jumpTo]);

  // Portaled to <body>: an animated (transformed) ancestor — e.g. Home's
  // rise-in footer — would otherwise become the containing block and pin
  // this "fullscreen" sheet to itself.
  return createPortal(
    <GlossOpenCtx.Provider value={openTerm}>
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
              {t.title}
            </h2>
            <button
              ref={closeRef}
              type="button"
              aria-label={t.close}
              onClick={onClose}
              className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
            >
              ✕
            </button>
          </header>

          {/* Scrollable region must be keyboard-focusable (axe). */}
          <div
            ref={regionRef}
            role="region"
            aria-label={t.rules}
            tabIndex={0}
            className="relative space-y-3 overflow-y-auto overscroll-contain px-5 py-4"
          >
            <LearningChecklist lang={lang} onReplay={onClose} />

            {RULES.map((card) => (
              <Rule key={card.title.en} title={card.title[lang]}>
                {card.body[lang]}
              </Rule>
            ))}

            <div className="flex items-center gap-3 pt-1" aria-hidden>
              <span className="h-0.5 flex-1 bg-(--color-ap-ink)/25" />
              <span className="text-(length:--text-fluid-xs) tracking-wide text-(--color-ap-muted)">
                {t.divider}
              </span>
              <span className="h-0.5 flex-1 bg-(--color-ap-ink)/25" />
            </div>

            <details className="group rounded-(--radius-ap-card) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) shadow-(--shadow-ap-sm)">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-(--radius-ap-card) p-4 hover:bg-(--color-ap-panel-hover)">
                <span className="font-arcade-display text-(length:--text-fluid-lg) uppercase text-(--color-ap-gold)">
                  {t.advanced}
                  <span className="ml-2 align-middle text-(length:--text-fluid-xs) font-normal text-(--color-ap-muted)">
                    {t.optional}
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
                {TIP_SECTIONS.map((section) => (
                  <TipSection key={section.title.en} title={section.title[lang]}>
                    {section.tips.map((tip) => (
                      <Tip key={tip.label.en} label={tip.label[lang]}>
                        {tip.body[lang]}
                      </Tip>
                    ))}
                  </TipSection>
                ))}
              </div>
            </details>

            <Glossary lang={lang} />

            {/* Absolute within the scroll content: the popup sits beside the
             * clicked term and scrolls with the text — no lost reading spot.
             * Rendered last so the space-y rhythm of the cards is untouched. */}
            {pop !== null && (
              <GlossaryPopover pop={pop} lang={lang} onClose={() => setPop(null)} popRef={popRef} />
            )}
          </div>
        </div>
      </div>
    </GlossOpenCtx.Provider>,
    document.body,
  );
}
