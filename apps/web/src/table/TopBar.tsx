import type { SeatView } from '@jaffre/engine';
import { ScoreStrip, type ScoreboardRound, type TeamSpecials } from '@jaffre/ui';
import { HelpButton } from '../help/HelpButton.js';
import { SoundToggle } from '../audio/SoundToggle.js';
import { TEAMS } from '../teams.js';
import { ThemeSwitcher } from '../components/ThemeSwitcher.js';
import type { ContractDisplay } from './useTableDerived.js';

/** Ghost-pill chrome with a per-action tint so each control reads at a glance. */
const TINT_BTN =
  'cursor-pointer whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm hover:bg-white/8';

export interface TopBarProps {
  readonly view: SeatView;
  readonly contract: ContractDisplay | null;
  /** Finished rounds for the written scoreboard, oldest first. */
  readonly rounds: readonly ScoreboardRound[];
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
  rounds,
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
        rounds={rounds}
        currentRound={view.phase === 'game_over' ? undefined : view.roundIndex + 1}
        action={action}
        actions={
          <>
            <button
              onClick={onLeave}
              className={`${TINT_BTN} border-(--color-danger)/45 text-(--color-danger-text) hover:bg-(--color-danger)/12`}
            >
              ← Leave
            </button>
            <ThemeSwitcher />
            <SoundToggle />
            <HelpButton
              label="Help"
              className={`${TINT_BTN} border-(--color-ok)/45 text-(--color-ok) hover:bg-(--color-ok)/12`}
            />
            <button
              type="button"
              aria-pressed={coachOn}
              onClick={onToggleCoach}
              title="Show a suggested move on your turn"
              className={`${TINT_BTN} border-(--color-lamplight)/45 text-(--color-lamplight) ${
                coachOn ? 'bg-(--color-lamplight)/15' : ''
              }`}
            >
              {coachOn ? '✦ Coach on' : 'Coach'}
            </button>
            <button
              type="button"
              aria-expanded={logOpen}
              onClick={onToggleLog}
              className={`${TINT_BTN} border-(--color-team-b)/45 text-(--color-team-b) ${
                logOpen ? 'bg-(--color-team-b)/15' : ''
              }`}
            >
              {logOpen ? 'Hide log' : 'Log'}
            </button>
          </>
        }
      />
    </div>
  );
}
