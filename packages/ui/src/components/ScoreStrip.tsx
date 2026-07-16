import { useState, type ReactNode } from 'react';
import type { SuitId } from '../types.js';
import { SUIT_STYLES } from '../types.js';

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
  } | null;
  readonly trump?: SuitId | null;
  readonly trumpDecided?: boolean;
  /** Trick points per team this round (expanded view). */
  readonly roundPoints?: readonly [number, number];
  /** Tricks captured per team this round (expanded view). */
  readonly trickCounts?: readonly [number, number];
  /** App controls (leave, skin, log…) shown only while expanded. */
  readonly actions?: ReactNode;
  /** Mount with the details panel already expanded (scene viewer). */
  readonly defaultDetailsOpen?: boolean;
}

/** "Team Sun" → "Sun": the dot already carries the team identity. */
const shortName = (name: string): string => name.replace(/^team\s+/i, '');

/**
 * One team's tricks this round: a pile of face-down mini cards + the round
 * points, grouped in an inset tray so they read as one "this round" unit.
 */
function TrickPile({
  count,
  points,
  colorVar,
  label,
  mirrored = false,
}: {
  count: number;
  points: number;
  colorVar: string;
  label: string;
  mirrored?: boolean;
}) {
  const shown = Math.min(count, 8);
  return (
    <span
      className={`flex items-center gap-1.5 rounded-lg bg-black/20 px-1.5 py-1 ${mirrored ? 'flex-row-reverse' : ''}`}
      aria-label={`${label}: ${count} trick${count === 1 ? '' : 's'}, ${points} points this round`}
    >
      <span
        className={`flex items-center ${mirrored ? 'flex-row-reverse -space-x-1.5 space-x-reverse' : '-space-x-1.5'}`}
        aria-hidden
      >
        {Array.from({ length: shown }, (_, i) => (
          <span
            key={i}
            className="pop-in inline-block h-5 w-3.5 rounded-[3px] border-[1.5px] bg-(--color-card-back) shadow-sm"
            style={{ borderColor: colorVar }}
          />
        ))}
        {count === 0 && (
          <span className="inline-block h-5 w-3.5 rounded-[3px] border-[1.5px] border-dashed border-white/20" />
        )}
      </span>
      <span
        className="min-w-5 text-center font-display text-sm font-semibold tabular-nums"
        style={{ color: colorVar }}
        aria-hidden
      >
        {points > 0 ? '+' : ''}
        {points}
      </span>
    </span>
  );
}

/**
 * One team's half of the scoreboard: named and color-dotted, the GAME score
 * as the headline number with a thin race-to-target bar under it, and the
 * round tray beside it.
 */
function TeamSide({
  name,
  score,
  target,
  count,
  points,
  colorVar,
  mirrored = false,
  testId,
}: {
  name: string;
  score: number;
  target: number;
  count: number;
  points: number;
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
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: colorVar }} aria-hidden />
          <span className="text-[10px] font-semibold tracking-[0.14em] whitespace-nowrap text-(--color-ivory)/60 uppercase">
            {name}
          </span>
        </span>
        <span
          data-testid={testId}
          className="font-display text-2xl font-semibold tabular-nums max-sm:text-xl"
          style={{ color: colorVar }}
        >
          <span key={score} className="score-flash inline-block">
            {score}
          </span>
        </span>
        {/* The race to the target, at a glance. */}
        <span aria-hidden className="h-0.5 w-11 overflow-hidden rounded-full bg-white/10">
          <span
            className="block h-full rounded-full"
            style={{ width: `${pct}%`, background: colorVar }}
          />
        </span>
      </span>
      <TrickPile
        count={count}
        points={points}
        colorVar={colorVar}
        label={name}
        mirrored={mirrored}
      />
    </span>
  );
}

