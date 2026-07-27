import { describe, expect, it } from 'vitest';
import type { SeatView } from '@jaffre/engine';
import { recapTakeaway } from '../src/table/recapTakeaway.js';

type Round = NonNullable<SeatView['lastRoundSummary']>;

/** A round summary with just the fields the takeaway reads. */
function round(opts: {
  seat: number;
  made: boolean;
  tricks?: readonly [number, number, number, number];
}): Round {
  return {
    roundIndex: 0,
    contract: { seat: opts.seat as 0 | 1 | 2 | 3, value: 8, sansAtout: false },
    contractMade: opts.made,
    trump: 'red',
    trickPoints: [6, 5],
    deltas: [8, 0],
    scores: [8, 0],
    ...(opts.tricks !== undefined ? { trickCounts: opts.tricks } : {}),
  } as Round;
}

describe('recapTakeaway', () => {
  it('says nothing for a spectator or a game too short to read', () => {
    expect(recapTakeaway([round({ seat: 0, made: true })], null, 'en')).toBeNull();
    expect(recapTakeaway([round({ seat: 0, made: true })], 0, 'en')).toBeNull();
  });

  it('flags a majority of missed contracts, with the real counts', () => {
    const t = recapTakeaway(
      [
        round({ seat: 0, made: false }),
        round({ seat: 2, made: false }),
        round({ seat: 0, made: true }),
      ],
      0,
      'en',
    );
    // Seats 0 and 2 are the same team as seat 0: 3 taken, 2 missed.
    expect(t?.text).toContain('missed 2 of your 3 contracts');
  });

  it('suggests bidding higher when every contract was made', () => {
    const t = recapTakeaway(
      [round({ seat: 0, made: true }), round({ seat: 2, made: true })],
      0,
      'en',
    );
    expect(t?.text).toContain('made every contract you took (2)');
  });

  it('recognises a game spent defending', () => {
    const t = recapTakeaway(
      [round({ seat: 1, made: true }), round({ seat: 3, made: false })],
      0,
      'en',
    );
    expect(t?.text).toContain('never held the contract');
  });

  it('points out a partner who carried the tricks', () => {
    // One contract each way (so neither contract branch fires), and the
    // partner (seat 2) took far more tricks than the viewer (seat 0).
    const t = recapTakeaway(
      [
        round({ seat: 0, made: true, tricks: [1, 1, 5, 1] }),
        round({ seat: 1, made: true, tricks: [0, 2, 4, 2] }),
      ],
      0,
      'en',
    );
    expect(t?.text).toContain('partner took most');
  });

  it('stays silent when the record says nothing clear', () => {
    // One contract taken and made — too little to advise either way, and no
    // trick counts to fall back on.
    const t = recapTakeaway(
      [round({ seat: 0, made: true }), round({ seat: 1, made: true })],
      0,
      'en',
    );
    expect(t).toBeNull();
  });

  it('speaks French when asked', () => {
    const t = recapTakeaway(
      [round({ seat: 1, made: true }), round({ seat: 3, made: true })],
      0,
      'fr',
    );
    expect(t?.text).toContain('jamais eu le contrat');
  });
});
