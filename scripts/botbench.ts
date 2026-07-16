/**
 * Bot-vs-bot benchmark — proves the difficulty ladder (Hard > Normal > Easy)
 * and watches per-decision latency (the Durable Object pacing budget).
 *
 *   npm run botbench                       # default 500 games per matchup
 *   npm run botbench -- --games 200        # fewer games (faster)
 *   npm run botbench -- --mirrors          # also run same-vs-same sanity checks
 *
 * Team 0 (seats 0,2) plays one difficulty, team 1 (seats 1,3) the other; half
 * the games swap the assignment so no seat/deal bias leaks into the result.
 */
import {
  applyAction,
  createGame,
  mulberry32,
  teamOf,
  viewFor,
} from '../packages/engine/src/index.js';
import type { GameState, Seat } from '../packages/engine/src/index.js';
import { type BotDifficulty, chooseAction } from '../packages/bots/src/index.js';

interface MatchResult {
  readonly winnerTeam: 0 | 1 | null;
  readonly scores: readonly [number, number];
  readonly rounds: number;
  readonly contracts: number;
  readonly contractsMade: number;
  readonly sansAtout: number;
}

interface Timing {
  readonly count: number;
  readonly avgMs: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

const timings: number[] = [];

function runGame(teamDiff: readonly [BotDifficulty, BotDifficulty], seed: number): MatchResult {
  // teamDiff[team] = difficulty for both seats of that team.
  const diffOf = (seat: Seat): BotDifficulty => teamDiff[teamOf(seat)] as BotDifficulty;
  const rng = mulberry32((seed ^ 0xb07) >>> 0);
  let state: GameState = createGame(seed);
  let rounds = 0;
  let contracts = 0;
  let contractsMade = 0;
  let sansAtout = 0;
  let steps = 0;

  while (state.phase !== 'game_over' && steps++ < 60_000) {
    const seat = state.turn;
    const t0 = performance.now();
    const action = chooseAction(viewFor(state, seat), rng, diffOf(seat));
    timings.push(performance.now() - t0);
    if (action === null) break;
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`illegal action: ${JSON.stringify(action)}`);
    for (const ev of result.events) {
      if (ev.type === 'bidding_won') {
        contracts++;
        if (ev.contract.sansAtout) sansAtout++;
      }
      if (ev.type === 'round_scored') {
        rounds++;
        if (ev.summary.contractMade) contractsMade++;
      }
    }
    state = result.state;
  }

  return {
    winnerTeam: state.winner,
    scores: state.scores,
    rounds,
    contracts,
    contractsMade,
    sansAtout,
  };
}

interface Tally {
  winsA: number;
  winsB: number;
  games: number;
  marginSum: number; // final score margin from A's perspective
  rounds: number;
  contracts: number;
  contractsMade: number;
  sansAtout: number;
}

function runMatchup(diffA: BotDifficulty, diffB: BotDifficulty, games: number): Tally {
  const t: Tally = {
    winsA: 0,
    winsB: 0,
    games: 0,
    marginSum: 0,
    rounds: 0,
    contracts: 0,
    contractsMade: 0,
    sansAtout: 0,
  };
  for (let i = 0; i < games; i++) {
    const swap = i % 2 === 1; // half the games put A on team 1
    const teamDiff: [BotDifficulty, BotDifficulty] = swap ? [diffB, diffA] : [diffA, diffB];
    const r = runGame(teamDiff, i);
    const teamA: 0 | 1 = swap ? 1 : 0;
    const teamB: 0 | 1 = swap ? 0 : 1;
    if (r.winnerTeam === teamA) t.winsA++;
    else if (r.winnerTeam === teamB) t.winsB++;
    t.games++;
    t.marginSum += r.scores[teamA] - r.scores[teamB];
    t.rounds += r.rounds;
    t.contracts += r.contracts;
    t.contractsMade += r.contractsMade;
    t.sansAtout += r.sansAtout;
  }
  return t;
}

function timing(): Timing {
  const sorted = [...timings].sort((a, b) => a - b);
  const n = sorted.length;
  const avg = sorted.reduce((s, x) => s + x, 0) / Math.max(1, n);
  const p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))] ?? 0;
  const max = sorted[n - 1] ?? 0;
  return { count: n, avgMs: avg, p99Ms: p99, maxMs: max };
}

function pct(n: number, d: number): string {
  return `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
}

function main(): void {
  const argv = process.argv.slice(2);
  const gamesArg = argv.indexOf('--games');
  const games = gamesArg >= 0 ? Number(argv[gamesArg + 1]) : 500;
  const mirrors = argv.includes('--mirrors');

  const matchups: [BotDifficulty, BotDifficulty][] = [
    ['hard', 'easy'],
    ['hard', 'normal'],
    ['normal', 'easy'],
  ];
  if (mirrors) matchups.push(['easy', 'easy'], ['normal', 'normal'], ['hard', 'hard']);

  console.log(`\nJaffre bot benchmark — ${games} games/matchup (teams swapped each game)\n`);
  for (const [a, b] of matchups) {
    const t = runMatchup(a, b, games);
    const winA = pct(t.winsA, t.games);
    const draws = t.games - t.winsA - t.winsB;
    console.log(
      `${a.padEnd(6)} vs ${b.padEnd(6)}  ${a} ${winA}  ${b} ${pct(t.winsB, t.games)}` +
        (draws > 0 ? `  (draws ${draws})` : ''),
    );
    console.log(
      `   avg margin ${t.marginSum / t.games >= 0 ? '+' : ''}${(t.marginSum / t.games).toFixed(1)}  ` +
        `avg rounds ${(t.rounds / t.games).toFixed(1)}  ` +
        `contracts made ${pct(t.contractsMade, t.contracts)}  ` +
        `sans-atout ${pct(t.sansAtout, t.contracts)}`,
    );
  }

  const tm = timing();
  console.log(
    `\ndecision latency over ${tm.count} calls — avg ${tm.avgMs.toFixed(3)}ms  ` +
      `p99 ${tm.p99Ms.toFixed(3)}ms  max ${tm.maxMs.toFixed(3)}ms`,
  );
  if (tm.p99Ms > 50) console.log('  ⚠ p99 exceeds the 50ms Durable Object pacing budget');
  console.log('');
}

main();
