/**
 * Narrated game simulator — the M3 rules-verification tool.
 *
 *   npm run sim -- --seed 7            # narrate one full game
 *   npm run sim -- --seed 7 --rounds 2 # stop after N rounds
 *   npm run sim -- --stats 500         # aggregate stats over many seeds
 */
import type { Action, BidChoice, Card, GameState, Rng } from '../packages/engine/src/index.js';
import {
  applyAction,
  createGame,
  legalBidChoices,
  legalCards,
  mulberry32,
  teamOf,
} from '../packages/engine/src/index.js';

const SUIT_ICONS: Record<Card['suit'], string> = {
  red: '🔴R',
  brown: '🟤B',
  green: '🟢G',
  blue: '🔵U',
};

const PLAYER_NAMES = ['North', 'East', 'South', 'West'] as const;

function fmtCard(card: Card): string {
  return `${SUIT_ICONS[card.suit]}${card.value}`;
}

function fmtHand(hand: readonly Card[]): string {
  return [...hand]
    .sort((a, b) => (a.suit === b.suit ? a.value - b.value : a.suit.localeCompare(b.suit)))
    .map(fmtCard)
    .join(' ');
}

function fmtBid(choice: BidChoice): string {
  if (choice.kind === 'pass') return 'passes';
  return `bids ${choice.value}${choice.sansAtout ? ' SANS ATOUT' : ''}`;
}

function randomAction(state: GameState, rng: Rng): Action {
  if (state.phase === 'bidding') {
    const bidsOnly = legalBidChoices(state.bids, state.turn === state.dealer).filter(
      (c) => c.kind === 'bid',
    );
    const choice: BidChoice =
      // 0.85, matching the engine test driver — see its comment: below this the
      // random model stops converging now that a round holds 10 points, not 11.
      // NOTE this simulator is a random-play model, NOT the real bots; use
      // `npm run botbench` for anything about how the shipped AI behaves.
      rng() < 0.85 || bidsOnly.length === 0
        ? { kind: 'pass' }
        : (bidsOnly[Math.floor(rng() ** 2 * bidsOnly.length)] as BidChoice);
    return { type: 'place_bid', seat: state.turn, choice };
  }
  if (state.phase === 'playing') {
    const hand = state.hands[state.turn] as readonly Card[];
    const led = state.currentTrick[0]?.card.suit ?? null;
    const legal = legalCards(hand, led);
    return {
      type: 'play_card',
      seat: state.turn,
      card: legal[Math.floor(rng() * legal.length)] as Card,
    };
  }
  return { type: 'continue' };
}

function narrateGame(seed: number, maxRounds: number): void {
  const rng = mulberry32(seed ^ 0x5eed);
  let state = createGame(seed);
  const log = (s: string) => console.log(s);

  log(`\n════════ GAME seed=${seed} — first team to 41 ════════`);
  log(
    `Teams: ${PLAYER_NAMES[0]}+${PLAYER_NAMES[2]} (Team A) vs ${PLAYER_NAMES[1]}+${PLAYER_NAMES[3]} (Team B)`,
  );

  let announcedRound = -1;
  while (state.phase !== 'game_over' && state.roundIndex < maxRounds) {
    if (state.roundIndex !== announcedRound) {
      announcedRound = state.roundIndex;
      log(`\n─── Round ${state.roundIndex + 1} — dealer ${PLAYER_NAMES[state.dealer]} ───`);
      for (const seat of [0, 1, 2, 3] as const) {
        log(
          `  ${(PLAYER_NAMES[seat] + ':').padEnd(7)} ${fmtHand(state.hands[seat] as readonly Card[])}`,
        );
      }
    }
    const action = randomAction(state, rng);
    const result = applyAction(state, action);
    if (!result.ok)
      throw new Error(`engine rejected ${JSON.stringify(action)}: ${result.error.code}`);
    for (const event of result.events) {
      switch (event.type) {
        case 'bid_placed':
          log(`  ${PLAYER_NAMES[event.seat]} ${fmtBid(event.choice)}`);
          break;
        case 'bidding_won': {
          const c = event.contract;
          log(
            `  ► Contract: ${PLAYER_NAMES[c.seat]} at ${c.value}${c.sansAtout ? ' sans atout (stake doubled)' : ''}${c.forced ? ' (forced — everyone passed)' : ''}`,
          );
          break;
        }
        case 'trump_set':
          log(
            event.trump === null
              ? `  ► No trump this round.`
              : `  ► Trump is ${SUIT_ICONS[event.trump]}`,
          );
          break;
        case 'card_played':
          log(`    ${PLAYER_NAMES[event.seat]} plays ${fmtCard(event.card)}`);
          break;
        case 'trick_won': {
          const tags = event.specials
            .map((s) => (s === 'red_zero' ? '+5 red zero!' : '−3 brown zero!'))
            .join(' ');
          log(
            `    ⤷ ${PLAYER_NAMES[event.winner]} takes the trick (${event.points} pt${tags ? ', ' + tags : ''})`,
          );
          break;
        }
        case 'round_scored': {
          const s = event.summary;
          const team = teamOf(s.contract.seat) === 0 ? 'Team A' : 'Team B';
          log(
            `  ══ Round ${s.roundIndex + 1}: trick points A=${s.trickPoints[0]} B=${s.trickPoints[1]} — ${team} ${s.contractMade ? 'MADE' : 'FAILED'} ${s.contract.value}${s.contract.sansAtout ? ' SA' : ''} → ΔA=${s.deltas[0]} ΔB=${s.deltas[1]} → score A=${s.scores[0]} B=${s.scores[1]}`,
          );
          break;
        }
        case 'game_over':
          log(
            `\n★★★ ${event.winner === 0 ? 'Team A (North+South)' : 'Team B (East+West)'} WINS ★★★`,
          );
          break;
        case 'round_started':
          break;
      }
    }
    state = result.state;
  }
}

function stats(games: number): void {
  let rounds = 0;
  let made = 0;
  let contracts = 0;
  let forced = 0;
  const winners = [0, 0];
  for (let seed = 0; seed < games; seed++) {
    const rng = mulberry32(seed ^ 0x5eed);
    let state = createGame(seed);
    while (state.phase !== 'game_over') {
      const result = applyAction(state, randomAction(state, rng));
      if (!result.ok) throw new Error(result.error.code);
      for (const event of result.events) {
        if (event.type === 'bidding_won') {
          contracts++;
          if (event.contract.forced) forced++;
        }
        if (event.type === 'round_scored' && event.summary.contractMade) made++;
      }
      state = result.state;
    }
    rounds += state.roundIndex + 1;
    winners[state.winner as 0 | 1]++;
  }
  console.log(
    `games=${games} avgRounds=${(rounds / games).toFixed(1)} contractMade=${((made / contracts) * 100).toFixed(1)}% forced7=${((forced / contracts) * 100).toFixed(1)}% wins A/B=${winners[0]}/${winners[1]}`,
  );
}

const args = process.argv.slice(2);
function argValue(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const statGames = argValue('stats');
if (statGames !== undefined) {
  stats(Number(statGames));
} else {
  const seed = Number(argValue('seed') ?? 1);
  const rounds = Number(argValue('rounds') ?? 999);
  narrateGame(seed, rounds);
}
