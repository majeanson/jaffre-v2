import { Seat } from '@jaffre/ui';
import { GHOST_BTN } from '../components/buttonStyles.js';
import { useGameStore } from '../state/gameStore.js';

export interface VisitorProps {
  readonly code: string;
  readonly onSit: (seat: 0 | 1 | 2 | 3) => void;
  readonly onWatch: () => void;
  readonly onLeave: () => void;
}

/**
 * Landing page for a spectator arriving at a room already in progress: a
 * glance at the table (who's seated, the score) plus one-tap actions to take
 * over a bot's seat or simply keep watching.
 */
export function Visitor({ code, onSit, onWatch, onLeave }: VisitorProps) {
  const { roster, view } = useGameStore();
  const scores = view?.scores;

  return (
    <main className="table-felt grid min-h-screen place-items-center p-6">
      <div className="flex w-full max-w-md flex-col gap-5">
        <header className="text-center">
          <h1 className="font-display text-3xl text-(--color-lamplight)">Room {code}</h1>
          <p className="mt-1 text-sm text-(--color-ivory)/55">
            Game in progress — jump in or watch.
          </p>
        </header>

        {scores !== undefined && (
          <div className="flex items-center justify-center gap-6 rounded-(--radius-panel) bg-(--color-felt-800)/80 px-4 py-2.5 shadow-(--shadow-panel)">
            <span className="text-sm text-(--color-team-a)">Team Sun {scores[0]}</span>
            <span className="text-sm text-(--color-ivory)/30">·</span>
            <span className="text-sm text-(--color-team-b)">Team Moon {scores[1]}</span>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {([0, 1, 2, 3] as const).map((seat) => {
            const info = roster?.seats[seat] ?? null;
            if (info === null) return null;
            return (
              <div
                key={seat}
                data-testid={`visitor-seat-${seat}`}
                className="flex items-center gap-3"
              >
                <span className="w-16 text-right text-xs text-(--color-ivory)/45">
                  Seat {seat + 1} · {seat % 2 === 0 ? 'Team Sun' : 'Team Moon'}
                </span>
                <Seat
                  name={info.name}
                  team={(seat % 2) as 0 | 1}
                  isBot={info.isBot}
                  connected={info.connected}
                />
                {info.isBot && (
                  <button
                    data-testid={`take-seat-${seat}`}
                    onClick={() => onSit(seat)}
                    className="rounded-lg border border-(--color-accent)/50 px-3 py-2 text-sm text-(--color-lamplight) hover:bg-(--color-accent)/10 cursor-pointer"
                  >
                    Take {info.name}&rsquo;s seat
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={onWatch}
          className={`rounded-(--radius-panel) px-4 py-3.5 font-semibold text-(--color-ivory)/85 ${GHOST_BTN}`}
        >
          Watch
        </button>

        <div className="flex items-center justify-center">
          <button
            onClick={onLeave}
            className="text-sm text-(--color-ivory)/50 hover:text-(--color-ivory)/80 cursor-pointer"
          >
            ← Back home
          </button>
        </div>
      </div>
    </main>
  );
}
