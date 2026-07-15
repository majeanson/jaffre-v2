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
}

/**
 * One team's tricks this round: a pile of face-down mini cards + the round
 * points. The at-a-glance answer to "how is this round going".
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
      className={`flex items-center gap-1.5 ${mirrored ? 'flex-row-reverse' : ''}`}
      aria-label={`${label}: ${count} trick${count === 1 ? '' : 's'}, ${points} points this round`}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: colorVar }} aria-hidden />
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
        className="min-w-6 text-center font-display text-base font-semibold tabular-nums"
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
 * The top bar. Collapsed: this round first — trick piles + bet + trump, the
 * game total small. The whole bar is the toggle; expanding grows the SAME
 * bar with full details and the app controls.
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
}: ScoreStripProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-fit min-w-[min(20rem,92vw)] max-w-full rounded-(--radius-panel) bg-(--color-felt-800)/90 border border-white/8 shadow-(--shadow-panel) font-ui text-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Score details"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-center gap-x-4 px-4 py-2 max-sm:gap-x-2.5 max-sm:px-2.5 max-sm:py-1.5"
      >
        {/* This round comes first: each team's captured tricks as a pile. */}
        <TrickPile
          count={trickCounts?.[0] ?? 0}
          points={roundPoints?.[0] ?? 0}
          colorVar="var(--color-team-a)"
          label={teamNames[0]}
        />

        <span className="flex min-w-0 flex-col items-center leading-tight">
          <span className="flex min-w-0 items-center gap-2">
            {contract !== null && (
              <span className="truncate font-semibold text-(--color-ivory)/90 tabular-nums max-sm:text-xs">
                <span className="font-normal text-(--color-ivory)/55">bet</span>{' '}
                {contract.playerName} {contract.value}
                {contract.sansAtout ? ' SA' : ''}
                {contract.progress !== undefined && (
                  <span className="ml-1 text-(--color-lamplight)">
                    {contract.progress}/{contract.value}
                  </span>
                )}
              </span>
            )}
            {trumpDecided &&
              (trump === null ? (
                <span className="whitespace-nowrap text-xs font-semibold text-(--color-ivory)/80">
                  no trump
                </span>
              ) : (
                <span className="text-lg font-bold" style={{ color: SUIT_STYLES[trump].color }}>
                  {SUIT_STYLES[trump].glyph}
                  <span className="sr-only">Trump: {SUIT_STYLES[trump].label}</span>
                </span>
              ))}
          </span>
          {/* The game total rides along small — players mostly know it. */}
          <span
            className="text-[11px] tabular-nums text-(--color-ivory)/55"
            aria-label={`${teamNames[0]} ${scores[0]}, ${teamNames[1]} ${scores[1]}`}
          >
            <span key={scores[0]} className="score-flash inline-block">
              {scores[0]}
            </span>
            {' — '}
            <span key={`b${scores[1]}`} className="score-flash inline-block">
              {scores[1]}
            </span>
          </span>
        </span>

        <TrickPile
          count={trickCounts?.[1] ?? 0}
          points={roundPoints?.[1] ?? 0}
          colorVar="var(--color-team-b)"
          label={teamNames[1]}
          mirrored
        />

        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full border border-white/15 text-[10px] text-(--color-ivory)/70"
        >
          {open ? '▲' : '▼'}
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
                <p className="mt-1 font-display text-2xl text-(--color-ivory)">{scores[team]}</p>
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
