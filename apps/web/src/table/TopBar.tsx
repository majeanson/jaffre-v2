import type { SeatView } from '@jaffre/engine';
import { ScoreStrip } from '@jaffre/ui';
import { GHOST_BTN } from '../components/buttonStyles.js';
import { ThemeSwitcher } from '../components/ThemeSwitcher.js';
import type { ContractDisplay } from './useTableDerived.js';

export interface TopBarProps {
  readonly view: SeatView;
  readonly contract: ContractDisplay | null;
  readonly trickCounts: readonly [number, number];
  readonly onLeave: () => void;
}

/** Owns the top bar: leave button, theme switcher, score strip. */
export function TopBar({ view, contract, trickCounts, onLeave }: TopBarProps) {
  return (
    <div className="flex w-full max-w-[min(96vw,100rem)] items-center gap-3 max-sm:gap-2">
      <button
        onClick={onLeave}
        aria-label="Leave the table"
        className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm text-(--color-ivory)/80 max-sm:px-2 ${GHOST_BTN}`}
      >
        ←<span className="max-sm:hidden"> Leave</span>
      </button>
      <span className="max-sm:hidden">
        <ThemeSwitcher />
      </span>
      <div className="flex-1" data-testid="score-strip">
        <ScoreStrip
          teamNames={['Team A', 'Team B']}
          scores={view.scores}
          target={41}
          contract={contract}
          trump={view.trump}
          trumpDecided={view.trumpDecided}
          roundPoints={view.roundPoints}
          trickCounts={trickCounts}
        />
      </div>
    </div>
  );
}
