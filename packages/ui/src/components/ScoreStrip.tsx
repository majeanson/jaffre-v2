import { useState } from 'react';
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
  /** Trick points per team this round (details view). */
  readonly roundPoints?: readonly [number, number];
  /** Tricks captured per team this round (details view). */
  readonly trickCounts?: readonly [number, number];
}

/**
 * Minimal by default: scores, the live contract, trump. Everything else
 * (team names, round points, tricks, target) lives behind the details toggle.
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
}: ScoreStripProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative rounded-(--radius-panel) bg-(--color-felt-800)/90 border border-white/8 shadow-(--shadow-panel) px-4 py-2 font-ui text-sm max-sm:px-2.5 max-sm:py-1.5">
      <div className="flex items-center gap-4 max-sm:gap-2.5">
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

        <span className="ml-auto flex min-w-0 items-center gap-3 max-sm:gap-1.5">
          {contract !== null && (
            <span className="truncate font-semibold text-(--color-ivory)/90 tabular-nums max-sm:text-xs">
              {contract.playerName} {contract.value}
              {contract.sansAtout ? ' SA' : ''}
              {contract.progress !== undefined && (
                <span className="ml-1 text-(--color-lamplight)">
                  {contract.progress}/{contract.value}
                </span>
              )}
            </span>
          )}
          {trumpDecided && (
            <span
              className="text-lg font-bold"
              style={trump !== null ? { color: SUIT_STYLES[trump].color } : undefined}
            >
              {trump === null ? (
                <span className="text-sm font-semibold text-(--color-ivory)/70">no trump</span>
              ) : (
                <>
                  {SUIT_STYLES[trump].glyph}
                  <span className="sr-only">Trump: {SUIT_STYLES[trump].label}</span>
                </>
              )}
            </span>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-label="Score details"
            onClick={() => setOpen((o) => !o)}
            className="grid size-7 place-items-center rounded-full border border-white/15 text-(--color-ivory)/70 hover:bg-white/8 cursor-pointer"
          >
            ⋯
          </button>
        </span>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-(--radius-panel) border border-white/10 bg-(--color-felt-800) p-3 text-xs shadow-(--shadow-panel)">
          <div className="grid grid-cols-2 gap-2 tabular-nums">
            {([0, 1] as const).map((team) => (
              <div key={team} className="rounded-lg bg-black/25 p-2">
                <p className="font-semibold text-(--color-ivory)/90">
                  <span
                    className={`mr-1.5 inline-block size-2 rounded-full ${team === 0 ? 'bg-(--color-lamplight)' : 'bg-(--color-ivory)'}`}
                    aria-hidden
                  />
                  {teamNames[team]}
                </p>
                <p className="mt-1 text-(--color-ivory)/70">
                  {roundPoints !== undefined &&
                    `${(roundPoints[team] ?? 0) >= 0 ? '+' : ''}${roundPoints[team]} pts this round`}
                </p>
                <p className="text-(--color-ivory)/70">
                  {trickCounts !== undefined &&
                    `${trickCounts[team]} trick${trickCounts[team] === 1 ? '' : 's'} taken`}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-(--color-ivory)/50">first team to {target} wins</p>
        </div>
      )}
    </div>
  );
}
