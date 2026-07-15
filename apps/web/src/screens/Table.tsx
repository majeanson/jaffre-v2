import type { Card, SeatView } from '@jaffre/engine';
import { legalBidChoices, legalCards } from '@jaffre/engine';
import type { ClientAction } from '@jaffre/protocol';
import {
  BidPanel,
  ChatPanel,
  Hand,
  PlayingCard,
  ScoreStrip,
  Seat,
  TrickArea,
  VoiceBar,
  type BidOption,
  type TrickPlayView,
  type VoicePeerChip,
} from '@jaffre/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeSwitcher } from '../components/ThemeSwitcher.js';
import { send } from '../net/socket.js';
import { toPosition, useGameStore } from '../state/gameStore.js';
import { useVoiceStore } from '../state/voiceStore.js';
import { joinVoice, leaveVoice, toggleMute } from '../voice/rtc.js';

export interface TableProps {
  readonly onAction: (action: ClientAction) => void;
  readonly onLeave: () => void;
  /** True in a room (chat + voice); false in practice mode (bots don't chat). */
  readonly online?: boolean;
}

/** Client-side chat throttle: ~1 msg/sec, rejected sends show "slow down". */
export function useChatSend(): (text: string) => boolean {
  const lastAt = useRef(0);
  return useCallback((text: string) => {
    const now = Date.now();
    if (now - lastAt.current < 1000) return false;
    lastAt.current = now;
    send({ t: 'chat', text });
    return true;
  }, []);
}

const TRICK_HOLD_MS = 1600;
const SWEEP_MS = 600;

