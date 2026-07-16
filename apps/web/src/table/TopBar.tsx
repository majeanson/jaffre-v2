import type { SeatView } from '@jaffre/engine';
import { ScoreStrip, type TeamSpecials } from '@jaffre/ui';
import { GHOST_BTN } from '../components/buttonStyles.js';
import { HelpButton } from '../help/HelpButton.js';
import { SoundToggle } from '../audio/SoundToggle.js';
import { TEAMS } from '../teams.js';
import { ThemeSwitcher } from '../components/ThemeSwitcher.js';
import type { ContractDisplay } from './useTableDerived.js';

export interface TopBarProps {
  readonly view: SeatView;
  readonly contract: ContractDisplay | null;
  readonly trickCounts: readonly [number, number];
  readonly specials: readonly [TeamSpecials, TeamSpecials];
  readonly action: string;
  readonly onLeave: () => void;
  readonly logOpen: boolean;
  readonly onToggleLog: () => void;
  readonly coachOn: boolean;
  readonly onToggleCoach: () => void;
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
  specials,
  action,
  onLeave,
  logOpen,
  onToggleLog,
  coachOn,
  onToggleCoach,
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
        specials={specials}
        action={action}
        actions={
          <>
            <button
              onClick={onLeave}
              className={`whitespace-nowrap px-3 py-1.5 text-sm text-(--color-ivory)/80 ${GHOST_BTN}`}
            >
              ← Leave
            </button>
            <ThemeSwitcher />
            <SoundToggle />
            <HelpButton label="Help" />
            <button
              type="button"
              aria-pressed={coachOn}
              onClick={onToggleCoach}
              title="Show a suggested move on your turn"
              className={`whitespace-nowrap px-3 py-1.5 text-sm ${GHOST_BTN} ${
                coachOn ? 'text-(--color-lamplight)' : 'text-(--color-ivory)/80'
              }`}
            >
              {coachOn ? '✦ Coach on' : 'Coach'}
            </button>
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
