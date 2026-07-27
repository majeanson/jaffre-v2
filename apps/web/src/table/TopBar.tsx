import type { SeatView } from '@jaffre/engine';
import {
  ScoreStrip,
  useLang,
  type Lang,
  type ScoreboardRound,
  type TeamSpecials,
} from '@jaffre/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { HelpButton } from '../help/HelpButton.js';
import { SoundToggle } from '../audio/SoundToggle.js';
import { TEAMS } from '../teams.js';
import { IconButton, ICON_BTN_LABELED } from '../components/IconButton.js';
import {
  IconEye,
  IconGear,
  IconList,
  IconPalette,
  IconQuestion,
  IconSignOut,
  IconSparkle,
} from '../components/icons.js';
import { CollectionSheet } from '../components/CollectionSheet.js';
import { SettingsSheet } from '../components/SettingsSheet.js';
import { SeenCards } from './SeenCards.js';
import { loadSeenPref, saveSeenPref } from './seenPref.js';
import { StartingHandsInset } from './StartingHandsPanel.js';
import type { ContractDisplay } from './useTableDerived.js';

const T: Record<
  Lang,
  {
    leave: string;
    options: string;
    skins: string;
    settings: string;
    howToPlay: string;
    help: string;
    coach: string;
    coachTitle: string;
    gameLog: string;
    log: string;
    seen: string;
    seenTitle: string;
    leaveTable: string;
    leaveTableTitle: string;
    leaveConfirm: string;
  }
> = {
  en: {
    // The truth of the action: a soft hop — the seat is kept, resume from
    // "Your tables". Giving the seat up for good is `leaveTable` below.
    leave: 'Back to home — your seat is kept',
    options: 'Options',
    skins: 'Skins',
    settings: 'Settings',
    howToPlay: 'How to play',
    help: 'Help',
    coach: 'Coach — suggest a move on your turn',
    coachTitle: 'Coach',
    gameLog: 'Game log',
    log: 'Log',
    seen: 'Cards seen — track which values are already played',
    seenTitle: 'Seen',
    leaveTable: 'Leave table for good — your seat is freed',
    leaveTableTitle: 'Leave table',
    leaveConfirm: 'Sure? Seat frees up',
  },
  fr: {
    leave: 'Retour à l’accueil — ton siège est gardé',
    options: 'Options',
    skins: 'Habillages',
    settings: 'Réglages',
    howToPlay: 'Comment jouer',
    help: 'Aide',
    coach: 'Coach — suggère un coup à ton tour',
    coachTitle: 'Coach',
    gameLog: 'Journal de partie',
    log: 'Journal',
    seen: 'Cartes vues — suis les valeurs déjà jouées',
    seenTitle: 'Vues',
    leaveTable: 'Quitter la table pour de bon — ton siège se libère',
    leaveTableTitle: 'Quitter la table',
    leaveConfirm: 'Certain? Le siège se libère',
  },
};

export interface TopBarProps {
  readonly view: SeatView;
  readonly contract: ContractDisplay | null;
  /** Finished rounds for the written scoreboard, oldest first. */
  readonly rounds: readonly ScoreboardRound[];
  /** Player names by absolute seat — labels the per-round starting hands. */
  readonly names: readonly string[];
  readonly trickCounts: readonly [number, number];
  readonly specials: readonly [TeamSpecials, TeamSpecials];
  readonly action: string;
  /** The viewer's own team (seat parity), highlighted in the scoreboard. */
  readonly myTeam?: 0 | 1 | null;
  readonly onLeave: () => void;
  /** Give the seat up for good (online rooms). Distinct from `onLeave`, which
   * keeps it — omitted in practice, where there is no seat to surrender. */
  readonly onLeaveTable?: (() => void) | undefined;
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
  names,
  trickCounts,
  specials,
  action,
  myTeam = null,
  onLeave,
  onLeaveTable,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seenOn, setSeenOn] = useState(loadSeenPref);
  // Two-tap confirm for the irreversible one, matching the recap's. It relaxes
  // on its own so a stray tap doesn't leave the button stuck asking.
  const [leaveArmed, setLeaveArmed] = useState(false);
  useEffect(() => {
    if (!leaveArmed) return undefined;
    const timer = setTimeout(() => setLeaveArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [leaveArmed]);

  // Tapping a finished round's R-row on the scorepad unfolds that round's
  // starting hands — the same reveal the round summary offers, available for
  // any past round mid-game.
  const renderRoundDetail = (round: number): ReactNode => {
    const hands = view.roundSummaries.find((s) => s.roundIndex === round - 1)?.startingHands;
    if (hands === undefined) return null;
    return <StartingHandsInset round={round} hands={hands} names={names} />;
  };

  return (
    <div className="flex w-full max-w-[min(96vw,100rem)] justify-center" data-testid="score-strip">
      {skinsOpen && <CollectionSheet onClose={() => setSkinsOpen(false)} />}
      {settingsOpen && (
        <SettingsSheet
          coach={{ on: coachOn, onToggle: onToggleCoach }}
          onOpenCollection={() => setSkinsOpen(true)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
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
        renderRoundDetail={renderRoundDetail}
        aside={seenOn ? <SeenCards view={view} /> : undefined}
        currentRound={view.phase === 'game_over' ? undefined : view.roundIndex + 1}
        action={action}
        myTeam={myTeam}
        actions={
          <>
            <IconButton label={t.leave} onClick={onLeave}>
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
                  <IconPalette />
                </IconButton>
                <SoundToggle labeled />
                <IconButton
                  label={t.settings}
                  text={t.settings}
                  onClick={() => setSettingsOpen(true)}
                >
                  <IconGear />
                </IconButton>
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
                  label={t.seen}
                  text={t.seenTitle}
                  aria-pressed={seenOn}
                  active={seenOn}
                  onClick={() =>
                    setSeenOn((on) => {
                      saveSeenPref(!on);
                      return !on;
                    })
                  }
                >
                  <IconEye />
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
                {/* The room's only way to surrender the seat mid-game — the
                    collapsed bar's control keeps it. Danger-coloured so the
                    two never read as the same action, even icon-only. */}
                {onLeaveTable !== undefined && (
                  <IconButton
                    danger
                    data-testid="leave-table"
                    label={leaveArmed ? t.leaveConfirm : t.leaveTable}
                    text={leaveArmed ? t.leaveConfirm : t.leaveTableTitle}
                    onClick={() => {
                      if (leaveArmed) onLeaveTable();
                      else setLeaveArmed(true);
                    }}
                  >
                    <IconSignOut />
                  </IconButton>
                )}
              </div>
            )}
          </>
        }
      />
    </div>
  );
}
