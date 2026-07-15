import type { Card, GameEvent, SeatView, Viewer } from '@jaffre/engine';
import type { ChatEntry, Roster } from '@jaffre/protocol';
import { create } from 'zustand';
import { announce } from '../a11y/announcer.js';

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
  setSweep: (position: 0 | 1 | 2 | 3) => void;
  clearHeldTrick: () => void;

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

  setConnection: (connection) => set({ connection }),
  welcome: (viewer, view, seq, roster, chat) =>
    set({ viewer, view, seq, roster, chat, connection: 'open' }),
  setView: (view, seq) => set({ view, seq }),
  applyEvents: (events, seq, view) =>
    set((s) => {
      const names = seatNames(s.roster);
      const lines = events.map((e) => ({ id: logId++, text: announce(e, names) }));
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
  setRoster: (roster) => set({ roster }),
  addChat: (entry) => set((s) => ({ chat: [...s.chat.slice(-99), entry] })),
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
    }),
}));

/** Rotate an absolute seat into a table-relative position (you = bottom/0). */
export function toPosition(seat: number, viewer: Viewer | null): 0 | 1 | 2 | 3 {
  const me = viewer === null || viewer === 'spectator' ? 0 : viewer;
  return ((((seat - me) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}
