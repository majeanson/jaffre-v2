import type { Card, GameEvent, SeatView, Viewer } from '@jaffre/engine';
import type { ChatEntry, Roster } from '@jaffre/protocol';
import { create } from 'zustand';
import { announce } from '../a11y/announcer.js';
import { currentLang } from '../lang.js';

export type Connection = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface LogLine {
  readonly id: number;
  readonly text: string;
}

export interface HeldTrick {
  readonly plays: readonly { readonly seat: number; readonly card: Card }[];
  readonly winner: number;
  readonly points: number;
  readonly specials: readonly ('red_zero' | 'brown_zero')[];
}

interface GameStore {
  connection: Connection;
  viewer: Viewer | null;
  view: SeatView | null;
  seq: number;
  roster: Roster | null;
  chat: readonly ChatEntry[];
  log: readonly LogLine[];
  /** Seat position (table-relative) the current trick should sweep toward. */
  sweepTo: 0 | 1 | 2 | 3 | null;
  /**
   * A just-completed trick, held on the table so players can see all four
   * cards and the points before it sweeps to the winner.
   */
  heldTrick: HeldTrick | null;
  /**
   * A card pre-selected while it isn't your turn, auto-played when it is.
   * Client-only convenience — validated again at fire time (useQueuedPlay).
   */
  queued: Card | null;
  setSweep: (position: 0 | 1 | 2 | 3) => void;
  clearHeldTrick: () => void;
  setQueued: (card: Card | null) => void;

  setConnection: (connection: Connection) => void;
  welcome: (
    viewer: Viewer,
    view: SeatView | null,
    seq: number,
    roster: Roster,
    chat: readonly ChatEntry[],
  ) => void;
  setView: (view: SeatView, seq: number) => void;
  applyEvents: (events: readonly GameEvent[], seq: number, view?: SeatView) => void;
  setRoster: (roster: Roster) => void;
  addChat: (entry: ChatEntry) => void;
  reset: () => void;
}

let logId = 0;

const seatNames = (roster: Roster | null): string[] =>
  [0, 1, 2, 3].map((i) => roster?.seats[i]?.name ?? `Seat ${i + 1}`);

export const useGameStore = create<GameStore>((set) => ({
  connection: 'idle',
  viewer: null,
  view: null,
  seq: 0,
  roster: null,
  chat: [],
  log: [],
  sweepTo: null,
  heldTrick: null,
  queued: null,

  setConnection: (connection) => set({ connection }),
  welcome: (viewer, view, seq, roster, chat) =>
    set({ viewer, view, seq, roster, chat, connection: 'open' }),
  setView: (view, seq) => set({ view, seq }),
  applyEvents: (events, seq, view) =>
    set((s) => {
      const names = seatNames(s.roster);
      const lines = events.map((e) => ({ id: logId++, text: announce(e, names, currentLang()) }));
      const trickWon = events.find((e) => e.type === 'trick_won');
      const lastPlay = [...events].reverse().find((e) => e.type === 'card_played');
      // Hold the completed trick (previous 3 cards + the closing card) so the
      // table can show all four cards + points before sweeping to the winner.
      let heldTrick: HeldTrick | null = null;
      if (trickWon?.type === 'trick_won' && lastPlay?.type === 'card_played') {
        heldTrick = {
          plays: [...(s.view?.currentTrick ?? []), { seat: lastPlay.seat, card: lastPlay.card }],
          winner: trickWon.winner,
          points: trickWon.points,
          specials: trickWon.specials,
        };
      }
      return {
        view: view ?? s.view,
        seq,
        log: [...s.log.slice(-120), ...lines],
        heldTrick: heldTrick ?? s.heldTrick,
        sweepTo: heldTrick !== null ? null : s.sweepTo,
      };
    }),
  setSweep: (position) => set({ sweepTo: position }),
  clearHeldTrick: () => set({ heldTrick: null, sweepTo: null }),
  setQueued: (card) => set({ queued: card }),
  setRoster: (roster) => set({ roster }),
  addChat: (entry) =>
    set((s) => {
      // Idempotent: the same entry can be delivered more than once (relayed to
      // several sockets for one user, replayed on reconnect, or already present
      // in the welcome chatTail). Dedupe by (from, at, text) — the throttle
      // guarantees genuine messages differ in `at`, so this never drops a real
      // one. Fixes chat messages rendering multiple times.
      if (s.chat.some((e) => e.at === entry.at && e.from === entry.from && e.text === entry.text)) {
        return {};
      }
      return { chat: [...s.chat.slice(-99), entry] };
    }),
  reset: () =>
    set({
      connection: 'idle',
      viewer: null,
      view: null,
      seq: 0,
      roster: null,
      chat: [],
      log: [],
      sweepTo: null,
      heldTrick: null,
      queued: null,
    }),
}));

/** Rotate an absolute seat into a table-relative position (you = bottom/0). */
export function toPosition(seat: number, viewer: Viewer | null): 0 | 1 | 2 | 3 {
  const me = viewer === null || viewer === 'spectator' ? 0 : viewer;
  return ((((seat - me) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}
