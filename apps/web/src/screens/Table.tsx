import { sameCard } from '@jaffre/engine';
import type { ClientAction } from '@jaffre/protocol';
import { useEffect, useState } from 'react';
import type { SceneUi } from '../dev/sceneManifest.js';
import { ShareButton } from '../components/ShareButton.js';
import { useGameStore } from '../state/gameStore.js';
import {
  BidOverlay,
  Comms,
  ConnectionBanner,
  GameLogPanel,
  Overlays,
  PlayerHand,
  Stage,
  TopBar,
  UtilityRow,
  WaitingScreen,
  useQueuedPlay,
  useTableDerived,
  useTrickHold,
} from '../table/index.js';
import { loadCoachPref, saveCoachPref } from '../table/coachPref.js';
import { leaveVoice } from '../voice/rtc.js';
import { VoiceControls } from '../voice/VoiceControls.js';
import { DevConsole, DEV_CONSOLE_ENABLED } from '../dev/DevConsole.js';

export interface TableProps {
  readonly onAction: (action: ClientAction) => void;
  readonly onLeave: () => void;
  /** Start a fresh game with the same table. */
  readonly onRematch?: () => void;
  /** Re-pair the table between games (online rooms only). */
  readonly onSwapSeats?: () => void;
  /** True in a room (chat + voice); false in practice mode (bots don't chat). */
  readonly online?: boolean;
  /** The room code (online rooms only) — feeds the Share button's invite link. */
  readonly roomCode?: string;
  /** Scene viewer: keep a held trick on screen indefinitely. */
  readonly frozenHold?: boolean;
  /** Scene viewer: panels to open on mount (initial state only). */
  readonly initialUi?: SceneUi | undefined;
  /** Reserve space at the bottom so a fixed overlay (e.g. the replay transport
   * bar) sits clear of the hand instead of covering it. */
  readonly bottomInset?: boolean;
  /** Real play (App) → show the dev console; scenes/replay leave it off. */
  readonly dev?: boolean;
}

/** Route-level composition of the game table: hooks + section layout, no game logic. */
export function Table({
  onAction,
  onLeave,
  onRematch,
  onSwapSeats,
  online = false,
  bottomInset = false,
  dev = false,
  roomCode,
  frozenHold = false,
  initialUi,
}: TableProps) {
  const log = useGameStore((s) => s.log);
  const setQueued = useGameStore((s) => s.setQueued);
  const [logOpen, setLogOpen] = useState(initialUi?.logOpen ?? false);
  const [coachOn, setCoachOn] = useState(loadCoachPref);
  const derived = useTableDerived(coachOn);
  useTrickHold(frozenHold);
  useQueuedPlay(onAction);
  // Leaving the table (or the room) always tears the voice mesh down.
  useEffect(() => (online ? () => leaveVoice() : undefined), [online]);

  if (derived === null) return <WaitingScreen />;
  const { view, roster, me, myTurn, seatInfo } = derived;

  return (
    <main
      className={`table-felt flex h-dvh flex-col items-center overflow-hidden p-3 max-sm:p-2 ${
        bottomInset ? 'pb-20 max-sm:pb-16' : 'pb-0 max-sm:pb-0'
      }`}
    >
      {online && <ConnectionBanner />}
      <TopBar
        view={view}
        contract={derived.contractDisplay}
        rounds={derived.scoreboardRounds}
        trickCounts={derived.trickCounts}
        specials={derived.teamSpecials}
        action={derived.headerAction}
        myTeam={me !== null ? ((me % 2) as 0 | 1) : null}
        onLeave={onLeave}
        logOpen={logOpen}
        onToggleLog={() => setLogOpen((o) => !o)}
        coachOn={coachOn}
        onToggleCoach={() =>
          setCoachOn((on) => {
            saveCoachPref(!on);
            return !on;
          })
        }
        voice={online && me !== null ? <VoiceControls me={me} /> : undefined}
        share={online && roomCode !== undefined ? <ShareButton code={roomCode} /> : undefined}
        defaultDetailsOpen={initialUi?.scoreDetailsOpen ?? false}
      />
      <Stage
        trickPlays={derived.trickPlays}
        sweepTo={derived.sweepTo}
        banner={derived.heldBanner}
        winnerPosition={derived.winnerPosition}
        seatInfo={seatInfo}
        coachTip={derived.coach?.tip ?? null}
        bidOverlay={
          view.phase === 'bidding' &&
          myTurn && (
            <BidOverlay
              options={derived.bidOptions}
              order={derived.auctionOrder}
              onAction={onAction}
              recommended={derived.coach?.bid ?? null}
            />
          )
        }
      />
      <Overlays
        view={view}
        roster={roster}
        me={me}
        onReady={() => onAction({ type: 'continue' })}
        onRematch={onRematch}
        onSwapSeats={onSwapSeats}
        onLeave={onLeave}
      />
      <UtilityRow
        you={seatInfo(0)}
        lastTrick={derived.lastTrick}
        defaultLastTrickOpen={initialUi?.lastTrickOpen ?? false}
        comms={online && <Comms defaultChatOpen={initialUi?.chatOpen ?? false} />}
      />
      <GameLogPanel
        lines={log.map((l) => l.text)}
        visible={logOpen}
        onClose={() => setLogOpen(false)}
      />
      {me !== null && (
        <PlayerHand
          cards={view.hand}
          legal={derived.legal}
          ledSuit={derived.ledSuit}
          active={myTurn && view.phase === 'playing'}
          onPlay={(card) => onAction({ type: 'play_card', card })}
          recommended={view.phase === 'playing' ? (derived.coach?.card ?? null) : null}
          queued={derived.queued}
          queueable={derived.queueable}
          onQueueToggle={(card) =>
            setQueued(derived.queued !== null && sameCard(card, derived.queued) ? null : card)
          }
        />
      )}
      {dev && DEV_CONSOLE_ENABLED && <DevConsole />}
    </main>
  );
}
