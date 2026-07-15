import type { ClientAction } from '@jaffre/protocol';
import { useEffect, useState } from 'react';
import { useGameStore } from '../state/gameStore.js';
import {
  BidOverlay,
  Comms,
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
import { leaveVoice } from '../voice/rtc.js';

export interface TableProps {
  readonly onAction: (action: ClientAction) => void;
  readonly onLeave: () => void;
  /** Start a fresh game with the same table. */
  readonly onRematch?: () => void;
  /** True in a room (chat + voice); false in practice mode (bots don't chat). */
  readonly online?: boolean;
}

/** Route-level composition of the game table: hooks + section layout, no game logic. */
export function Table({ onAction, onLeave, onRematch, online = false }: TableProps) {
  const log = useGameStore((s) => s.log);
  const [logOpen, setLogOpen] = useState(false);
  const derived = useTableDerived();
  useTrickHold();
  // Leaving the table (or the room) always tears the voice mesh down.
  useEffect(() => (online ? () => leaveVoice() : undefined), [online]);

  if (derived === null) return <WaitingScreen />;
  const { view, roster, me, myTurn, seatInfo } = derived;

  return (
    <main className="table-felt flex h-dvh flex-col items-center overflow-hidden p-3 pb-0 max-sm:p-2 max-sm:pb-0">
      <TopBar
        view={view}
        contract={derived.contractDisplay}
        trickCounts={derived.trickCounts}
        onLeave={onLeave}
      />
      <Stage
        trickPlays={derived.trickPlays}
        sweepTo={derived.sweepTo}
        banner={derived.heldBanner}
        seatInfo={seatInfo}
        bidOverlay={
          view.phase === 'bidding' &&
          myTurn && <BidOverlay options={derived.bidOptions} onAction={onAction} />
        }
      />
      <Overlays view={view} roster={roster} onRematch={onRematch} onLeave={onLeave} />
      <UtilityRow
        you={seatInfo(0)}
        lastTrick={derived.lastTrick}
        logOpen={logOpen}
        onToggleLog={() => setLogOpen((o) => !o)}
        comms={online && <Comms me={me} />}
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
        />
      )}
    </main>
  );
}
