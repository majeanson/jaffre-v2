import type { ClientAction } from '@jaffre/protocol';
import { useEffect, useState } from 'react';
import type { SceneUi } from '../dev/sceneManifest.js';
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
  useTableDerived,
  useTrickHold,
} from '../table/index.js';
import { loadCoachPref, saveCoachPref } from '../table/coachPref.js';
import { leaveVoice } from '../voice/rtc.js';
import { VoiceControls } from '../voice/VoiceControls.js';

export interface TableProps {
  readonly onAction: (action: ClientAction) => void;
  readonly onLeave: () => void;
  /** Start a fresh game with the same table. */
  readonly onRematch?: () => void;
  /** True in a room (chat + voice); false in practice mode (bots don't chat). */
  readonly online?: boolean;
  /** Scene viewer: keep a held trick on screen indefinitely. */
  readonly frozenHold?: boolean;
  /** Scene viewer: panels to open on mount (initial state only). */
  readonly initialUi?: SceneUi | undefined;
}

/** Route-level composition of the game table: hooks + section layout, no game logic. */
export function Table({
  onAction,
  onLeave,
  onRematch,
  online = false,
  frozenHold = false,
  initialUi,
}: TableProps) {
  const log = useGameStore((s) => s.log);
  const [logOpen, setLogOpen] = useState(initialUi?.logOpen ?? false);
  const [coachOn, setCoachOn] = useState(loadCoachPref);
  const derived = useTableDerived(coachOn);
  useTrickHold(frozenHold);
  // Leaving the table (or the room) always tears the voice mesh down.
  useEffect(() => (online ? () => leaveVoice() : undefined), [online]);

  if (derived === null) return <WaitingScreen />;
  const { view, roster, me, myTurn, seatInfo } = derived;

  return (
    <main className="table-felt flex h-dvh flex-col items-center overflow-hidden p-3 pb-0 max-sm:p-2 max-sm:pb-0">
      {online && <ConnectionBanner />}
      <TopBar
        view={view}
        contract={derived.contractDisplay}
        rounds={derived.scoreboardRounds}
        trickCounts={derived.trickCounts}
        specials={derived.teamSpecials}
        action={derived.headerAction}
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
        />
      )}
    </main>
  );
}
