import { useState, type ReactNode } from 'react';
import type { SuitId } from '../types.js';
import { SUIT_STYLES } from '../types.js';

/** Which scoring specials a team has captured this round. */
export interface TeamSpecials {
  readonly red: boolean; // the red 0 (+5)
  readonly brown: boolean; // the brown 0 (−2)
}

/** One finished round on the written scoreboard. */
export interface ScoreboardRound {
  /** 1-based round number, as written on the pad ("R3"). */
  readonly round: number;
  readonly bidderName: string;
  readonly bidderTeam: 0 | 1;
  readonly bid: number;
  readonly sansAtout: boolean;
  readonly made: boolean;
  /** Points each team gained (or lost) this round. */
  readonly deltas: readonly [number, number];
}

export interface ScoreStripProps {
  readonly teamNames: readonly [string, string];
  readonly scores: readonly [number, number];
  readonly target: number;
  readonly contract?: {
    readonly playerName: string;
    readonly value: number;
    readonly sansAtout: boolean;
    /** Trick points the contract team has taken so far this round. */
    readonly progress?: number;
    /** Bidder's team, colors the bet on the written scoreboard. */
    readonly team?: 0 | 1;
  } | null;
  /** Finished rounds, oldest first — the written scoreboard rows. */
  readonly rounds?: readonly ScoreboardRound[];
  /** 1-based number of the round in progress (omit once the game is over). */
  readonly currentRound?: number | undefined;
  readonly trump?: SuitId | null;
  readonly trumpDecided?: boolean;
  /** Trick points per team this round (expanded view). */
  readonly roundPoints?: readonly [number, number];
  /** Tricks captured per team this round (expanded view). */
  readonly trickCounts?: readonly [number, number];
  /** Specials captured per team this round — shown as chips on the piles. */
  readonly specials?: readonly [TeamSpecials, TeamSpecials];
  /** The current turn/phase, e.g. "Marcel to play" — the center headline. */
  readonly action?: string;
  /** App controls (leave, skin, log…) shown only while expanded. */
  readonly actions?: ReactNode;
  /** Mount with the details panel already expanded (scene viewer). */
  readonly defaultDetailsOpen?: boolean;
}

/** "Team Sun" → "Sun": the dot already carries the team identity. */
const shortName = (name: string): string => name.replace(/^team\s+/i, '');

/** A captured special: the +5 red 0 or the −2 brown 0, in its suit color. */
export function SpecialChip({ kind }: { kind: 'red' | 'brown' }) {
  const isRed = kind === 'red';
  return (
    <span
      title={isRed ? 'Red 0 captured · +5' : 'Brown 0 captured · −2'}
      className={`rounded-full border px-1 text-[9px] font-black leading-tight text-white ${
        isRed
          ? 'border-(--color-suit-red) bg-(--color-suit-red)/30'
          : 'border-(--color-suit-brown) bg-(--color-suit-brown)/30'
      }`}
    >
      {isRed ? '+5' : '−2'}
    </span>
  );
}

/**
 * One team's tricks this round: a pile of face-down mini cards, the round
 * points, and any captured specials called out in their own suit color.
 */
function TrickPile({
  count,
  points,
  special,
  colorVar,
  label,
  mirrored = false,
}: {
  count: number;
  points: number;
  special?: TeamSpecials | undefined;
  colorVar: string;
  label: string;
  mirrored?: boolean;
}) {
  const shown = Math.min(count, 8);
  return (
    <span
      className={`flex items-center gap-1.5 rounded-lg bg-black/20 px-1.5 py-1 ${mirrored ? 'flex-row-reverse' : ''}`}
      aria-label={`${label}: ${count} trick${count === 1 ? '' : 's'}, ${points} points this round${
        special?.red ? ', captured the red 0 for +5' : ''
      }${special?.brown ? ', captured the brown 0 for −2' : ''}`}
    >
      {/* The mini-card stack needs width a phone doesn't have — there the
          points + special chips alone tell the story. */}
      <span
        className={`flex items-center max-sm:hidden ${mirrored ? 'flex-row-reverse -space-x-1.5 space-x-reverse' : '-space-x-1.5'}`}
        aria-hidden
      >
        {Array.from({ length: shown }, (_, i) => (
          <span
            key={i}
            className="pop-in inline-block h-[1.5em] w-[1.05em] rounded-[3px] border-[1.5px] bg-(--color-card-back) shadow-sm"
            style={{ borderColor: colorVar }}
          />
        ))}
        {count === 0 && (
          <span className="inline-block h-[1.5em] w-[1.05em] rounded-[3px] border-[1.5px] border-dashed border-white/20" />
        )}
      </span>
      <span
        className="min-w-[1.5em] text-center font-display font-semibold tabular-nums"
        style={{ color: colorVar }}
        aria-hidden
      >
        {points > 0 ? '+' : ''}
        {points}
      </span>
      {(special?.red ?? false) || (special?.brown ?? false) ? (
        <span
          className={`flex items-center gap-0.5 ${mirrored ? 'flex-row-reverse' : ''}`}
          aria-hidden
        >
          {special?.red === true && <SpecialChip kind="red" />}
          {special?.brown === true && <SpecialChip kind="brown" />}
        </span>
      ) : null}
    </span>
  );
}

