import type { SeatView } from '@jaffre/engine';
import { ScoreStrip } from '@jaffre/ui';
import { GHOST_BTN } from '../components/buttonStyles.js';
import { HelpButton } from '../help/HelpButton.js';
import { TEAMS } from '../teams.js';
import { ThemeSwitcher } from '../components/ThemeSwitcher.js';
import type { ContractDisplay } from './useTableDerived.js';

export interface TopBarProps {
  readonly view: SeatView;
  readonly contract: ContractDisplay | null;
  readonly trickCounts: readonly [number, number];
  readonly onLeave: () => void;
  readonly logOpen: boolean;
  readonly onToggleLog: () => void;
  /** Scene viewer: mount with the details panel already expanded. */
  readonly defaultDetailsOpen?: boolean;
}

/**
 * Owns the top bar. Collapsed it is just the score strip; expanding it
 * reveals details plus the app controls (leave, skin, log).
 */
export function TopBar({
  view,
  contract,
  trickCounts,
  onLeave,
  logOpen,
  onToggleLog,
  defaultDetailsOpen = false,
}: TopBarProps) {
  return (
    <div className="flex w-full max-w-[min(96vw,100rem)] justify-center" data-testid="score-strip">
      <ScoreStrip
        defaultDetailsOpen={defaultDetailsOpen}
        teamNames={[TEAMS[0].label, TEAMS[1].label]}
        scores={view.scores}
        target={41}
        contract={contract}
        trump={view.trump}
        trumpDecided={view.trumpDecided}
        roundPoints={view.roundPoints}
        trickCounts={trickCounts}
        actions={
          <>
            <button
              onClick={onLeave}
              className={`whitespace-nowrap px-3 py-1.5 text-sm text-(--color-ivory)/80 ${GHOST_BTN}`}
            >
              ← Leave
            </button>
            <ThemeSwitcher />
            <HelpButton label="Help" />
            <button
              type="button"
              aria-expanded={logOpen}
              onClick={onToggleLog}
              className={`px-3 py-1.5 text-sm text-(--color-ivory)/80 ${GHOST_BTN}`}
            >
              {logOpen ? 'Hide log' : 'Log'}
            </button>
          </>
        }
      />
    </div>
  );
}
