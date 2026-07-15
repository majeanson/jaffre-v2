import type { Card } from '@jaffre/engine';
import { legalBidChoices, legalCards } from '@jaffre/engine';
import type { ClientAction } from '@jaffre/protocol';
import {
  BidPanel,
  Hand,
  ScoreStrip,
  Seat,
  TrickArea,
  type BidOption,
  type TrickPlayView,
} from '@jaffre/ui';
import { useEffect, useRef } from 'react';
import { toPosition, useGameStore } from '../state/gameStore.js';

export interface TableProps {
  readonly onAction: (action: ClientAction) => void;
  readonly onLeave: () => void;
}

const TRICK_HOLD_MS = 1600;
const SWEEP_MS = 600;

export function Table({ onAction, onLeave }: TableProps) {
  const { view, viewer, roster, log, sweepTo, heldTrick } = useGameStore();

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
  const trickBanner =
    heldTrick !== null
      ? `${
          heldTrick.winner === (me ?? -1)
            ? 'You take'
            : `${roster.seats[heldTrick.winner]?.name ?? 'Player'} takes`
        } the trick — ${heldTrick.points > 0 ? '+' : ''}${heldTrick.points} to Team ${heldTrick.winner % 2 === 0 ? 'A' : 'B'}`
      : null;

  const contractName =
    view.contract === null ? null : (roster.seats[view.contract.seat]?.name ?? 'Player');

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
    return (
      <Seat
        name={seat === me ? 'You' : info.name}
        team={(seat % 2) as 0 | 1}
        isTurn={view.turn === seat && view.phase !== 'game_over'}
        isDealer={view.dealer === seat}
        isBot={info.isBot}
        connected={info.connected}
        cardCount={view.handCounts[seat]}
      />
    );
  };

  return (
    <main className="table-felt flex min-h-screen flex-col items-center gap-3 p-4">
      <div className="flex w-full max-w-4xl items-center gap-3">
        <button
          onClick={onLeave}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-(--color-ivory)/80 hover:bg-white/8 cursor-pointer"
        >
          ← Leave
        </button>
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
                  }
                : null
            }
            trump={view.trump}
            trumpDecided={view.trumpDecided}
            roundPoints={view.roundPoints}
          />
        </div>
      </div>

      <div className="grid w-full max-w-4xl flex-1 grid-cols-[1fr_auto_1fr] items-center justify-items-center gap-2">
        <div className="col-span-3">{seatAt(2)}</div>
        {seatAt(1)}
        <div className="relative">
          <TrickArea plays={trickPlays} sweepTo={sweepTo} />
          {trickBanner !== null && (
            <p className="absolute -bottom-7 left-1/2 w-max -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-(--color-lamplight)">
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

      {view.phase === 'game_over' && (
        <div className="rounded-(--radius-panel) bg-(--color-felt-800) border border-(--color-accent)/40 px-8 py-5 text-center shadow-(--shadow-panel)">
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

      <GameLog lines={log.map((l) => l.text)} />
    </main>
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
        className="h-20 w-full max-w-4xl overflow-y-auto rounded-(--radius-panel) border border-white/8 bg-black/25 px-4 py-2 text-xs leading-5 text-(--color-ivory)/65"
      >
        {lines.slice(-40).map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </>
  );
}
