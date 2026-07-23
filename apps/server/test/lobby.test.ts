import { describe, expect, it } from 'vitest';
import { claimBest, claimRoom, openRooms, pruneExpired, type LobbyEntry } from '../src/Lobby.js';

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

describe('claimBest', () => {
  it('picks the fullest joinable room, or null when none', () => {
    const rooms = map(entry({ code: 'a', players: 1 }), entry({ code: 'b', players: 3 }));
    expect(claimBest(rooms, NOW)).toBe('b');
    expect(claimBest(map(entry({ code: 'full', players: 4 })), NOW)).toBeNull();
    expect(claimBest({}, NOW)).toBeNull();
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
