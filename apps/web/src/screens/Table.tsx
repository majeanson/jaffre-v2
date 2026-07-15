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

export function Table({ onAction, onLeave }: TableProps) {
  const { view, viewer, roster, log, sweepTo } = useGameStore();

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

  const trickPlays: TrickPlayView[] = view.currentTrick.map((p) => ({
    position: toPosition(p.seat, viewer),
    card: p.card,
  }));

  const contractName =
    view.contract === null ? null : (roster.seats[view.contract.seat]?.name ?? 'Player');

  const bidOptions: BidOption[] =
    view.phase === 'bidding'
      ? legalBidChoices(view.bids).flatMap((c) =>
          c.kind === 'bid' ? [{ value: c.value, sansAtout: c.sansAtout }] : [],
        )
      : [];

  return (
    <main className="table-felt flex min-h-screen flex-col items-center gap-3 p-4">
      <div className="flex w-full max-w-4xl items-center gap-3">
        <button
          onClick={onLeave}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-(--color-ivory)/80 hover:bg-white/8 cursor-pointer"
        >
          ← Leave
        </button>
        <div className="flex-1">
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
        {([2, 1, 3, 0] as const).map((position, i) => {
          const seat = me === null ? position : (((position + me) % 4) as 0 | 1 | 2 | 3);
          const info = roster.seats[seat];
          const el =
            info == null ? (
              <span key={position} className="text-sm text-(--color-ivory)/40">
                empty
              </span>
            ) : (
              <Seat
                key={position}
                name={seat === me ? 'You' : info.name}
                team={(seat % 2) as 0 | 1}
                isTurn={view.turn === seat && view.phase !== 'game_over'}
                isDealer={view.dealer === seat}
                isBot={info.isBot}
                connected={info.connected}
                cardCount={view.handCounts[seat]}
              />
            );
          // grid: row1 = top seat, row2 = left | trick | right, row3 = bottom
          if (i === 0)
            return (
              <div key="top" className="col-span-3">
                {el}
              </div>
            );
          if (i === 1) return el;
          if (i === 2) return el;
          return (
            <div key="bottom" className="col-span-3">
              {el}
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <TrickArea plays={trickPlays} sweepTo={sweepTo} />
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
        className="h-20 w-full max-w-4xl overflow-y-auto rounded-(--radius-panel) border border-white/8 bg-black/25 px-4 py-2 text-xs leading-5 text-(--color-ivory)/65"
      >
        {lines.slice(-40).map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </>
  );
}
