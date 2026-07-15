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
  /** Tricks captured per team this round. */
  readonly trickCounts?: readonly [number, number];
  readonly trump?: SuitId | null;
  readonly trumpDecided?: boolean;
  readonly roundPoints?: readonly [number, number];
}

/** Persistent banner: scores, the live contract, and the trump suit. */
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
  return (
    <div className="flex flex-wrap items-center gap-5 rounded-(--radius-panel) bg-(--color-felt-800)/90 border border-white/8 shadow-(--shadow-panel) px-5 py-2.5 font-ui text-sm max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:px-3 max-sm:py-1.5 max-sm:text-xs">
      {([0, 1] as const).map((team) => (
        <span key={team} className="flex items-baseline gap-2">
          <span
            className={`size-2 rounded-full self-center ${team === 0 ? 'bg-(--color-lamplight)' : 'bg-(--color-ivory)'}`}
            aria-hidden
          />
          <span className="text-(--color-ivory)/70">{teamNames[team]}</span>
          <span className="font-display font-semibold text-xl tabular-nums text-(--color-ivory)">
            {scores[team]}
          </span>
          {roundPoints !== undefined && (
            <span className="text-(--color-ivory)/60 tabular-nums max-sm:hidden">
              {roundPoints[team] >= 0 ? '+' : ''}
              {roundPoints[team]} pts
            </span>
          )}
          {trickCounts !== undefined && (
            <span className="text-(--color-ivory)/60 tabular-nums max-sm:hidden">
              · {trickCounts[team]} trick{trickCounts[team] === 1 ? '' : 's'}
            </span>
          )}
        </span>
      ))}
      <span className="text-(--color-ivory)/60 max-sm:hidden">first to {target}</span>
      <span className="ml-auto flex flex-wrap items-center gap-4 max-sm:gap-2">
        {contract !== null && (
          <span className="text-(--color-ivory)/85">
            <span className="text-(--color-ivory)/60">Contract</span>{' '}
            <span className="font-semibold">
              {contract.playerName} · {contract.value}
              {contract.sansAtout ? ' SA' : ''}
            </span>
            {contract.progress !== undefined && (
              <span className="ml-1.5 tabular-nums text-(--color-lamplight)">
                {contract.progress}/{contract.value}
              </span>
            )}
          </span>
        )}
        {trumpDecided && (
          <span className="flex items-center gap-1.5">
            <span className="text-(--color-ivory)/60">Trump</span>
            {trump === null ? (
              <span className="font-semibold text-(--color-ivory)/85">none</span>
            ) : (
              <span className="font-bold text-lg" style={{ color: SUIT_STYLES[trump].color }}>
                {SUIT_STYLES[trump].glyph}
                <span className="sr-only">{SUIT_STYLES[trump].label}</span>
              </span>
            )}
          </span>
        )}
      </span>
    </div>
  );
}
