import type { SeatView } from '@jaffre/engine';
import {
  ScoreStrip,
  useLang,
  type Lang,
  type ScoreboardRound,
  type TeamSpecials,
} from '@jaffre/ui';
import { useState, type ReactNode } from 'react';
import { HelpButton } from '../help/HelpButton.js';
import { SoundToggle } from '../audio/SoundToggle.js';
import { TEAMS } from '../teams.js';
import { IconButton, ICON_BTN_NEUTRAL } from '../components/IconButton.js';
import { IconGear, IconList, IconQuestion, IconSignOut, IconSparkle } from '../components/icons.js';
import { SkinLink } from '../components/SkinLink.js';
import { LangSwitcher } from '../components/LangSwitcher.js';
import type { ContractDisplay } from './useTableDerived.js';

const T: Record<
  Lang,
  { leave: string; options: string; howToPlay: string; coach: string; gameLog: string }
> = {
  en: {
    leave: 'Leave table',
    options: 'Options',
    howToPlay: 'How to play',
    coach: 'Coach — suggest a move on your turn',
    gameLog: 'Game log',
  },
  fr: {
    leave: 'Quitter la table',
    options: 'Options',
    howToPlay: 'Comment jouer',
    coach: 'Coach — suggère un coup à ton tour',
    gameLog: 'Journal de partie',
  },
};

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
  /** Voice controls (online rooms) — lives inside the Options drawer. */
  readonly voice?: ReactNode;
  /** Share-this-table button (online rooms) — lives inside the Options drawer. */
  readonly share?: ReactNode;
  /** Scene viewer: mount with the details panel already expanded. */
  readonly defaultDetailsOpen?: boolean;
}

/**
 * Owns the top bar. Collapsed it is just the score strip; expanding it
 * reveals the scorepad plus two icon controls — Leave and Options — with
 * everything else (skin, sound, help, coach, log, voice) inside Options.
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
  voice,
  share,
  defaultDetailsOpen = false,
}: TopBarProps) {
  const t = T[useLang()];
  const [optionsOpen, setOptionsOpen] = useState(defaultDetailsOpen);
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
            <IconButton danger label={t.leave} onClick={onLeave}>
              <IconSignOut />
            </IconButton>
            <IconButton
              label={t.options}
              active={optionsOpen}
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen((o) => !o)}
            >
              <IconGear />
            </IconButton>
            {optionsOpen && (
              <div
                data-testid="options-drawer"
                className="flex w-full flex-wrap items-center justify-center gap-2 pt-1"
              >
                <SkinLink />
                <LangSwitcher />
                <SoundToggle />
                <HelpButton label={t.howToPlay} className={ICON_BTN_NEUTRAL}>
                  <IconQuestion />
                </HelpButton>
                <IconButton
                  label={t.coach}
                  aria-pressed={coachOn}
                  active={coachOn}
                  onClick={onToggleCoach}
                >
                  <IconSparkle />
                </IconButton>
                <IconButton
                  label={t.gameLog}
                  aria-expanded={logOpen}
                  active={logOpen}
                  onClick={onToggleLog}
                >
                  <IconList />
                </IconButton>
                {voice}
                {share}
              </div>
            )}
          </>
        }
      />
    </div>
  );
}