/** One team's half of the scoreboard: dot + name, the game score, race bar. */
function TeamSide({
  name,
  score,
  target,
  count,
  points,
  special,
  colorVar,
  mirrored = false,
  testId,
}: {
  name: string;
  score: number;
  target: number;
  count: number;
  points: number;
  special?: TeamSpecials | undefined;
  colorVar: string;
  mirrored?: boolean;
  testId: string;
}) {
  const pct = Math.max(0, Math.min(100, (score / target) * 100));
  return (
    <span
      className={`flex min-w-0 items-center gap-2.5 max-sm:gap-1.5 ${mirrored ? 'flex-row-reverse' : ''}`}
    >
      <span className="flex flex-col items-center gap-0.5 leading-none">
        <span className="flex items-center gap-[0.4em]">
          <span
            className="size-[0.65em] rounded-full"
            style={{ background: colorVar }}
            aria-hidden
          />
          <span className="text-[0.72em] font-semibold tracking-[0.14em] whitespace-nowrap text-(--color-ivory)/70 uppercase">
            {name}
          </span>
        </span>
        <span
          data-testid={testId}
          className="font-display text-(length:--text-fluid-xl) font-semibold tabular-nums"
          style={{ color: colorVar }}
        >
          <span key={score} className="score-flash inline-block">
            {score}
          </span>
        </span>
        <span aria-hidden className="h-0.5 w-[3.2em] overflow-hidden rounded-full bg-white/10">
          <span
            className="block h-full rounded-full"
            style={{ width: `${String(pct)}%`, background: colorVar }}
          />
        </span>
      </span>
      <TrickPile
        count={count}
        points={points}
        special={special}
        colorVar={colorVar}
        label={name}
        mirrored={mirrored}
      />
    </span>
  );
}

const signed = (n: number): string => (n > 0 ? `+${String(n)}` : String(n));

const TEAM_VARS = ['var(--color-team-a)', 'var(--color-team-b)'] as const;

/** "Marcel 8 SA" in the bidder's team color, with a made/missed mark. */
function BetCell({
  name,
  team,
  bid,
  sansAtout,
  made,
}: {
  name: string;
  team: 0 | 1;
  bid: number;
  sansAtout: boolean;
  made?: boolean | undefined;
}) {
  return (
    <span className="flex items-center justify-end gap-1 whitespace-nowrap">
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: TEAM_VARS[team] }}
        aria-hidden
      />
      <span className="truncate text-(--color-ivory)/85">
        {name} <span className="font-semibold">{bid}</span>
        {sansAtout ? <span className="text-(--color-lamplight)"> SA</span> : null}
      </span>
      {made !== undefined && (
        <span
          className={made ? 'text-(--color-ok)' : 'text-(--color-danger-text)'}
          title={made ? 'Bet made' : 'Bet missed'}
        >
          {made ? '✓' : '✗'}
        </span>
      )}
    </span>
  );
}

/**
 * The classic written scoreboard: one row per round with each team's points
 * and the bet that drove them, a live row for the round underway, and the
 * running totals across the bottom — just like a paper scorepad.
 */
