import { describe, expect, it } from 'vitest';
import {
  claimBest,
  claimRoom,
  openRooms,
  publicList,
  pruneExpired,
  watchableRooms,
  type LobbyEntry,
} from '../src/Lobby.js';

/**
 * The Lobby registry's decision logic is pure (open-room filtering, Quick-Play
 * selection, TTL pruning) and unit-tested here without the DO — the DO methods
 * are thin wrappers that read/write storage and call these. Testing the DO
 * directly trips vitest's isolated-storage teardown because register() arms an
 * alarm the harness can't pop.
 */

const NOW = 1_000_000;
function entry(over: Partial<LobbyEntry> & Pick<LobbyEntry, 'code'>): LobbyEntry {
  return { host: 'Host', players: 1, capacity: 4, phase: 'waiting', updatedAt: NOW, ...over };
}
function map(...entries: LobbyEntry[]): Record<string, LobbyEntry> {
  return Object.fromEntries(entries.map((e) => [e.code, e]));
}

describe('openRooms', () => {
  it('keeps waiting rooms with a free seat, freshest first', () => {
    const rooms = map(
      entry({ code: 'a', updatedAt: NOW - 100 }),
      entry({ code: 'b', updatedAt: NOW - 10 }),
    );
    expect(openRooms(rooms, NOW).map((r) => r.code)).toEqual(['b', 'a']);
  });

  it('excludes full, started, and expired rooms', () => {
    const rooms = map(
      entry({ code: 'full', players: 4 }),
      entry({ code: 'live', phase: 'playing' }),
      entry({ code: 'stale', updatedAt: NOW - 999_999 }),
      entry({ code: 'ok' }),
    );
    expect(openRooms(rooms, NOW).map((r) => r.code)).toEqual(['ok']);
  });
});

describe('watchableRooms', () => {
  it('keeps only live in-progress rooms, freshest first', () => {
    const rooms = map(
      entry({ code: 'live-a', phase: 'playing', updatedAt: NOW - 100 }),
      entry({ code: 'live-b', phase: 'playing', updatedAt: NOW - 10 }),
      entry({ code: 'waiting', phase: 'waiting' }),
      entry({ code: 'stale', phase: 'playing', updatedAt: NOW - 999_999 }),
    );
    expect(watchableRooms(rooms, NOW).map((r) => r.code)).toEqual(['live-b', 'live-a']);
  });
});

describe('claimBest', () => {
  it('picks the fullest joinable room, or null when none', () => {
    const rooms = map(entry({ code: 'a', players: 1 }), entry({ code: 'b', players: 3 }));
    expect(claimBest(rooms, NOW)).toBe('b');
    expect(claimBest(map(entry({ code: 'full', players: 4 })), NOW)).toBeNull();
    expect(claimBest({}, NOW)).toBeNull();
  });

  /**
   * "Started" used to mean "closed forever", which was the cold-start death
   * spiral: a lone player quick-plays into an empty room, adds bots so they
   * can actually play, the room flips to 'playing' and goes watch-only — so
   * the NEXT lone player creates another empty room instead of joining them.
   * A live game with a bot seat is now the fallback, since a spectator can
   * take that seat over mid-hand.
   */
  it('drops into a live game holding a bot seat when nothing is waiting', () => {
    const rooms = map(entry({ code: 'live', phase: 'playing', players: 2 }));
    expect(claimBest(rooms, NOW)).toBe('live');
  });

  it('still refuses a live game with no seat left — four humans is full', () => {
    const rooms = map(entry({ code: 'live', phase: 'playing', players: 4 }));
    expect(claimBest(rooms, NOW)).toBeNull();
  });

  it('prefers a table that has not dealt yet over dropping into a live one', () => {
    // Arriving before the first deal beats inheriting a bot's half-played
    // hand, even though the live table has more humans in it.
    const rooms = map(
      entry({ code: 'live', phase: 'playing', players: 3 }),
      entry({ code: 'fresh', phase: 'waiting', players: 1 }),
    );
    expect(claimBest(rooms, NOW)).toBe('fresh');
  });
});

