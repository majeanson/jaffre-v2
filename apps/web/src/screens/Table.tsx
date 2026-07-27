import { sameCard } from '@jaffre/engine';
import type { ClientAction } from '@jaffre/protocol';
import { useEffect, useState } from 'react';
import type { SceneUi } from '../dev/sceneManifest.js';
import { NoticeToast } from '../components/NoticeToast.js';
import { ShareButton } from '../components/ShareButton.js';
import { useGameStore } from '../state/gameStore.js';
import { RoomComms } from '../comms/RoomComms.js';
import {
  BidOverlay,
  ConnectionBanner,
  GameLogPanel,
  HandSortButton,
  Overlays,
  PlayerHand,
  Stage,
  TopBar,
  TutorialCoach,
  UtilityRow,
  WaitingScreen,
  useHandSort,
  useQueuedPlay,
  useTableDerived,
  useTrickHold,
} from '../table/index.js';
import { loadCoachPref, saveCoachPref } from '../table/coachPref.js';
import { HelpButton } from '../help/HelpButton.js';
import { ICON_BTN_CELL_NEUTRAL } from '../components/IconButton.js';
import { IconQuestion } from '../components/icons.js';
import { TrumpCallout } from '../table/TrumpCallout.js';
import { useWakeLock } from '../pwa/useWakeLock.js';
import { leaveVoice } from '../voice/rtc.js';
import { DevConsole, DEV_CONSOLE_ENABLED } from '../dev/DevConsole.js';

export interface TableProps {
  readonly onAction: (action: ClientAction) => void;
  readonly onLeave: () => void;
  /** Permanently give the seat up (recap "Leave"); falls back to onLeave. */
  readonly onLeaveTable?: () => void;
  /** Start a fresh game with the same table. */
  readonly onRematch?: () => void;
  /** Re-pair the table between games (online rooms only). */
  readonly onSwapSeats?: () => void;
  /** Toggle voluntary auto-play for your own seat (online rooms only). */
  readonly onToggleAutoPlay?: (on: boolean) => void;
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
  /** Replay: skip the decorative round-start deal fly-out — scrubbing across
   * round boundaries replayed it constantly, and its landed card-backs sat on
   * the seat plaques/hand in every paused frame. */
  readonly noDealIntro?: boolean;
  /** Real play (App) → show the dev console; scenes/replay leave it off. */
  readonly dev?: boolean;
  /** Practice only: run the one-time first-practice tutorial over the felt. */
  readonly tutorial?: boolean;
}