export function Table({ onAction, onLeave, online = false }: TableProps) {
  const { view, viewer, roster, log, sweepTo, heldTrick, chat } = useGameStore();
  const voice = useVoiceStore();
  const sendChat = useChatSend();

  // Leaving the table (or the room) always tears the voice mesh down.
  useEffect(() => (online ? () => leaveVoice() : undefined), [online]);

  // Hold a finished trick on the table, then sweep it toward the winner.
  useEffect(() => {
    if (heldTrick === null) return undefined;
    const store = useGameStore.getState();
    const t1 = setTimeout(
      () => store.setSweep(toPosition(heldTrick.winner, store.viewer)),
      TRICK_HOLD_MS,
    );
    const t2 = setTimeout(() => store.clearHeldTrick(), TRICK_HOLD_MS + SWEEP_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [heldTrick]);

  if (view === null || roster === null) {
    return (
      <main className="table-felt grid min-h-screen place-items-center">
        <p className="animate-pulse text-(--color-ivory)/70">Waiting for the game…</p>
      </main>
    );
  }

  const me = viewer === 'spectator' || viewer === null ? null : viewer;
  const myTurn = me !== null && view.turn === me && view.phase !== 'game_over';
  const ledSuit = view.currentTrick[0]?.card.suit ?? null;
  const legal =
    me !== null && view.phase === 'playing' && myTurn ? legalCards(view.hand, ledSuit) : [];

  // While a finished trick is held, show it instead of the (already empty)
  // live trick so players see all four cards and the points.
  const shownTrick = heldTrick?.plays ?? view.currentTrick;
  const trickPlays: TrickPlayView[] = shownTrick.map((p) => ({
    position: toPosition(p.seat, viewer),
    card: p.card,
  }));
  const specialTags =
    heldTrick?.specials.map((s) => (s === 'red_zero' ? 'RED 0 +5!' : 'BROWN 0 −2!')).join(' ') ??
    '';
  const trickBanner =
    heldTrick !== null
      ? `${
          heldTrick.winner === (me ?? -1)
            ? 'You take'
            : `${roster.seats[heldTrick.winner]?.name ?? 'Player'} takes`
        } the trick — ${heldTrick.points > 0 ? '+' : ''}${heldTrick.points} to Team ${heldTrick.winner % 2 === 0 ? 'A' : 'B'}${specialTags ? ` · ${specialTags}` : ''}`
      : null;

  /** A seat's auction declaration, shown as a bubble until the round ends. */
  const bidTextFor = (seat: number): string | null => {
    const entry = view.bids.find((b) => b.seat === seat);
    if (entry === undefined) return null;
    if (entry.choice.kind === 'pass') return 'Pass';
    return `${entry.choice.value}${entry.choice.sansAtout ? ' SA' : ''}`;
  };

  const lastTrick = view.capturedTricks[view.capturedTricks.length - 1];

  const contractName =
    view.contract === null ? null : (roster.seats[view.contract.seat]?.name ?? 'Player');

  const voicePeers: VoicePeerChip[] =
    online && me !== null
      ? roster.seats.flatMap((s, i) => {
          if (s === null || s.isBot || i === me) return [];
          const p = voice.peers[i];
          return [
            {
              name: s.name,
              connected: p?.connected ?? false,
              muted: p?.muted ?? false,
              speaking: p?.speaking ?? false,
            },
          ];
        })
      : [];

  const bidOptions: BidOption[] =
    view.phase === 'bidding'
      ? legalBidChoices(view.bids).flatMap((c) =>
          c.kind === 'bid' ? [{ value: c.value, sansAtout: c.sansAtout }] : [],
        )
      : [];

  /** Render the seat occupying a table-relative position (0 = you/bottom). */
  const seatAt = (position: 0 | 1 | 2 | 3) => {
    const seat = me === null ? position : (((position + me) % 4) as 0 | 1 | 2 | 3);
    const info = roster.seats[seat];
    if (info == null) return <span className="text-sm text-(--color-ivory)/40">empty</span>;
    const bid = bidTextFor(seat);
    return (
      <span className="relative inline-block max-w-full min-w-0">
        <Seat
          name={seat === me ? 'You' : info.name}
          team={(seat % 2) as 0 | 1}
          isTurn={view.turn === seat && view.phase !== 'game_over'}
          isDealer={view.dealer === seat}
          isBot={info.isBot}
          connected={info.connected}
          cardCount={view.handCounts[seat]}
        />
        {bid !== null && (
          <span
            className={`absolute -top-3 -right-2 rounded-full px-2 py-0.5 text-[11px] font-bold shadow ${
              view.contract?.seat === seat
                ? 'bg-(--color-lamplight) text-(--color-felt-950)'
                : 'bg-black/70 text-(--color-ivory)/80'
            }`}
          >
            {bid}
          </span>
        )}
      </span>
    );
  };

  return (
    <main className="table-felt flex min-h-screen flex-col items-center gap-3 overflow-x-clip p-4 max-sm:gap-2 max-sm:p-2">
      <div className="flex w-full max-w-4xl items-center gap-3 max-sm:gap-2">
        <button
          onClick={onLeave}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-(--color-ivory)/80 hover:bg-white/8 cursor-pointer"
        >
          ← Leave
        </button>
        <ThemeSwitcher />
        <div className="flex-1" data-testid="score-strip">
          <ScoreStrip
            teamNames={['Team A', 'Team B']}
            scores={view.scores}
            target={41}
            contract={
              view.contract !== null && contractName !== null
                ? {
                    playerName: contractName,
                    value: view.contract.value,
                    sansAtout: view.contract.sansAtout,
                    progress: view.roundPoints[view.contract.seat % 2] ?? 0,
                  }
                : null
            }
            trump={view.trump}
            trumpDecided={view.trumpDecided}
            roundPoints={view.roundPoints}
            trickCounts={[
              view.capturedTricks.filter((t) => t.winner % 2 === 0).length,
              view.capturedTricks.filter((t) => t.winner % 2 === 1).length,
            ]}
          />
        </div>
      </div>

      <div className="grid w-full max-w-4xl flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center justify-items-center gap-2">
        <div className="col-span-3">{seatAt(2)}</div>
        {seatAt(1)}
        <div className="relative">
          <TrickArea plays={trickPlays} sweepTo={sweepTo} />
          {trickBanner !== null && (
            <p
              className={`absolute -bottom-7 left-1/2 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-center text-xs font-semibold text-(--color-lamplight) ${
                specialTags ? 'special-burst' : 'pop-in'
              }`}
            >
              {trickBanner}
            </p>
          )}
        </div>
        {seatAt(3)}
        <div className="col-span-3">{seatAt(0)}</div>
      </div>

      {view.phase === 'bidding' && myTurn && (
        <BidPanel
          options={bidOptions}
          onPass={() => onAction({ type: 'place_bid', choice: { kind: 'pass' } })}
          onBid={(o) =>
            onAction({
              type: 'place_bid',
              choice: { kind: 'bid', value: o.value, sansAtout: o.sansAtout },
            })
          }
        />
      )}

      {view.phase === 'round_over' && view.lastRoundSummary !== null && (
        <RoundSummaryOverlay
          summary={view.lastRoundSummary}
          contractName={roster.seats[view.lastRoundSummary.contract.seat]?.name ?? 'Player'}
        />
      )}

      {view.phase === 'game_over' && (
        <div className="pop-in relative rounded-(--radius-panel) bg-(--color-felt-800) border border-(--color-accent)/40 px-8 py-5 text-center shadow-(--shadow-panel)">
          <Confetti />
          <p className="font-display text-2xl text-(--color-lamplight)">
            {view.winner === 0 ? 'Team A wins!' : 'Team B wins!'}
          </p>
          <p className="mt-1 text-sm text-(--color-ivory)/70 tabular-nums">
            {view.scores[0]} — {view.scores[1]}
          </p>
        </div>
      )}

      {me !== null && (
        <Hand
          active={myTurn && view.phase === 'playing'}
          cards={view.hand.map((card) => ({
            card,
            disabled:
              view.phase !== 'playing' ||
              !myTurn ||
              !legal.some((c) => c.suit === card.suit && c.value === card.value),
            disabledReason:
              ledSuit !== null && card.suit !== ledSuit
                ? `You must follow ${ledSuit}`
                : 'Not your turn',
          }))}
          onPlay={(card) => onAction({ type: 'play_card', card: card as Card })}
        />
      )}

      <div className="flex w-full max-w-4xl items-start gap-2">
        {lastTrick !== undefined && view.phase === 'playing' && (
          <LastTrickPeek
            cards={lastTrick.cards}
            winnerName={roster.seats[lastTrick.winner]?.name ?? 'Player'}
            points={lastTrick.points}
          />
        )}
        <div className="flex-1">
          <GameLog lines={log.map((l) => l.text)} />
        </div>
        {online && me !== null && (
          <VoiceBar
            status={voice.status}
            {...(voice.error !== null ? { errorMessage: voice.error } : {})}
            peers={voicePeers}
            muted={voice.muted}
            speaking={voice.speaking}
            onJoin={() => void joinVoice()}
            onLeave={leaveVoice}
            onToggleMute={toggleMute}
          />
        )}
        {online && <ChatPanel collapsible entries={chat} onSend={sendChat} />}
      </div>
    </main>
  );
}

/**
 * Round-end scoreboard, shown while the table pauses between rounds. It is
 * announced as a modal dialog and takes focus on mount so screen readers land
 * on it, then hands focus back when it auto-dismisses. It never traps focus:
 * there is nothing to interact with and it closes on its own.
 */
function RoundSummaryOverlay({
  summary,
  contractName,
}: {
  summary: NonNullable<SeatView['lastRoundSummary']>;
  contractName: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, []);
  const team = summary.contract.seat % 2 === 0 ? 'Team A' : 'Team B';
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="fixed inset-0 z-40 grid place-items-center bg-black/50 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Round summary"
    >
      <div className="w-80 rounded-(--radius-panel) border border-(--color-accent)/40 bg-(--color-felt-800) p-6 text-center shadow-(--shadow-panel)">
        <p className="font-display text-xl text-(--color-lamplight)">
          Round {summary.roundIndex + 1}
        </p>
        <p className="mt-2 text-(--color-ivory)">
          {contractName} ({team}) {summary.contractMade ? 'MADE' : 'FAILED'}{' '}
          {summary.contract.value}
          {summary.contract.sansAtout ? ' sans atout' : ''}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm tabular-nums">
          {([0, 1] as const).map((t) => (
            <div key={t} className="rounded-lg bg-black/25 p-2">
              <p className="text-(--color-ivory)/60">Team {t === 0 ? 'A' : 'B'}</p>
              <p className="text-(--color-ivory)/80">{summary.trickPoints[t]} trick pts</p>
              <p
                className={
                  (summary.deltas[t] ?? 0) >= 0 ? 'text-(--color-ok)' : 'text-(--color-danger)'
                }
              >
                {(summary.deltas[t] ?? 0) >= 0 ? '+' : ''}
                {summary.deltas[t]}
              </p>
              <p className="font-display text-lg text-(--color-ivory)">{summary.scores[t]}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-(--color-ivory)/70">Next round starting…</p>
      </div>
    </div>
  );
}

/** Click reveal of the previous trick. Closes on Escape or an outside click. */
function LastTrickPeek({
  cards,
  winnerName,
  points,
}: {
  cards: readonly Card[];
  winnerName: string;
  points: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-lg border border-white/15 px-3 py-2 text-xs text-(--color-ivory)/75 hover:bg-white/8 cursor-pointer"
      >
        Last trick
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 flex flex-col gap-1.5 rounded-(--radius-panel) border border-white/10 bg-(--color-felt-800) p-3 shadow-(--shadow-panel)">
          <div className="flex gap-1.5">
            {cards.map((card) => (
              <PlayingCard key={`${card.suit}-${card.value}`} card={card} size="sm" />
            ))}
          </div>
          <p className="text-[11px] text-(--color-ivory)/65 whitespace-nowrap">
            {winnerName} · {points > 0 ? '+' : ''}
            {points} pt{Math.abs(points) === 1 ? '' : 's'}
          </p>
        </div>
      )}
    </div>
  );
}

const CONFETTI_COLORS = [
  'var(--color-suit-red)',
  'var(--color-suit-green)',
  'var(--color-suit-blue)',
  'var(--color-lamplight)',
];

/** A dozen falling pieces over the winner card. CSS-only; reduced-motion hides the fall. */
function Confetti() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-2 block">
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece absolute block h-2.5 w-1.5 rounded-xs"
          style={{
            left: `${5 + i * 8}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 5) * 120}ms`,
          }}
        />
      ))}
    </span>
  );
}

/** Visible history + the screen-reader announcer, fed by the same sentences. */
function GameLog({ lines }: { lines: readonly string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length]);
  const latest = lines[lines.length - 1] ?? '';
  return (
    <>
      <div aria-live="polite" className="sr-only">
        {latest}
      </div>
      <div
        ref={ref}
        data-testid="game-log"
        role="region"
        aria-label="Game log"
        tabIndex={0}
        className="h-20 w-full max-w-4xl overflow-y-auto rounded-(--radius-panel) border border-white/8 bg-black/25 px-4 py-2 text-xs leading-5 text-(--color-ivory)/65"
      >
        {lines.slice(-40).map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </>
  );
}
