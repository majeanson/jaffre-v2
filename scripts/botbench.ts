/**
 * Bot-vs-bot benchmark — proves the difficulty ladder (Hard > Normal > Easy)
 * and watches per-decision latency (the Durable Object pacing budget).
 *
 *   npm run botbench                       # default 500 games per matchup
 *   npm run botbench -- --games 200        # fewer games (faster)
 *   npm run botbench -- --mirrors          # also run same-vs-same sanity checks
 *
 * A/B cross-play — bench the working-tree bots against a past git ref, same
 * difficulty on both teams, so any bot change gets a cheap yes/no verdict:
 *
 *   npm run botbench -- --vs HEAD~1                 # new vs old, all difficulties
 *   npm run botbench -- --vs main --diff hard       # one difficulty
 *   npm run botbench -- --vs 89b5e6a --games 1000   # tighter confidence interval
 *
 * The old ref's packages/bots/src is extracted under node_modules/.botbench/
 * (cached by sha, invisible to git/lint) and runs against the CURRENT engine,
 * so both brains play by identical rules on identical deals. Wilson 95% CIs
 * are reported; a matchup is only called significant when the CI clears 50%.
 *
 * Team 0 (seats 0,2) plays one side, team 1 (seats 1,3) the other; half the
 * games swap the assignment so no seat/deal bias leaks into the result.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applyAction,
  createGame,
  mulberry32,
  teamOf,
  viewFor,
} from '../packages/engine/src/index.js';
import type { Action, GameState, Rng, Seat, SeatView } from '../packages/engine/src/index.js';
import { BOT_DIFFICULTIES, type BotDifficulty, chooseAction } from '../packages/bots/src/index.js';

type Chooser = (view: SeatView, rng: Rng, difficulty: BotDifficulty) => Action | null;

/** Per-seat policy: which brain, at which difficulty, and whether its latency counts. */
interface SeatPolicy {
  readonly choose: Chooser;
  readonly difficulty: BotDifficulty;
  readonly timed: boolean;
}

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

