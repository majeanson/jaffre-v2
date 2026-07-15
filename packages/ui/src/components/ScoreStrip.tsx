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
 * The top bar. Collapsed: just scores, the bet, and trump — centered. The
 * whole bar is the toggle; expanding grows the SAME bar with full details
 * and the app controls.
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
    <div className="rounded-(--radius-panel) bg-(--color-felt-800)/90 border border-white/8 shadow-(--shadow-panel) font-ui text-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-label="Score details"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-2 max-sm:gap-x-3 max-sm:px-2.5 max-sm:py-1.5"
      >
        <span
          className="flex items-baseline gap-1.5"
          aria-label={`${teamNames[0]} ${scores[0]}, ${teamNames[1]} ${scores[1]}`}
        >
          <span className="size-2 self-center rounded-full bg-(--color-lamplight)" aria-hidden />
          <span
            key={scores[0]}
            className="score-flash inline-block font-display font-semibold text-xl tabular-nums text-(--color-ivory)"
          >
            {scores[0]}
          </span>
          <span className="text-(--color-ivory)/40" aria-hidden>
            —
          </span>
          <span
            key={`b${scores[1]}`}
            className="score-flash inline-block font-display font-semibold text-xl tabular-nums text-(--color-ivory)"
          >
            {scores[1]}
          </span>
          <span className="size-2 self-center rounded-full bg-(--color-ivory)" aria-hidden />
        </span>

        {contract !== null && (
          <span className="truncate font-semibold text-(--color-ivory)/90 tabular-nums max-sm:text-xs">
            <span className="font-normal text-(--color-ivory)/55">bet</span> {contract.playerName}{' '}
            {contract.value}
            {contract.sansAtout ? ' SA' : ''}
            {contract.progress !== undefined && (
              <span className="ml-1 text-(--color-lamplight)">
                {contract.progress}/{contract.value}
              </span>
            )}
          </span>
        )}

        {trumpDecided && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-(--color-ivory)/55">trump</span>
            {trump === null ? (
              <span className="font-semibold text-(--color-ivory)/90">none</span>
            ) : (
              <span className="text-lg font-bold" style={{ color: SUIT_STYLES[trump].color }}>
                {SUIT_STYLES[trump].glyph}
                <span className="sr-only">{SUIT_STYLES[trump].label}</span>
              </span>
            )}
          </span>
        )}

        <span
          aria-hidden
          className="grid size-6 place-items-center rounded-full border border-white/15 text-[10px] text-(--color-ivory)/70"
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
                    className={`mr-1.5 inline-block size-2 rounded-full ${team === 0 ? 'bg-(--color-lamplight)' : 'bg-(--color-ivory)'}`}
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
