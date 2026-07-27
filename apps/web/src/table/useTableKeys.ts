import type { Card } from '@jaffre/engine';
import { sameCard } from '@jaffre/engine';
import type { ClientAction } from '@jaffre/protocol';
import { useEffect, useRef } from 'react';
import type { BidOption } from '@jaffre/ui';

/** The six bid values, in the order the bid cards are shown. */
const BID_VALUES = [7, 8, 9, 10, 11, 12] as const;

export interface TableKeysConfig {
  readonly onAction: (action: ClientAction) => void;
  /** The hand exactly as displayed, left to right — 1..8 index into this. */
  readonly cards: readonly Card[];
  /** Cards playable right now (empty unless it's your play turn). */
  readonly legal: readonly Card[];
  /** Cards that may be pre-committed while you wait. */
  readonly queueable: readonly Card[];
  /** Queue a card for your next turn (null clears). */
  readonly setQueued: (card: Card | null) => void;
  readonly queued: Card | null;
  /** Legal bids right now (empty unless it's your bidding turn). */
  readonly bidOptions: readonly BidOption[];
  readonly phase: string;
  readonly onToggleLog: () => void;
  /** Present in online rooms only. */
  readonly onToggleChat?: (() => void) | undefined;
}

/**
 * True when a keystroke belongs to something else on screen: a text field
 * (chat, room code, the music link box) or an open modal sheet (help,
 * settings, the recap). Typing "c" into chat must never toggle a panel.
 */
function typingElsewhere(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLElement) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) {
      return true;
    }
  }
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/**
 * Keyboard play for the felt, on top of the hand's existing arrow/Enter
 * listbox navigation:
 *
 *   1–8   play that card in your hand (queues it when you're not up yet)
 *   1–6   during the auction, bid 7–12 (the bid cards, left to right)
 *   P     pass
 *   L     game log · C  chat
 *
 * Every binding is a no-op when the key belongs to a text field or a modal,
 * and modified keystrokes (⌘/Ctrl/Alt) are always left to the browser.
 */
export function useTableKeys(config: TableKeysConfig): void {
  // The config changes identity every render; keep the latest without
  // re-binding the listener on each one.
  const ref = useRef(config);
  useEffect(() => {
    ref.current = config;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (typingElsewhere()) return;
      const c = ref.current;
      const key = e.key.toLowerCase();

      if (key === 'l') {
        e.preventDefault();
        c.onToggleLog();
        return;
      }
      if (key === 'c' && c.onToggleChat !== undefined) {
        e.preventDefault();
        c.onToggleChat();
        return;
      }

      if (c.phase === 'bidding') {
        if (key === 'p') {
          if (c.bidOptions.length === 0) return;
          e.preventDefault();
          c.onAction({ type: 'place_bid', choice: { kind: 'pass' } });
          return;
        }
        const slot = Number(e.key);
        if (!Number.isInteger(slot) || slot < 1 || slot > BID_VALUES.length) return;
        const value = BID_VALUES[slot - 1];
        if (value === undefined) return;
        // Plain bids only — sans atout stays a deliberate two-part choice on
        // the panel, where the ★ toggle shows what you're committing to.
        const option = c.bidOptions.find((o) => o.value === value && !o.sansAtout);
        if (option === undefined) return;
        e.preventDefault();
        c.onAction({ type: 'place_bid', choice: { kind: 'bid', value, sansAtout: false } });
        return;
      }

      if (c.phase !== 'playing') return;
      const slot = Number(e.key);
      if (!Number.isInteger(slot) || slot < 1 || slot > c.cards.length) return;
      const card = c.cards[slot - 1];
      if (card === undefined) return;
      if (c.legal.some((x) => sameCard(x, card))) {
        e.preventDefault();
        c.onAction({ type: 'play_card', card });
        return;
      }
      // Not your turn yet (or a trick is being held): same key pre-commits,
      // and pressing it again on the queued card takes it back.
      if (c.queueable.some((x) => sameCard(x, card))) {
        e.preventDefault();
        c.setQueued(c.queued !== null && sameCard(card, c.queued) ? null : card);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