function runGame(policies: readonly [SeatPolicy, SeatPolicy], seed: number): MatchResult {
  // policies[team] applies to both seats of that team.
  const policyOf = (seat: Seat): SeatPolicy => policies[teamOf(seat)] as SeatPolicy;
  const rng = mulberry32((seed ^ 0xb07) >>> 0);
  let state: GameState = createGame(seed);
  let rounds = 0;
  let contracts = 0;
  let contractsMade = 0;
  let sansAtout = 0;
  let steps = 0;

  while (state.phase !== 'game_over' && steps++ < 60_000) {
    const seat = state.turn;
    const policy = policyOf(seat);
    const t0 = performance.now();
    const action = policy.choose(viewFor(state, seat), rng, policy.difficulty);
    if (policy.timed) timings.push(performance.now() - t0);
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

function runMatchup(a: SeatPolicy, b: SeatPolicy, games: number): Tally {
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
    const policies: [SeatPolicy, SeatPolicy] = swap ? [b, a] : [a, b];
    const r = runGame(policies, i);
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

/** Wilson 95% score interval on wins/decisive-games — robust at small n. */
function wilson(wins: number, n: number): readonly [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [center - half, center + half];
}

/**
 * Extract packages/bots/src at `ref` into node_modules/.botbench/<sha>/ and
 * import its chooseAction. Bare `@jaffre/engine` imports resolve up to the
 * workspace root, i.e. the CURRENT engine — old brain, identical rules.
 */
async function loadBotsAt(ref: string): Promise<{ choose: Chooser; sha: string }> {
  const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const sha = git('rev-parse', '--short', `${ref}^{commit}`);
  const cacheDir = join(import.meta.dirname, '..', 'node_modules', '.botbench', sha);
  const entry = join(cacheDir, 'packages', 'bots', 'src', 'index.ts');
  if (!existsSync(entry)) {
    rmSync(cacheDir, { recursive: true, force: true });
    mkdirSync(cacheDir, { recursive: true });
    const tarFile = join(cacheDir, 'bots.tar');
    git('archive', '--format=tar', '-o', tarFile, sha, 'packages/bots/src');
    // Extract with cwd + a bare relative filename: a Windows absolute path like
    // `C:\…\bots.tar` makes tar treat `C:` as a remote host ("Cannot connect to
    // C: resolve failed"). Staying inside cacheDir sidesteps the colon entirely.
    execFileSync('tar', ['-xf', 'bots.tar'], { cwd: cacheDir });
    rmSync(tarFile, { force: true });
    if (!existsSync(entry)) throw new Error(`no packages/bots/src/index.ts at ${ref} (${sha})`);
  }
  const mod = (await import(pathToFileURL(entry).href)) as { chooseAction?: Chooser };
  if (typeof mod.chooseAction !== 'function')
    throw new Error(`bots at ${ref} (${sha}) do not export chooseAction`);
  return { choose: mod.chooseAction, sha };
}

function report(label: string, t: Tally): void {
  console.log(
    label + (t.games - t.winsA - t.winsB > 0 ? `  (draws ${t.games - t.winsA - t.winsB})` : ''),
  );
  console.log(
    `   avg margin ${t.marginSum / t.games >= 0 ? '+' : ''}${(t.marginSum / t.games).toFixed(1)}  ` +
      `avg rounds ${(t.rounds / t.games).toFixed(1)}  ` +
      `contracts made ${pct(t.contractsMade, t.contracts)}  ` +
      `sans-atout ${pct(t.sansAtout, t.contracts)}`,
  );
}

function runLadder(games: number, mirrors: boolean): void {
  const matchups: [BotDifficulty, BotDifficulty][] = [
    ['hard', 'easy'],
    ['hard', 'normal'],
    ['normal', 'easy'],
  ];
  if (mirrors) matchups.push(['easy', 'easy'], ['normal', 'normal'], ['hard', 'hard']);

  console.log(`\nJaffre bot benchmark — ${games} games/matchup (teams swapped each game)\n`);
  for (const [a, b] of matchups) {
    const t = runMatchup(
      { choose: chooseAction, difficulty: a, timed: true },
      { choose: chooseAction, difficulty: b, timed: true },
      games,
    );
    report(
      `${a.padEnd(6)} vs ${b.padEnd(6)}  ${a} ${pct(t.winsA, t.games)}  ${b} ${pct(t.winsB, t.games)}`,
      t,
    );
  }
}

async function runAb(ref: string, games: number, diffs: readonly BotDifficulty[]): Promise<void> {
  const old = await loadBotsAt(ref);
  console.log(
    `\nJaffre bot A/B — working tree vs ${ref} (${old.sha}) — ` +
      `${games} games/difficulty, same deals, teams swapped each game\n`,
  );
  for (const diff of diffs) {
    const t = runMatchup(
      { choose: chooseAction, difficulty: diff, timed: true },
      { choose: old.choose, difficulty: diff, timed: false },
      games,
    );
    const decisive = t.winsA + t.winsB;
    const [lo, hi] = wilson(t.winsA, decisive);
    const verdict =
      lo > 0.5
        ? '✔ NEW significantly better'
        : hi < 0.5
          ? '✘ NEW significantly worse'
          : '~ no significant difference';
    report(
      `${diff.padEnd(6)}  new ${pct(t.winsA, t.games)}  old ${pct(t.winsB, t.games)}  ` +
        `— new wins ${pct(t.winsA, decisive)} of decisive ` +
        `(95% CI ${(100 * lo).toFixed(1)}–${(100 * hi).toFixed(1)}%, n=${decisive})  ${verdict}`,
      t,
    );
  }
  console.log(
    '\nCI spanning 50% means the sample cannot tell the bots apart — rerun with more --games before shipping.',
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const games = Number(arg('--games') ?? 500);
  const vs = arg('--vs');
  const diffArg = arg('--diff');

  if (vs) {
    const diffs = diffArg ? [diffArg as BotDifficulty] : BOT_DIFFICULTIES;
    if (diffArg && !BOT_DIFFICULTIES.includes(diffArg as BotDifficulty))
      throw new Error(`--diff must be one of ${BOT_DIFFICULTIES.join('|')}`);
    await runAb(vs, games, diffs);
  } else {
    runLadder(games, argv.includes('--mirrors'));
  }

  const tm = timing();
  console.log(
    `\ndecision latency over ${tm.count} calls (working-tree bots) — avg ${tm.avgMs.toFixed(3)}ms  ` +
      `p99 ${tm.p99Ms.toFixed(3)}ms  max ${tm.maxMs.toFixed(3)}ms`,
  );
  if (tm.p99Ms > 50) console.log('  ⚠ p99 exceeds the 50ms Durable Object pacing budget');
  console.log('');
}

await main();
