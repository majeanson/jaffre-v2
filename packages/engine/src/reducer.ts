import { resolveContract, outbids, highestBid } from './bidding.js';
import { deal } from './deck.js';
import { decideWinner, legalCards, trickPoints, trickWinner } from './rules.js';
import type {
  Action,
  BidChoice,
  Card,
  EngineErrorCode,
  GameEvent,
  GameState,
  Result,
  RoundSummary,
  Seat,
  Team,
} from './types.js';
import { nextSeat, sameCard, teamOf } from './types.js';

export function createGame(seed: number): GameState {
  return dealRound(seed, 0, 0, [0, 0]);
}

function dealRound(
  seed: number,
  roundIndex: number,
  dealer: Seat,
  scores: readonly [number, number],
  lastRoundSummary: RoundSummary | null = null,
  roundSummaries: readonly RoundSummary[] = [],
): GameState {
  return {
    schemaVersion: 1,
    seed,
    phase: 'bidding',
    roundIndex,
    dealer,
    turn: nextSeat(dealer),
    hands: deal(seed, roundIndex),
    bids: [],
    contract: null,
    trump: null,
    trumpDecided: false,
    currentTrick: [],
    trickLeader: dealer,
    capturedTricks: [],
    roundPoints: [0, 0],
    scores,
    lastRoundSummary,
    roundSummaries,
    winner: null,
  };
}

export function applyAction(state: GameState, action: Action): Result {
  switch (action.type) {
    case 'place_bid':
      return placeBid(state, action.seat, action.choice);
    case 'play_card':
      return playCard(state, action.seat, action.card);
    case 'continue':
      return advanceRound(state);
  }
}

function placeBid(state: GameState, seat: Seat, choice: BidChoice): Result {
  if (state.phase !== 'bidding') {
    return fail('WRONG_PHASE', `Cannot bid during ${state.phase}.`);
  }
  if (seat !== state.turn) {
    return fail('NOT_YOUR_TURN', `It is seat ${state.turn}'s turn to bid.`);
  }
  if (choice.kind === 'bid' && !outbids(choice, highestBid(state.bids))) {
    return fail('ILLEGAL_BID', 'Bid must outbid the current highest bid.');
  }

  const bids = [...state.bids, { seat, choice }];
  const events: GameEvent[] = [{ type: 'bid_placed', seat, choice }];

  if (bids.length < 4) {
    return { ok: true, state: { ...state, bids, turn: nextSeat(seat) }, events };
  }

  const contract = resolveContract(bids, state.dealer);
  events.push({ type: 'bidding_won', contract });
  const trumpDecided = contract.sansAtout;
  if (trumpDecided) events.push({ type: 'trump_set', trump: null });

  return {
    ok: true,
    state: {
      ...state,
      phase: 'playing',
      bids,
      contract,
      trumpDecided,
      turn: contract.seat,
      trickLeader: contract.seat,
    },
    events,
  };
}

function playCard(state: GameState, seat: Seat, card: Card): Result {
  if (state.phase !== 'playing') {
    return fail('WRONG_PHASE', `Cannot play a card during ${state.phase}.`);
  }
  if (seat !== state.turn) {
    return fail('NOT_YOUR_TURN', `It is seat ${state.turn}'s turn to play.`);
  }
  const hand = state.hands[seat] as readonly Card[];
  if (!hand.some((c) => sameCard(c, card))) {
    return fail('CARD_NOT_IN_HAND', 'That card is not in your hand.');
  }
  const first = state.currentTrick[0];
  const ledSuit = first === undefined ? null : first.card.suit;
  if (!legalCards(hand, ledSuit).some((c) => sameCard(c, card))) {
    return fail('MUST_FOLLOW_SUIT', `You must follow ${String(ledSuit)}.`);
  }

  const events: GameEvent[] = [];
  let trump = state.trump;
  let trumpDecided = state.trumpDecided;
  if (!trumpDecided) {
    trump = card.suit;
    trumpDecided = true;
    events.push({ type: 'trump_set', trump });
  }
  events.push({ type: 'card_played', seat, card });

  const hands = state.hands.map((h, i) => (i === seat ? h.filter((c) => !sameCard(c, card)) : h));
  const currentTrick = [...state.currentTrick, { seat, card }];

  if (currentTrick.length < 4) {
    return {
      ok: true,
      state: { ...state, hands, currentTrick, trump, trumpDecided, turn: nextSeat(seat) },
      events,
    };
  }

  // Trick complete.
  const winner = trickWinner(currentTrick, trump).seat;
  const cards = currentTrick.map((p) => p.card);
  const { points, specials } = trickPoints(cards);
  events.push({ type: 'trick_won', winner, points, specials });

  const roundPoints: [number, number] = [...state.roundPoints] as [number, number];
  roundPoints[teamOf(winner)] += points;
  const capturedTricks = [...state.capturedTricks, { winner, cards, plays: currentTrick, points }];

  const played: GameState = {
    ...state,
    hands,
    currentTrick: [],
    trump,
    trumpDecided,
    trickLeader: winner,
    turn: winner,
    capturedTricks,
    roundPoints,
  };

  if (capturedTricks.length < 8) {
    return { ok: true, state: played, events };
  }
  return scoreRound(played, events);
}

function scoreRound(state: GameState, events: GameEvent[]): Result {
  const contract = state.contract as NonNullable<GameState['contract']>;
  const contractTeam = teamOf(contract.seat);
  const defenderTeam: Team = contractTeam === 0 ? 1 : 0;
  const contractMade = state.roundPoints[contractTeam] >= contract.value;
  const stake = contract.value * (contract.sansAtout ? 2 : 1);

  const deltas: [number, number] = [0, 0];
  deltas[contractTeam] = contractMade ? stake : -stake;
  deltas[defenderTeam] = state.roundPoints[defenderTeam];

  const scores: [number, number] = [state.scores[0] + deltas[0], state.scores[1] + deltas[1]];

  const summary: RoundSummary = {
    roundIndex: state.roundIndex,
    contract,
    contractMade,
    trickPoints: state.roundPoints,
    deltas,
    scores,
  };
  events.push({ type: 'round_scored', summary });

  const roundSummaries = [...state.roundSummaries, summary];
  const winner = decideWinner(scores, contractTeam);

  if (winner !== null) {
    events.push({ type: 'game_over', winner });
    return {
      ok: true,
      state: { ...state, phase: 'game_over', scores, lastRoundSummary: summary, roundSummaries, winner },
      events,
    };
  }
  return {
    ok: true,
    state: { ...state, phase: 'round_over', scores, lastRoundSummary: summary, roundSummaries },
    events,
  };
}

function advanceRound(state: GameState): Result {
  if (state.phase !== 'round_over') {
    return fail('WRONG_PHASE', `Cannot continue during ${state.phase}.`);
  }
  const next = dealRound(
    state.seed,
    state.roundIndex + 1,
    nextSeat(state.dealer),
    state.scores,
    state.lastRoundSummary,
    state.roundSummaries,
  );
  return {
    ok: true,
    state: next,
    events: [
      {
        type: 'round_started',
        roundIndex: next.roundIndex,
        dealer: next.dealer,
        hands: next.hands,
      },
    ],
  };
}

function fail(code: EngineErrorCode, message: string): Result {
  return { ok: false, error: { code, message } };
}