function ScorePad({
  teamNames,
  scores,
  target,
  rounds,
  currentRound,
  roundPoints,
  contract,
}: {
  teamNames: readonly [string, string];
  scores: readonly [number, number];
  target: number;
  rounds: readonly ScoreboardRound[];
  currentRound?: number | undefined;
  roundPoints?: readonly [number, number] | undefined;
  contract?: ScoreStripProps['contract'] | undefined;
}) {
  // While the round-over summary is up the round is already on the pad —
  // only pencil in a live row for a round the history doesn't have yet.
  const liveRound =
    currentRound !== undefined && !rounds.some((r) => r.round === currentRound)
      ? currentRound
      : null;

  // The totals bar is its own table (so the rounds can scroll under it) —
  // identical fixed columns keep the two visually aligned as one pad.
  const cols = (
    <colgroup>
      <col className="w-14" />
      <col className="w-[19%]" />
      <col className="w-[19%]" />
      <col />
    </colgroup>
  );

  const deltaCell = (d: number) => (
    <span className={d < 0 ? 'text-(--color-danger-text)' : 'text-(--color-ivory)/90'}>
      {signed(d)}
    </span>
  );

  return (
    <div className="w-full max-w-md overflow-hidden rounded-lg border border-white/10 bg-black/25">
      {/* Keyboard-focusable so the overflow can be scrolled without a mouse. */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Round-by-round scoreboard"
        className="max-h-52 overflow-y-auto"
      >
        <table className="w-full table-fixed tabular-nums" data-testid="scorepad">
          <caption className="sr-only">Round-by-round scoreboard</caption>
          {cols}
          <thead className="sticky top-0 bg-(--color-felt-800)">
            <tr className="border-b border-white/15 text-[0.85em] font-semibold tracking-[0.14em] uppercase">
              <th scope="col" className="py-1.5 pl-3 text-left text-(--color-ivory)/55">
                Round
              </th>
              {([0, 1] as const).map((team) => (
                <th
                  key={team}
                  scope="col"
                  className="py-1.5 text-center"
                  style={{ color: TEAM_VARS[team] }}
                >
                  <span
                    className="mr-1 inline-block size-1.5 rounded-full align-middle"
                    style={{ background: TEAM_VARS[team] }}
                    aria-hidden
                  />
                  {shortName(teamNames[team])}
                </th>
              ))}
              <th scope="col" className="py-1.5 pr-3 text-right text-(--color-ivory)/55">
                Bet
              </th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.round} className="border-b border-white/6 last:border-0">
                <td className="py-1 pl-3 text-left text-(--color-ivory)/55">R{r.round}</td>
                <td className="py-1 text-center">{deltaCell(r.deltas[0])}</td>
                <td className="py-1 text-center">{deltaCell(r.deltas[1])}</td>
                <td className="py-1 pr-3 text-right">
                  <BetCell
                    name={r.bidderName}
                    team={r.bidderTeam}
                    bid={r.bid}
                    sansAtout={r.sansAtout}
                    made={r.made}
                  />
                </td>
              </tr>
            ))}
            {liveRound !== null && (
              <tr className="text-(--color-ivory)/50">
                <td className="py-1 pl-3 text-left">R{liveRound}</td>
                <td className="py-1 text-center">{signed(roundPoints?.[0] ?? 0)}</td>
                <td className="py-1 text-center">{signed(roundPoints?.[1] ?? 0)}</td>
                <td className="py-1 pr-3 text-right">
                  {contract != null ? (
                    <BetCell
                      name={contract.playerName}
                      team={contract.team ?? 0}
                      bid={contract.value}
                      sansAtout={contract.sansAtout}
                    />
                  ) : (
                    <span className="italic">bidding…</span>
                  )}
                </td>
              </tr>
            )}
            {rounds.length === 0 && liveRound === null && (
              <tr className="text-(--color-ivory)/45">
                <td colSpan={4} className="py-2 text-center italic">
                  no rounds played yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center border-t-2 border-white/20 bg-white/4 font-display">
        <table className="w-full table-fixed tabular-nums">
          {cols}
          <tbody>
            <tr>
              <td className="py-1.5 pl-3 text-left text-[0.85em] font-semibold tracking-[0.14em] text-(--color-ivory)/55 uppercase">
                Total
              </td>
              {([0, 1] as const).map((team) => (
                <td
                  key={team}
                  className="py-1.5 text-center text-[1.3em] font-semibold"
                  style={{ color: TEAM_VARS[team] }}
                >
                  {scores[team]}
                </td>
              ))}
              <td className="py-1.5 pr-3 text-right text-[0.85em] text-(--color-ivory)/55">
                first to {target}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The trump suit, called out in its own color — the key fact of the round. */
function TrumpBadge({ trump, trumpDecided }: { trump: SuitId | null; trumpDecided: boolean }) {
  if (!trumpDecided) return null;
  if (trump === null) {
    return (
      <span className="rounded-md bg-white/10 px-[0.5em] py-[0.15em] text-[0.7em] font-bold tracking-wide text-(--color-ivory)/85 uppercase">
        No&nbsp;trump
      </span>
    );
  }
  const style = SUIT_STYLES[trump];
  return (
    <span
      title={`Trump: ${style.label}`}
      className="grid size-[1.7em] place-items-center rounded-md border text-[1.2em] leading-none font-bold"
      style={{ color: style.color, borderColor: style.color, background: `${style.color}22` }}
    >
      {style.glyph}
      <span className="sr-only">Trump {style.label}</span>
    </span>
  );
}

/**
 * The top bar, read as a scoreboard: each team's side (dot, name, game score,
 * race bar) with its round trick tray, and a center that shows only what
 * matters right now — whose turn it is, the bet, and the trump. Tap to expand
 * for full details and the app controls.
 */
export function ScoreStrip({
  teamNames,
  scores,
  target,
  contract = null,
  trump = null,
  trumpDecided = false,
  roundPoints,
  trickCounts,
  specials,
  rounds = [],
  currentRound,
  action,
  actions,
  defaultDetailsOpen = false,
}: ScoreStripProps) {
  const [open, setOpen] = useState(defaultDetailsOpen);

  return (
    <div className="w-fit max-w-full min-w-[min(22rem,94vw)] rounded-(--radius-panel) border border-white/8 bg-(--color-felt-800)/90 font-ui text-(length:--text-fluid-sm) shadow-(--shadow-panel)">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Score details"
        onClick={() => setOpen((o) => !o)}
        className="grid w-full cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-x-3 px-3.5 py-1.5 max-sm:gap-x-2 max-sm:px-2 max-sm:py-1"
      >
        <span className="flex justify-start">
          <TeamSide
            name={shortName(teamNames[0])}
            score={scores[0]}
            target={target}
            count={trickCounts?.[0] ?? 0}
            points={roundPoints?.[0] ?? 0}
            special={specials?.[0]}
            colorVar="var(--color-team-a)"
            testId="team-score-0"
          />
        </span>

        {/* Center: the live state — action, bet, trump. No filler. */}
        <span className="flex min-w-0 flex-col items-center gap-1 px-1 leading-none">
          {action !== undefined && (
            <span className="text-[0.68em] font-semibold tracking-[0.16em] whitespace-nowrap text-(--color-ivory)/55 uppercase max-sm:hidden">
              {action}
            </span>
          )}
          <span className="flex min-w-0 items-center gap-2">
            {contract !== null ? (
              <span className="flex min-w-0 items-center gap-1.5 font-semibold whitespace-nowrap text-(--color-ivory) tabular-nums">
                <span className="truncate">
                  {contract.playerName} {contract.value}
                  {contract.sansAtout ? ' SA' : ''}
                </span>
                {contract.progress !== undefined && (
                  <span className="text-(--color-lamplight)">
                    {contract.progress}/{contract.value}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-[0.85em] whitespace-nowrap text-(--color-ivory)/70">
                no bet yet
              </span>
            )}
            <TrumpBadge trump={trump} trumpDecided={trumpDecided} />
          </span>
        </span>

        <span className="flex items-center justify-end gap-2.5 max-sm:gap-1.5">
          <TeamSide
            name={shortName(teamNames[1])}
            score={scores[1]}
            target={target}
            count={trickCounts?.[1] ?? 0}
            points={roundPoints?.[1] ?? 0}
            special={specials?.[1]}
            colorVar="var(--color-team-b)"
            mirrored
            testId="team-score-1"
          />
          <span
            aria-hidden
            className={`grid size-[1.7em] shrink-0 place-items-center rounded-full border border-white/15 text-[0.7em] text-(--color-ivory)/70 transition-transform ${open ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </span>
      </button>

      {open && (
        <div className="flex flex-col items-center gap-3 border-t border-white/8 px-4 pt-3 pb-4 text-(length:--text-fluid-xs)">
          <ScorePad
            teamNames={teamNames}
            scores={scores}
            target={target}
            rounds={rounds}
            currentRound={currentRound}
            roundPoints={roundPoints}
            contract={contract}
          />
          {contract !== null && (
            <p className="text-(--color-ivory)/60">
              <span className="font-semibold text-(--color-ivory)/85">{contract.playerName}</span>{' '}
              must take{' '}
              <span className="font-semibold text-(--color-ivory)/85">{contract.value}</span> trick
              points{contract.sansAtout ? ' with no trump (stake ×2)' : ''}
            </p>
          )}
          {actions !== undefined && (
            <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>
          )}
        </div>
      )}
    </div>
  );
}
