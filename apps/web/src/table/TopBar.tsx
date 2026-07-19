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
import { applyLang, LANGS } from '../lang.js';
import { IconButton, ICON_BTN_LABELED } from '../components/IconButton.js';
import {
  IconCards,
  IconGear,
  IconGlobe,
  IconList,
  IconQuestion,
  IconSignOut,
  IconSparkle,
} from '../components/icons.js';
import { CollectionSheet } from '../components/CollectionSheet.js';
import type { ContractDisplay } from './useTableDerived.js';

const T: Record<
  Lang,
  {
    leave: string;
    options: string;
    skins: string;
    language: string;
    howToPlay: string;
    help: string;
    coach: string;
    coachTitle: string;
    gameLog: string;
    log: string;
  }
> = {
  en: {
    leave: 'Leave table',
    options: 'Options',
    skins: 'Skins',
    language: 'Language',
    howToPlay: 'How to play',
    help: 'Help',
    coach: 'Coach — suggest a move on your turn',
    coachTitle: 'Coach',
    gameLog: 'Game log',
    log: 'Log',
  },
  fr: {
    leave: 'Quitter la table',
    options: 'Options',
    skins: 'Habillages',
    language: 'Langue',
    howToPlay: 'Comment jouer',
    help: 'Aide',
    coach: 'Coach — suggère un coup à ton tour',
    coachTitle: 'Coach',
    gameLog: 'Journal de partie',
    log: 'Journal',
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
  /** The viewer's own team (seat parity), highlighted in the scoreboard. */
  readonly myTeam?: 0 | 1 | null;
  readonly onLeave: () => void;
  readonly logOpen: boolean;
  readonly onToggleLog: () => void;
  readonly coachOn: boolean;
  readonly onToggleCoach: () => void;
  /** Share-this-table button (online rooms) — lives inside the Options drawer. */
  readonly share?: ReactNode;
  /** Dev console trigger (practice + dev builds) — sits next to Options. */
  readonly devConsole?: ReactNode;
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
  myTeam = null,
  onLeave,
  logOpen,
  onToggleLog,
  coachOn,
  onToggleCoach,
  share,
  devConsole,
  defaultDetailsOpen = false,
}: TopBarProps) {
  const lang = useLang();
  const t = T[lang];
  const [optionsOpen, setOptionsOpen] = useState(defaultDetailsOpen);
  const [skinsOpen, setSkinsOpen] = useState(false);
  const otherLang = LANGS.find((l) => l.id !== lang) ?? LANGS[0];
  return (
    <div className="flex w-full max-w-[min(96vw,100rem)] justify-center" data-testid="score-strip">
      {skinsOpen && <CollectionSheet onClose={() => setSkinsOpen(false)} />}
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
        myTeam={myTeam}
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
            {devConsole}
            {optionsOpen && (
              <div
                data-testid="options-drawer"
                className="flex w-full flex-wrap items-center justify-center gap-2 pt-1"
              >
                <IconButton label={t.skins} text={t.skins} onClick={() => setSkinsOpen(true)}>
                  <IconCards />
                </IconButton>
                <IconButton
                  label={`${t.language} · ${otherLang?.label ?? ''}`}
                  text={(otherLang?.id ?? 'en').toUpperCase()}
                  onClick={() => otherLang && applyLang(otherLang.id)}
                >
                  <IconGlobe />
                </IconButton>
                <SoundToggle labeled />
                <HelpButton label={t.howToPlay} text={t.help} className={ICON_BTN_LABELED}>
                  <IconQuestion />
                </HelpButton>
                <IconButton
                  label={t.coach}
                  text={t.coachTitle}
                  aria-pressed={coachOn}
                  active={coachOn}
                  onClick={onToggleCoach}
                >
                  <IconSparkle />
                </IconButton>
                <IconButton
                  label={t.gameLog}
                  text={t.log}
                  aria-expanded={logOpen}
                  active={logOpen}
                  onClick={onToggleLog}
                >
                  <IconList />
                </IconButton>
                {share}
              </div>
            )}
          </>
        }
      />
    </div>
  );
}