describe('claimRoom', () => {
  it('reserves a seat so two consecutive claims land on different rooms', () => {
    const rooms = map(entry({ code: 'a', players: 3 }), entry({ code: 'b', players: 1 }));
    const first = claimRoom(rooms, NOW);
    expect(first.code).toBe('a'); // fullest joinable room first
    expect(first.rooms.a?.players).toBe(4); // reserved — now full, drops out of openRooms

    const second = claimRoom(first.rooms, NOW);
    expect(second.code).toBe('b'); // falls through to the only room left open
    expect(second.rooms.b?.players).toBe(2);
  });

  it('claiming an empty map returns null and leaves it untouched', () => {
    const result = claimRoom({}, NOW);
    expect(result.code).toBeNull();
    expect(result.rooms).toEqual({});
  });

  it('never claims a FULL playing room, and prefers a waiting one regardless', () => {
    const rooms = map(
      entry({ code: 'live', phase: 'playing', players: 4 }),
      entry({ code: 'waiting', phase: 'waiting', players: 1 }),
    );
    const result = claimRoom(rooms, NOW);
    expect(result.code).toBe('waiting');
    expect(result.rooms.live?.players).toBe(4); // untouched — never reserved into
  });

  it('reserves the seat when dropping into a live game too', () => {
    // Same anti-double-claim rule as a waiting room: two people quick-playing
    // at once must not both be sent at the one remaining bot seat.
    const rooms = map(entry({ code: 'live', phase: 'playing', players: 3 }));
    const first = claimRoom(rooms, NOW);
    expect(first.code).toBe('live');
    expect(first.rooms.live?.players).toBe(4);
    // Now full: the next claimer is sent to host their own instead.
    expect(claimRoom(first.rooms, NOW).code).toBeNull();
  });
});

describe('publicList', () => {
  it('lists waiting rooms first, then playing rooms, both TTL-filtered', () => {
    const rooms = map(
      entry({ code: 'live', phase: 'playing', players: 2 }),
      entry({ code: 'waiting', phase: 'waiting', players: 1 }),
      entry({ code: 'stale-live', phase: 'playing', updatedAt: NOW - 999_999 }),
    );
    expect(publicList(rooms, NOW).map((r) => r.code)).toEqual(['waiting', 'live']);
  });

  it('sorts by what you can DO: not-yet-dealt, then droppable, then watch-only', () => {
    // The browse list leads with tables you can act on. A full live game is
    // still listed — watching is a real thing to do — but it sorts last, and
    // the client reads join-vs-watch off `phase` + `players < capacity`.
    const rooms = map(
      entry({ code: 'full-live', phase: 'playing', players: 4 }),
      entry({ code: 'drop-in', phase: 'playing', players: 2 }),
      entry({ code: 'fresh', phase: 'waiting', players: 1 }),
    );
    expect(publicList(rooms, NOW).map((r) => r.code)).toEqual(['fresh', 'drop-in', 'full-live']);
  });

  it('lists a droppable room exactly once', () => {
    // droppableRooms is a subset of watchableRooms — concatenating them
    // without deduping would show the same table twice.
    const rooms = map(entry({ code: 'drop-in', phase: 'playing', players: 2 }));
    expect(publicList(rooms, NOW).map((r) => r.code)).toEqual(['drop-in']);
  });
});

describe('pruneExpired', () => {
  it('drops only entries past the TTL', () => {
    const rooms = map(entry({ code: 'fresh' }), entry({ code: 'old', updatedAt: NOW - 999_999 }));
    const { rooms: kept, changed } = pruneExpired(rooms, NOW);
    expect(changed).toBe(true);
    expect(Object.keys(kept)).toEqual(['fresh']);
  });

  it('reports no change when nothing is expired', () => {
    const { changed } = pruneExpired(map(entry({ code: 'fresh' })), NOW);
    expect(changed).toBe(false);
  });
});
