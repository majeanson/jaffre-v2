import { sameCard, type Card, type Suit } from '@jaffre/engine';
import { cardKey, Hand, sortByColour, sortByValue, useLang, type Lang } from '@jaffre/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feedback, playClick } from '../audio/clicks.js';
import { IconButton } from '../components/IconButton.js';
import { IconSort } from '../components/icons.js';
import { getProfile } from '../net/auth.js';
import { DEAL_TOTAL_MS, HAND_SIZE, fanShowMs } from './dealPace.js';
import { paced } from './pacePref.js';

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

/** The player's last APPLIED sort — persisted so a habitual "I sort by
 * colour" (or value) preference survives a reload and carries into the next
 * deal, instead of every fresh hand starting from the same hardcoded order. */
const HAND_SORT_KEY = 'jaffre:handSort';

function loadSortMode(): 'colour' | 'value' {
  try {
    return localStorage.getItem(HAND_SORT_KEY) === 'value' ? 'value' : 'colour';
  } catch {
    return 'colour'; // Storage can throw (private mode, quota) — session-only then.
  }
}

function saveSortMode(mode: 'colour' | 'value'): void {
  try {
    localStorage.setItem(HAND_SORT_KEY, mode);
  } catch {
    // Same as above: worst case the choice doesn't survive a reload.
  }
}

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
  // Seeded from the persisted preference (G3) rather than a hardcoded
  // 'colour' — the button's very first press picks up where you left off.
  const [sortMode, setSortMode] = useState<'colour' | 'value'>(loadSortMode);

  // A hand only ever shrinks within a round, so a growing one is a fresh deal:
  // recompute the order from scratch (some card keys repeat, so the previous
  // round's `order` alone would half-apply) and RE-APPLY the persisted sort —
  // a fresh hand tidies itself the way you last asked, not a hardcoded colour
  // pass every time.
  const handCount = useRef(cards.length);
  useEffect(() => {
    if (cards.length > handCount.current) {
      const applied = loadSortMode();
      const sorted = (applied === 'colour' ? sortByColour : sortByValue)(cards);
      setOrder(sorted.map(cardKey));
      setSortMode(applied === 'colour' ? 'value' : 'colour');
    }
    handCount.current = cards.length;
  }, [cards]);

  const sortHand = () => {
    const applied = sortMode;
    const sorted = (applied === 'colour' ? sortByColour : sortByValue)(displayCards);
    const keys = sorted.map(cardKey);
    setOrder(keys);
    setSortMode(applied === 'colour' ? 'value' : 'colour');
    saveSortMode(applied);
    // The click cascade only when cards actually move — a no-op sort is silent.
    const changed = displayCards.some((c, i) => cardKey(c) !== keys[i]);
    if (!changed) return;
    displayCards.forEach((_, i) => setTimeout(() => playClick('sort'), i * SORT_STAGGER_MS));
    feedback('sort', 6);
  };

  return { displayCards, setOrder, sortHand, sortMode };
}

/** The sort-hand icon button, fed by useHandSort — a cell of the utility bar.
 * Disabled (rather than removed) when the hand has nothing to sort, so the
 * bar keeps the same shape all game. */
export function HandSortButton({
  sort,
  disabled = false,
}: {
  readonly sort: HandSort;
  readonly disabled?: boolean;
}) {
  const t = T[useLang()];
  return (
    <IconButton
      plain
      disabled={disabled}
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
  /** Bumped once per animated deal (dealPace): the fan then fills one card at
   * a time, in step with the deck's fly-out, instead of appearing whole. */
  readonly dealKey?: number;
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
  dealKey = 0,
}: PlayerHandProps) {
  const t = T[useLang()];
  // Your painted card (if any) personalises only YOUR red-0/brown-0 — the Hand
  // renders only your cards, so this never leaks onto an opponent's specials.
  const paint = getProfile().paint;

  // The deal actually deals: the fan holds back and takes its cards one at a
  // time, each landing (and clicking) as the deck's fly-out reaches you.
  // `null` = show the whole hand, the state every moment outside a deal.
  const [dealt, setDealt] = useState<number | null>(null);
  const dealRunning = useRef(false);
  // Sticky ON at the first animated deal, never off again — the Hand zeroes
  // its deal-in stagger under it (each card pops the instant its flight
  // lands), and flipping it back after a deal would retro-change the
  // animation-delay of just-played entrances mid-animation (see HandProps).
  const [everDealt, setEverDealt] = useState(false);
  useEffect(() => {
    if (dealKey === 0) return undefined;
    dealRunning.current = true;
    setEverDealt(true);
    setDealt(0);
    // Each card appears the instant ITS flight lands (dealPace's one shared
    // schedule — the deck's fly-out reads the same numbers), not on a lead +
    // even stagger of our own that could drift from what's on screen.
    const timers = Array.from({ length: HAND_SIZE }, (_, i) =>
      setTimeout(
        () => {
          setDealt(i + 1);
          feedback('deal', 5);
        },
        paced(fanShowMs(i)),
      ),
    );
    // Back to "show everything": a hand shrinks as you play it, so a fixed
    // count must never outlive its own deal.
    const done = setTimeout(() => {
      dealRunning.current = false;
      setDealt(null);
    }, paced(DEAL_TOTAL_MS));
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
      dealRunning.current = false;
      setDealt(null);
    };
  }, [dealKey]);

  // The click cascade for every OTHER way a full hand arrives (reduced motion,
  // replay scrubbing, a mid-round reload) — the deal above brings its own.
  const hadFull = useRef(false);
  useEffect(() => {
    const nowFull = cards.length === 8;
    if (nowFull && !hadFull.current && !dealRunning.current) {
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

  const shown = dealt === null ? cards : cards.slice(0, dealt);

  return (
    // min-h reserves the fan's full footprint (lg card height 7/5 × its width
    // clamp, + the ListBox pt-4 + our pb-1) even when the hand is empty, so
    // the stage above keeps ONE size instead of growing as cards run out.
    <div className="min-h-[calc(clamp(8.4rem,21vmin,16.8rem)+1.25rem)] shrink-0 pb-1">
      <Hand
        active={active}
        paint={paint}
        dealing={everDealt}
        onReorder={(keys) => {
          onReorder(keys);
          feedback('select', 4);
        }}
        cards={shown.map((card) => {
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