/**
 * The top bar, read as a scoreboard: each team's side is labeled (dot +
 * name) with the game total as the big number, the round's trick tray next
 * to it, and the bet on a labeled plaque in the middle. The whole bar is
 * the toggle; expanding grows the SAME bar with full details and the app
 * controls.
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
  actions,
  defaultDetailsOpen = false,
}: ScoreStripProps) {
  const [open, setOpen] = useState(defaultDetailsOpen);

  const trumpBadge = trumpDecided ? (
    trump === null ? (
      <span className="text-[11px] font-semibold whitespace-nowrap text-(--color-ivory)/80">
        no trump
      </span>
    ) : (
      <span className="text-lg leading-none font-bold" style={{ color: SUIT_STYLES[trump].color }}>
        {SUIT_STYLES[trump].glyph}
        <span className="sr-only">Trump: {SUIT_STYLES[trump].label}</span>
      </span>
    )
  ) : null;

  return (
    <div className="w-fit max-w-full min-w-[min(22rem,94vw)] rounded-(--radius-panel) border border-white/8 bg-(--color-felt-800)/90 font-ui text-sm shadow-(--shadow-panel)">
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
            colorVar="var(--color-team-a)"
            testId="team-score-0"
          />
        </span>

        {/* Center plaque: the one contract everyone plays against. */}
        <span className="flex min-w-0 flex-col items-center gap-0.5 px-1 leading-none">
          <span className="text-[9px] font-semibold tracking-[0.22em] text-(--color-ivory)/45 uppercase">
            {contract !== null ? 'bet' : 'auction'}
          </span>
          {contract !== null ? (
            <span className="flex min-w-0 items-center gap-1.5 font-semibold whitespace-nowrap text-(--color-ivory)/90 tabular-nums max-sm:text-xs">
              <span className="truncate">
                {contract.playerName} {contract.value}
                {contract.sansAtout ? ' SA' : ''}
              </span>
              {contract.progress !== undefined && (
                <span className="text-(--color-lamplight)">
                  {contract.progress}/{contract.value}
                </span>
              )}
              {trumpBadge}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-(--color-ivory)/65">
              bidding…{trumpBadge}
            </span>
          )}
          <span className="text-[10px] whitespace-nowrap text-(--color-ivory)/45">
            first to {target}
          </span>
        </span>

        <span className="flex items-center justify-end gap-2.5 max-sm:gap-1.5">
          <TeamSide
            name={shortName(teamNames[1])}
            score={scores[1]}
            target={target}
            count={trickCounts?.[1] ?? 0}
            points={roundPoints?.[1] ?? 0}
            colorVar="var(--color-team-b)"
            mirrored
            testId="team-score-1"
          />
          <span
            aria-hidden
            className={`grid size-6 shrink-0 place-items-center rounded-full border border-white/15 text-[10px] text-(--color-ivory)/70 transition-transform ${open ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </span>
      </button>

      {open && (
        <div className="flex flex-col items-center gap-3 border-t border-white/8 px-4 pt-3 pb-4 text-xs">
          <div className="grid w-full max-w-sm grid-cols-2 gap-2 text-center tabular-nums">
            {([0, 1] as const).map((team) => (
              <div key={team} className="rounded-lg bg-black/25 p-2.5">
                <p className="font-semibold text-(--color-ivory)/90">
                  <span
                    className={`mr-1.5 inline-block size-2 rounded-full ${team === 0 ? 'bg-(--color-team-a)' : 'bg-(--color-team-b)'}`}
                    aria-hidden
                  />
                  {teamNames[team]}
                </p>
                <p className="mt-1 font-display text-2xl text-(--color-ivory)">
                  {scores[team]} <span className="text-sm text-(--color-ivory)/50">/ {target}</span>
                </p>
                {roundPoints !== undefined && (
                  <p className="text-(--color-ivory)/70">
                    {(roundPoints[team] ?? 0) >= 0 ? '+' : ''}
                    {roundPoints[team]} pts this round
                  </p>
                )}
                {trickCounts !== undefined && (
                  <p className="text-(--color-ivory)/70">
                    {trickCounts[team]} trick{trickCounts[team] === 1 ? '' : 's'} taken
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-(--color-ivory)/55">
            first team to <span className="font-semibold text-(--color-ivory)/85">{target}</span>{' '}
            wins
            {contract !== null && (
              <>
                {' '}
                · {contract.playerName} must take{' '}
                <span className="font-semibold text-(--color-ivory)/85">{contract.value}</span>{' '}
                trick points{contract.sansAtout ? ' without trump (stake ×2)' : ''}
              </>
            )}
          </p>
          {actions !== undefined && (
            <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>
          )}
        </div>
      )}
    </div>
  );
}
