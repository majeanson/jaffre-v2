import { sameCard, type Card, type Suit } from '@jaffre/engine';
import { cardKey, Hand, sortByColour, sortByValue, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feedback, playClick } from '../audio/clicks.js';
import { IconButton } from '../components/IconButton.js';
import { IconSort } from '../components/icons.js';
import { getProfile } from '../net/auth.js';

const FR_SUIT: Record<Suit, string> = { red: 'rouge', brown: 'brun', green: 'vert', blue: 'bleu' };

const T: Record<
  Lang,
  {
    sortColour: string;
    sortValue: string;
    follow: (suit: Suit) => string;
    notYourTurn: string;
    tapToQueue: string;
  }
> = {
  en: {
    sortColour: 'Sort your hand by colour',
    sortValue: 'Sort your hand by value, 0 to 7',
    follow: (suit) => `You must follow ${suit}`,
    notYourTurn: 'Not your turn',
    tapToQueue: 'Tap to queue for your next turn',
  },
  fr: {
    sortColour: 'Trier ta main par couleur',
    sortValue: 'Trier ta main par valeur, 0 à 7',
    follow: (suit) => `Tu dois fournir du ${FR_SUIT[suit]}`,
    notYourTurn: 'Pas ton tour',
    tapToQueue: 'Touche pour préparer ta prochaine carte',
  },
};

const DEAL_STAGGER_MS = 90; // matches the deal-in keyframe stagger in tokens.css
const SORT_STAGGER_MS = 45; // the satisfying cascade when tidying the hand

export interface HandSort {
  /** The hand in client display order (sorted / dragged); render this. */
  readonly displayCards: readonly Card[];
  /** Persist a drag rearrangement (card keys in new order). */
  readonly setOrder: (keys: readonly string[]) => void;
  /** Apply the next sort (colours ⇄ values), with the click cascade. */
  readonly sortHand: () => void;
  /** Which order the next press applies — drives the button label. */
  readonly sortMode: 'colour' | 'value';
}

/** Owns the client-only display order of your hand (sort button + drag). New
 * rounds bring new card keys, so a stale order naturally falls back to the
 * dealt order. Never touches game state. Lifted out of PlayerHand so the sort
 * button can live in the utility row next to chat. */
export function useHandSort(cards: readonly Card[]): HandSort {
  const [order, setOrder] = useState<readonly string[]>([]);

  const displayCards = useMemo<readonly Card[]>(() => {
    const byKey = new Map(cards.map((c) => [cardKey(c), c]));
    const known = new Set(order);
    const ordered = order.map((k) => byKey.get(k)).filter((c): c is Card => c !== undefined);
    const fresh = cards.filter((c) => !known.has(cardKey(c)));
    return [...ordered, ...fresh];
  }, [cards, order]);

  // Each press applies one of the two orders, alternating: colours ⇄ values.
  const [sortMode, setSortMode] = useState<'colour' | 'value'>('colour');

  const sortHand = () => {
    const sorted = (sortMode === 'colour' ? sortByColour : sortByValue)(displayCards);
    const keys = sorted.map(cardKey);
    setOrder(keys);
    setSortMode(sortMode === 'colour' ? 'value' : 'colour');
    // The click cascade only when cards actually move — a no-op sort is silent.
    const changed = displayCards.some((c, i) => cardKey(c) !== keys[i]);
    if (!changed) return;
    displayCards.forEach((_, i) => setTimeout(() => playClick('sort'), i * SORT_STAGGER_MS));
    feedback('sort', 6);
  };

  return { displayCards, setOrder, sortHand, sortMode };
}

/** The sort-hand icon button, fed by useHandSort — sits in the utility row. */
export function HandSortButton({ sort }: { readonly sort: HandSort }) {
  const t = T[useLang()];
  return (
    <IconButton
      label={sort.sortMode === 'colour' ? t.sortColour : t.sortValue}
      onClick={sort.sortHand}
    >
      <IconSort />
    </IconButton>
  );
}

export interface PlayerHandProps {
  /** Your hand in display order (from useHandSort). */
  readonly cards: readonly Card[];
  /** Cards you may legally play right now. */
  readonly legal: readonly Card[];
  readonly ledSuit: Suit | null;
  /** True when it's your turn to play a card. */
  readonly active: boolean;
  readonly onPlay: (card: Card) => void;
  /** Persist a drag rearrangement (card keys in new order). */
  readonly onReorder: (keys: readonly string[]) => void;
  /** The Coach's suggested card, highlighted in the fan (null when off). */
  readonly recommended?: Card | null;
  /** The card queued to auto-play on your next turn (null when none). */
  readonly queued?: Card | null;
  /** Cards that may be queued right now (empty when it's your turn). */
  readonly queueable?: readonly Card[];
  /** Tap on a queueable card while waiting — queues or unqueues it. */
  readonly onQueueToggle?: (card: Card) => void;
}

/** Owns your hand along the bottom edge, with legality + disabled-reason hints. */
export function PlayerHand({
  cards,
  legal,
  ledSuit,
  active,
  onPlay,
  onReorder,
  recommended = null,
  queued = null,
  queueable = [],
  onQueueToggle,
}: PlayerHandProps) {
  const t = T[useLang()];
  // Your painted card (if any) personalises only YOUR red-0/brown-0 — the Hand
  // renders only your cards, so this never leaks onto an opponent's specials.
  const paint = getProfile().paint;

  // A fresh full hand (a new round's deal) ticks each card in as it lands —
  // synced to the visual deal-in stagger. Skips the cascade under reduced motion.
  const hadFull = useRef(false);
  useEffect(() => {
    const nowFull = cards.length === 8;
    if (nowFull && !hadFull.current) {
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        feedback('deal', 5);
      } else {
        const timers = cards.map((_, i) =>
          setTimeout(() => feedback('deal', 5), i * DEAL_STAGGER_MS),
        );
        hadFull.current = true;
        return () => timers.forEach(clearTimeout);
      }
    }
    hadFull.current = nowFull;
    return undefined;
  }, [cards.length]);

  return (
    <div className="shrink-0 pb-1">
      <Hand
        active={active}
        paint={paint}
        onReorder={(keys) => {
          onReorder(keys);
          feedback('select', 4);
        }}
        cards={cards.map((card) => {
          const isQueueable = queueable.some((c) => sameCard(c, card));
          return {
            card,
            disabled: !active || !legal.some((c) => sameCard(c, card)),
            disabledReason:
              !active && isQueueable
                ? t.tapToQueue
                : ledSuit !== null && card.suit !== ledSuit
                  ? t.follow(ledSuit)
                  : t.notYourTurn,
            recommended: recommended !== null && sameCard(recommended, card),
            queued: queued !== null && sameCard(queued, card),
            queueable: isQueueable,
          };
        })}
        onPlay={(card) => {
          feedback('play');
          onPlay(card as Card);
        }}
        onQueueToggle={(card) => {
          feedback('select', 4);
          onQueueToggle?.(card as Card);
        }}
      />
    </div>
  );
}