/** Route-level composition of the game table: hooks + section layout, no game logic. */
export function Table({
  onAction,
  onLeave,
  onLeaveTable,
  onRematch,
  onSwapSeats,
  onToggleAutoPlay,
  online = false,
  bottomInset = false,
  noDealIntro = false,
  dev = false,
  tutorial = false,
  roomCode,
  frozenHold = false,
  initialUi,
}: TableProps) {
  const log = useGameStore((s) => s.log);
  const setQueued = useGameStore((s) => s.setQueued);
  const [logOpen, setLogOpen] = useState(initialUi?.logOpen ?? false);
  // Coach defaults on in practice (the learning table) until explicitly set.
  const [coachOn, setCoachOn] = useState(() => loadCoachPref(!online));
  const derived = useTableDerived(coachOn);
  const handSort = useHandSort(derived?.view.hand ?? []);
  useTrickHold(frozenHold);
  useQueuedPlay(onAction);
  // Screen stays awake at the table — thinking through a bid isn't idle time.
  useWakeLock();
  // Leaving the table (or the room) always tears the voice mesh down.
  useEffect(() => (online ? () => leaveVoice() : undefined), [online]);

  if (derived === null) return <WaitingScreen />;
  const { view, roster, me, myTurn, seatInfo } = derived;

  return (
    <main
      className={`table-felt flex h-full flex-col items-center overflow-hidden p-3 max-sm:p-2 ${
        bottomInset ? 'pb-20 max-sm:pb-16' : 'pb-0 max-sm:pb-0'
      }`}
    >
      {online && <ConnectionBanner />}
      <NoticeToast />
      {/* Real play only (dev = App-mounted): scenes and replay stage mid-round
          states where the fanfare would be noise in every shot. */}
      {dev && <TrumpCallout />}
      <TopBar
        view={view}
        contract={derived.contractDisplay}
        rounds={derived.scoreboardRounds}
        names={roster.seats.map((s) => s?.name ?? '—')}
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
        share={
          online && roomCode !== undefined ? <ShareButton code={roomCode} labeled /> : undefined
        }
        devConsole={dev && DEV_CONSOLE_ENABLED ? <DevConsole /> : undefined}
        defaultDetailsOpen={initialUi?.scoreDetailsOpen ?? false}
      />
      <Stage
        trickPlays={derived.trickPlays}
        sweepTo={derived.sweepTo}
        banner={derived.heldBanner}
        winnerPosition={derived.winnerPosition}
        seatInfo={seatInfo}
        roundIndex={view.roundIndex}
        coachTip={derived.coach?.tip ?? null}
        capHeight={me === null}
        noDealIntro={noDealIntro}
        bidOverlay={
          view.phase === 'bidding' && (
            <BidOverlay
              options={derived.bidOptions}
              order={derived.auctionOrder}
              onAction={onAction}
              recommended={derived.coach?.bid ?? null}
              hailMary12={view.rules?.hailMary12 ?? false}
              waiting={!myTurn}
            />
          )
        }
      />
      <Overlays
        view={view}
        roster={roster}
        me={me}
        rounds={derived.scoreboardRounds}
        onReady={() => onAction({ type: 'continue' })}
        onRematch={onRematch}
        onSwapSeats={onSwapSeats}
        onLeave={onLeaveTable ?? onLeave}
        confirmLeave={onLeaveTable !== undefined}
      />
      <UtilityRow
        you={seatInfo(0)}
        lastTrick={derived.lastTrick}
        defaultLastTrickOpen={initialUi?.lastTrickOpen ?? false}
        comms={
          online && (
            <RoomComms
              variant="popover"
              me={me}
              defaultOpen={initialUi?.chatOpen ?? false}
              defaultTab={initialUi?.commsTab ?? 'chat'}
            />
          )
        }
        autoPlay={
          online && onToggleAutoPlay !== undefined && me !== null
            ? {
                on: seatInfo(0)?.autoPlay ?? false,
                onToggle: () => onToggleAutoPlay(!(seatInfo(0)?.autoPlay ?? false)),
              }
            : undefined
        }
        sort={me !== null && <HandSortButton sort={handSort} disabled={view.hand.length < 2} />}
        help={
          <HelpButton className={ICON_BTN_CELL_NEUTRAL}>
            <IconQuestion />
          </HelpButton>
        }
      />
      <GameLogPanel
        lines={log.map((l) => l.text)}
        visible={logOpen}
        onClose={() => setLogOpen(false)}
      />
      {me !== null && (
        <PlayerHand
          cards={handSort.displayCards}
          legal={derived.legal}
          ledSuit={derived.ledSuit}
          // Hold-inactive: while a finished trick is held, taps queue your
          // lead instead of playing it under the hold. Auto-play-inactive:
          // the server is playing your turns (see useTableDerived).
          active={
            myTurn &&
            view.phase === 'playing' &&
            derived.heldBanner === null &&
            !derived.autoPiloted
          }
          onPlay={(card) => onAction({ type: 'play_card', card })}
          onReorder={handSort.setOrder}
          recommended={view.phase === 'playing' ? (derived.coach?.card ?? null) : null}
          queued={derived.queued}
          queueable={derived.queueable}
          onQueueToggle={(card) =>
            setQueued(derived.queued !== null && sameCard(card, derived.queued) ? null : card)
          }
        />
      )}
      {tutorial && <TutorialCoach />}
      {/* Real rooms (dev = App-mounted, never scenes/replay): the lite
          first-online-game card + the three make-or-break coach-marks. */}
      {!tutorial && online && dev && (
        <TutorialCoach
          online
          onEnableCoach={() => {
            saveCoachPref(true);
            setCoachOn(true);
          }}
        />
      )}
    </main>
  );
}
