import { motion, type PanInfo } from 'motion/react';
import { useRef } from 'react';
import { ListBox, ListBoxItem } from 'react-aria-components';
import { useLang, type Lang } from '../i18n.js';
import type { CardData } from '../types.js';
import { cardKey, cardLabel } from '../types.js';
import { PlayingCard } from './PlayingCard';

const T: Record<Lang, { yourHand: string }> = {
  en: { yourHand: 'Your hand' },
  fr: { yourHand: 'Ta main' },
};

export interface HandCard {
  readonly card: CardData;
  readonly disabled?: boolean;
  /** Shown to the player when the card is not legal right now. */
  readonly disabledReason?: string;
  /** The Coach's suggested card — highlighted and lifted. */
  readonly recommended?: boolean;
}

export interface HandProps {
  readonly cards: readonly HandCard[];
  readonly onPlay?: (card: CardData) => void;
  /** When false the hand renders but nothing is playable (not your turn). */
  readonly active?: boolean;
  readonly label?: string;
  /**
   * Enables manual drag-to-reorder. Called with the new key order (a
   * permutation of the current card keys) when a card is dragged to a new
   * slot. Client-only cosmetic — never touches game state. Reordering is
   * allowed even when the hand isn't `active` (you can tidy any time).
   */
  readonly onReorder?: (keys: readonly string[]) => void;
}

/** Drag a card up past this (px) to play it — the "throw it on the table" gesture. */
const PLAY_DY = -60;

/**
 * The player's fanned hand. A keyboard-first listbox: arrows rove, Enter
 * plays. Illegal cards stay focusable so their reason can be announced.
 *
 * Cards support two pointer gestures beyond the tap: drag left/right to
 * rearrange the fan (when `onReorder` is set), and drag up past PLAY_DY to
 * play a legal card. The drag is a plain motion pointer drag (NOT
 * react-aria's DnD, which leaves a document-level overlay that swallows
 * later clicks): a tap still plays, but a real drag flips a guard so the
 * same pointer-up doesn't also fire `onAction`, then either plays (released
 * high enough) or computes the target slot from pointer-x vs the other
 * cards' centres and rewrites the order.
 */
export function Hand({ cards, onPlay, active = true, label, onReorder }: HandProps) {
  const lang = useLang();
  const ariaLabel = label ?? T[lang].yourHand;
  const reorderable = onReorder !== undefined && cards.length > 1;
  // Slot elements by key — their boxes stay put during a drag (only the inner
  // card translates), so their centres are the fixed drop targets.
  const slots = useRef(new Map<string, HTMLElement>());
  // Set the instant a real drag starts so the pointer-up that ends it can't
  // also be read as a tap-to-play. Cleared on the next tick (or by onAction).
  const justDragged = useRef(false);

  const reorder = (fromKey: string, info: PanInfo) => {
    const keys = cards.map((c) => cardKey(c.card));
    const others = keys.filter((k) => k !== fromKey);
    const centreOf = (k: string): number => {
      const el = slots.current.get(k);
      if (el === undefined) return Number.POSITIVE_INFINITY;
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    };
    // Drop before every card whose centre is right of the pointer.
    const idx = others.filter((k) => centreOf(k) < info.point.x).length;
    const next = [...others.slice(0, idx), fromKey, ...others.slice(idx)];
    if (next.some((k, i) => k !== keys[i])) onReorder?.(next);
  };

  return (
    <ListBox
      aria-label={ariaLabel}
      orientation="horizontal"
      selectionMode="none"
      // On narrow screens the fan overlaps harder so 8 lg cards (72px each)
      // still fit 390px while every card keeps a >=40px exposed tap strip.
      className="flex items-end justify-center -space-x-6 px-2 pt-4 max-sm:-space-x-[3.4rem] max-sm:px-0"
      onAction={(key) => {
        // Suppress the play that a drag's pointer-up would otherwise trigger.
        if (justDragged.current) {
          justDragged.current = false;
          return;
        }
        const entry = cards.find((c) => cardKey(c.card) === key);
        if (entry !== undefined && entry.disabled !== true && active) onPlay?.(entry.card);
      }}
    >
      {cards.map((entry, i) => {
        const playable = active && entry.disabled !== true;
        const key = cardKey(entry.card);
        // Gentle physical fan: outer cards tilt away from the center.
        const tilt = (i - (cards.length - 1) / 2) * 1.6;
        return (
          <ListBoxItem
            key={key}
            id={key}
            ref={(el) => {
              if (el === null) slots.current.delete(key);
              else slots.current.set(key, el);
            }}
            textValue={cardLabel(entry.card, lang)}
            aria-disabled={!playable}
            // react-aria drops the aria-disabled prop above, but forwards
            // data-* — tests and tooling read playability from this.
            data-playable={playable || undefined}
            className={`group rounded-(--radius-ap-inner) transition-transform duration-(--duration-flick) ease-(--ease-snap) ${
              entry.recommended === true ? '-translate-y-3' : ''
            } ${
              reorderable
                ? 'cursor-grab active:cursor-grabbing'
                : playable
                  ? 'cursor-pointer hover:-translate-y-3 focus-visible:-translate-y-3'
                  : 'cursor-not-allowed'
            }`}
            style={{ zIndex: entry.recommended === true ? cards.length + i : i }}
          >
            {/* layout animates the card sliding to its new spot when the hand
                is re-sorted; the inner deal-in span staggers the entrance (new
                round = new keys = fresh mount) without touching the hover-lift.
                Both are gated on no-reduced-motion. */}
            <motion.span
              layout
              className={`inline-block${reorderable || playable ? ' touch-none' : ''}`}
              // Reorderable cards drag freely (x to file, y to play); a
              // playable card in a non-reorderable hand still drags up to play.
              drag={reorderable ? true : playable ? 'y' : false}
              dragConstraints={{ top: -110, bottom: 0 }}
              dragSnapToOrigin
              dragElastic={0.4}
              dragMomentum={false}
              whileDrag={{ scale: 1.06, zIndex: 50 }}
              onDragStart={() => {
                justDragged.current = true;
              }}
              onDragEnd={(_e: PointerEvent, info: PanInfo) => {
                // Released well above the fan: play the card (legal ones
                // only). Anything else is a re-file within the hand.
                if (playable && info.offset.y < PLAY_DY) onPlay?.(entry.card);
                else if (reorderable) reorder(key, info);
                // Release the play-suppression guard once react-aria's own
                // pointer-up handling for this gesture has run.
                setTimeout(() => {
                  justDragged.current = false;
                }, 0);
              }}
            >
              <span
                className="deal-in inline-block"
                style={{ ['--deal-i' as string]: i }}
                title={!playable ? entry.disabledReason : undefined}
              >
                <PlayingCard
                  card={entry.card}
                  size="lg"
                  tilt={tilt}
                  dimmed={active && entry.disabled === true}
                  recommended={entry.recommended === true}
                />
                {!playable && entry.disabledReason !== undefined && (
                  <span className="sr-only">{entry.disabledReason}</span>
                )}
              </span>
            </motion.span>
          </ListBoxItem>
        );
      })}
    </ListBox>
  );
}
