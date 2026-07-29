import { sameCard } from '@jaffre/engine';
import type { ClientAction } from '@jaffre/protocol';
import { useLang, type Lang } from '@jaffre/ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SceneUi } from '../dev/sceneManifest.js';
import { NoticeToast } from '../components/NoticeToast.js';
import { ShareButton } from '../components/ShareButton.js';
import { useGameStore } from '../state/gameStore.js';
import { RoomComms, toggleRoomComms } from '../comms/RoomComms.js';
import {
  BidOverlay,
  ConnectionBanner,
  FlightLayer,
  GameLogPanel,
  HandSortButton,
  Overlays,
  PlayerHand,
  Stage,
  TopBar,
  TutorialCoach,
  UtilityRow,
  WaitingScreen,
  hold,
  launchFlight,
  scoreTarget,
  useHandSort,
  useHeldDisplay,
  useQueuedPlay,
  useTableDerived,
  useTableKeys,
  useTrickHold,
  viewportCentreRect,
} from '../table/index.js';
import { loadCoachPref, saveCoachPref } from '../table/coachPref.js';
import { useDealRun } from '../table/dealPace.js';
import { HelpButton } from '../help/HelpButton.js';
import { IconButton, ICON_BTN_CELL_NEUTRAL } from '../components/IconButton.js';
import { IconQuestion, IconSeat } from '../components/icons.js';
import { TrumpCallout } from '../table/TrumpCallout.js';
import { TeachingGoal } from '../table/TeachingGoal.js';
import { TEAMS } from '../teams.js';
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
  /** Practice only: the seed in play, so a curated teaching deal can show
   * what it's here to teach. */
  readonly practiceSeed?: number | null;
  /** Spectators (online): back to the seat-takeover gate. Without it a
   * watcher whose choice now persists in the URL would have no way in. */
  readonly onTakeSeat?: () => void;
}

const TAKE_SEAT_T: Record<Lang, string> = {
  en: 'Take a seat',
  fr: 'Prendre un siège',
};

/**
 * Spectator-only utility cell: back to the seat-takeover gate. The testid is
 * deliberately NOT prefixed "take-seat-" — that prefix selects the Visitor
 * gate's per-seat buttons in the spectate spec.
 */
