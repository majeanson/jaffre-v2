import { describe, expect, it } from 'vitest';
import { highestBid, legalBidChoices, outbids, resolveContract } from '../src/bidding.js';
import { applyAction, createGame } from '../src/reducer.js';
import type { BidEntry } from '../src/types.js';
import { bid, bidPhase, PASS } from './helpers/driver.js';

describe('outbids', () => {
  it('any bid beats no bid', () => {
    expect(outbids({ value: 7, sansAtout: false }, null)).toBe(true);
  });

  it('higher value wins', () => {
    expect(outbids({ value: 8, sansAtout: false }, { seat: 0, value: 7, sansAtout: true })).toBe(
      true,
    );
    expect(outbids({ value: 7, sansAtout: true }, { seat: 0, value: 8, sansAtout: false })).toBe(
      false,
    );
  });

  it('equal value: sans-atout beats plain, nothing else', () => {
    expect(outbids({ value: 9, sansAtout: true }, { seat: 0, value: 9, sansAtout: false })).toBe(
      true,
    );
    expect(outbids({ value: 9, sansAtout: false }, { seat: 0, value: 9, sansAtout: false })).toBe(
      false,
    );
    expect(outbids({ value: 9, sansAtout: true }, { seat: 0, value: 9, sansAtout: true })).toBe(
      false,
    );
    expect(outbids({ value: 9, sansAtout: false }, { seat: 0, value: 9, sansAtout: true })).toBe(
      false,
    );
  });
});

describe('highestBid / resolveContract', () => {
  const entries: BidEntry[] = [
    { seat: 1, choice: { kind: 'bid', value: 7, sansAtout: false } },
    { seat: 2, choice: { kind: 'pass' } },
    { seat: 3, choice: { kind: 'bid', value: 7, sansAtout: true } },
    { seat: 0, choice: { kind: 'pass' } },
  ];

  it('finds the strongest bid', () => {
    expect(highestBid(entries)).toEqual({ seat: 3, value: 7, sansAtout: true });
    expect(highestBid([])).toBeNull();
  });

  it('resolves the contract to the strongest bidder', () => {
    expect(resolveContract(entries, 0)).toEqual({
      seat: 3,
      value: 7,
      sansAtout: true,
      forced: false,
    });
  });

  it('forces the dealer to a plain 7 when everyone passes', () => {
    const allPass: BidEntry[] = [1, 2, 3, 0].map((seat) => ({
      seat: seat as BidEntry['seat'],
      choice: { kind: 'pass' },
    }));
    expect(resolveContract(allPass, 0)).toEqual({
      seat: 0,
      value: 7,
      sansAtout: false,
      forced: true,
    });
  });
});

describe('legalBidChoices', () => {
  it('offers pass plus everything above the current best', () => {
    const choices = legalBidChoices([
      { seat: 1, choice: { kind: 'bid', value: 11, sansAtout: false } },
    ]);
    expect(choices).toContainEqual({ kind: 'pass' });
    expect(choices).toContainEqual({ kind: 'bid', value: 11, sansAtout: true });
    expect(choices).toContainEqual({ kind: 'bid', value: 12, sansAtout: false });
    expect(choices).toContainEqual({ kind: 'bid', value: 12, sansAtout: true });
    expect(choices).toHaveLength(4);
  });

  it('offers all 13 choices on an open auction', () => {
    expect(legalBidChoices([])).toHaveLength(13);
  });
});

describe('reducer: bidding flow', () => {
  it('starts left of the dealer', () => {
    const state = createGame(1);
    expect(state.dealer).toBe(0);
    expect(state.turn).toBe(1);
    expect(state.phase).toBe('bidding');
  });

  it('rejects bids out of turn', () => {
    const state = createGame(1);
    const result = applyAction(state, { type: 'place_bid', seat: 2, choice: PASS });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
  });

  it('rejects a bid that does not outbid the current best', () => {
    const state = bidPhase(1, [bid(9)]);
    const result = applyAction(state, { type: 'place_bid', seat: state.turn, choice: bid(8) });
    expect(result).toMatchObject({ ok: false, error: { code: 'ILLEGAL_BID' } });
  });

  it('rejects bids outside the bidding phase', () => {
    const state = bidPhase(1, [bid(7), PASS, PASS, PASS]);
    expect(state.phase).toBe('playing');
    const result = applyAction(state, { type: 'place_bid', seat: state.turn, choice: PASS });
    expect(result).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
  });

  it('awards the contract to the highest bidder, who leads first', () => {
    const state = bidPhase(1, [bid(7), bid(8), PASS, bid(8, true)]);
    expect(state.phase).toBe('playing');
    expect(state.contract).toEqual({ seat: 0, value: 8, sansAtout: true, forced: false });
    expect(state.turn).toBe(0);
    expect(state.trickLeader).toBe(0);
    expect(state.trumpDecided).toBe(true);
    expect(state.trump).toBeNull();
  });

  it('forces the dealer to 7 when all pass', () => {
    const state = bidPhase(1, [PASS, PASS, PASS, PASS]);
    expect(state.contract).toEqual({ seat: 0, value: 7, sansAtout: false, forced: true });
    expect(state.turn).toBe(0);
    expect(state.trumpDecided).toBe(false);
  });

  it('emits bid_placed, bidding_won and trump_set(null) for a sans-atout auction', () => {
    let state = createGame(1);
    for (const choice of [bid(7, true), PASS, PASS]) {
      const r = applyAction(state, { type: 'place_bid', seat: state.turn, choice });
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    const last = applyAction(state, { type: 'place_bid', seat: state.turn, choice: PASS });
    expect(last.ok).toBe(true);
    if (last.ok) {
      expect(last.events.map((e) => e.type)).toEqual(['bid_placed', 'bidding_won', 'trump_set']);
    }
  });
});