function TakeSeatButton({ onClick }: { readonly onClick: () => void }) {
  const label = TAKE_SEAT_T[useLang()];
  return (
    <IconButton plain data-testid="spectator-seat-gate" label={label} onClick={onClick}>
      <IconSeat />
    </IconButton>
  );
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
  practiceSeed = null,
  onTakeSeat,
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
  // The round-start deal, on one clock: deck fly-out, your hand filling a card
  // at a time, and the auction waiting until the cards have landed. A round
  // nothing has happened in yet, at mount, IS the game's first deal — real
  // play only (scenes and the replay viewer stage states mid-round).
  const freshRound =
    dev &&
    !noDealIntro &&
    derived !== null &&
    derived.view.phase === 'bidding' &&
    derived.view.bids.length === 0 &&
    derived.view.currentTrick.length === 0;
  const deal = useDealRun(derived?.view.roundIndex ?? null, freshRound);
  useTrickHold(frozenHold);
  useQueuedPlay(onAction);
  // Keyboard play: 1–8 cards, 1–6 + P in the auction, L log, C chat.
  useTableKeys({
    onAction,
    cards: handSort.displayCards,
    legal: derived?.legal ?? [],
    queueable: derived?.queueable ?? [],
    queued: derived?.queued ?? null,
    setQueued,
    bidOptions: derived?.bidOptions ?? [],
    myTurn: derived?.myTurn ?? false,
    phase: derived?.view.phase ?? '',
    onToggleLog: () => setLogOpen((o) => !o),
    ...(online ? { onToggleChat: toggleRoomComms } : {}),
  });
  // Screen stays awake at the table — thinking through a bid isn't idle time.
  useWakeLock();
  // Leaving the table (or the room) always tears the voice mesh down.
  useEffect(() => (online ? () => leaveVoice() : undefined), [online]);

  // Delivery 3 (see docs/archive/PLAN-scoreboard-delivery.md): the
  // contract-won flight. A
  // sentinel `undefined` baseline (as opposed to `null`) means "haven't
  // observed a view yet" — so a page reload landing mid-round, contract
  // already decided, seeds the baseline as already-set and never fires; only
  // a genuine null→set transition witnessed live does.
  const prevContractSeatRef = useRef<number | null | undefined>(undefined);
  useLayoutEffect(() => {
    const liveView = derived?.view ?? null;
    if (liveView === null) return;
    const seat = liveView.contract?.seat ?? null;
    const prev = prevContractSeatRef.current;
    if (prev !== undefined && prev === null && seat !== null) {
      hold('contract');
      const viewerSeat = derived?.me ?? null;
      const position = viewerSeat === null ? seat : (seat - viewerSeat + 4) % 4;
      const source = document.querySelector(`[data-deal-target="${String(position)}"]`);
      const contract = liveView.contract;
      launchFlight({
        from: source ?? viewportCentreRect(),
        to: 'contract',
        key: 'contract',
        payload: (
          <span className="grid place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.6em] py-[0.2em] font-arcade-display text-[1.1em] text-(--color-ap-text) shadow-(--shadow-ap-sm)">
            {contract?.value}
            {contract?.sansAtout === true ? ' SA' : ''}
          </span>
        ),
      });
    }
    prevContractSeatRef.current = seat;
  }, [derived]);

  // Delivery 5: the round-total flight. Same sentinel-baseline idea as the
  // contract watcher above, but with `null` (no valid scores tuple yet) doing
  // that job — a genuine change from ANY previously-observed scores fires,
  // so a mid-game reload's first real round still gets its flight.
  const prevScoresRef = useRef<readonly [number, number] | null>(null);
  useLayoutEffect(() => {
    const scores = derived?.view.scores ?? null;
    const prev = prevScoresRef.current;
    if (scores !== null && prev !== null) {
      for (const team of [0, 1] as const) {
        const delta = scores[team] - prev[team];
        if (delta === 0) continue;
        const key = scoreTarget(team);
        hold(key);
        launchFlight({
          from: viewportCentreRect(),
          to: key,
          key,
          payload: (
            <span
              className="rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-[0.5em] py-[0.15em] font-arcade-display text-[1.3em] shadow-(--shadow-ap-sm)"
              style={{ color: TEAMS[team].color }}
            >
              {delta > 0 ? '+' : ''}
              {delta}
            </span>
          ),
        });
      }
    }
    prevScoresRef.current = scores;
  }, [derived]);

  // The bar's displayed scores/trick-counts/trump/contract/specials lag their
  // real values until the flight carrying each change lands (see flight.tsx).
  // MUST be called AFTER the two watcher effects above: useHeldDisplay's
  // previous-value capture runs in effect call order, and every hold has to
  // land before the capture does — that ordering contract is the whole
  // wait-for-landing model. Everything else below keeps reading `derived`
  // directly, unmasked.
  const heldDisplay = useHeldDisplay(
    derived?.view ?? null,
    derived?.trickCounts ?? [0, 0],
    derived?.contractDisplay ?? null,
    derived?.teamSpecials ?? [
      { red: false, brown: false },
      { red: false, brown: false },
    ],
  );

  if (derived === null) return <WaitingScreen />;
  const { view, roster, me, myTurn, seatInfo } = derived;

  return (
    <main
      className={`table-felt flex h-full flex-col items-center overflow-hidden p-3 max-sm:p-2 ${
        bottomInset ? 'pb-20 max-sm:pb-16' : 'pb-0 max-sm:pb-0'
      }`}
    >
      {online && <ConnectionBanner />}
      {/* Real play only: the scoreboard-delivery flight clones render here.
          No layer in scenes/replay means every launchFlight call there is a
          no-op that lands instantly (see flight.ts) — this mount IS the
          entire scenes/replay story, nothing else has to know about it. */}
      {dev && <FlightLayer />}
      <NoticeToast />
      <TopBar
        view={heldDisplay.view ?? view}
        contract={heldDisplay.contract}
        rounds={derived.scoreboardRounds}
        names={roster.seats.map((s) => s?.name ?? '—')}
        trickCounts={heldDisplay.trickCounts}
        specials={heldDisplay.specials}
        action={derived.headerAction}
        myTeam={me !== null ? ((me % 2) as 0 | 1) : null}
        onLeave={onLeave}
        onLeaveTable={onLeaveTable}
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
      <TeachingGoal seed={practiceSeed} />
      <Stage
        trickPlays={derived.trickPlays}
        sweepTo={derived.sweepTo}
        banner={derived.heldBanner}
        winnerPosition={derived.winnerPosition}
        seatInfo={seatInfo}
        dealKey={deal.dealKey}
        coachTip={derived.coach?.tip ?? null}
        capHeight={me === null}
        noDealIntro={noDealIntro}
        // Real play only (dev = App-mounted): scenes and replay stage
        // mid-round states where the fanfare would be noise in every shot.
        announcement={dev ? <TrumpCallout /> : undefined}
        bidOverlay={
          // The auction opens once the cards are in front of you, not over the
          // deal — you can't size up a hand you haven't been given yet.
          view.phase === 'bidding' &&
          !deal.dealing && (
            <BidOverlay
              options={derived.bidOptions}
              order={derived.auctionOrder}
              onAction={onAction}
              recommended={derived.coach?.bid ?? null}
              coachTip={derived.coach?.tip ?? null}
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
        takeSeat={
          me === null && onTakeSeat !== undefined && <TakeSeatButton onClick={onTakeSeat} />
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
          dealKey={deal.dealKey}
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
