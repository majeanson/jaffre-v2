import { AvatarChip, Cta } from '@jaffre/ui';
import type { RosterSeat } from '@jaffre/protocol';
import { useGameStore } from '../state/gameStore.js';

export interface VisitorProps {
  readonly code: string;
  readonly onSit: (seat: 0 | 1 | 2 | 3) => void;
  readonly onWatch: () => void;
  readonly onLeave: () => void;
}

const SEATS = [0, 1, 2, 3] as const;

/** Seats 0 & 2 are Team Sun, 1 & 3 Team Moon — the felt-table pairing. */
function teamOf(seat: number): { name: string; color: string } {
  return seat % 2 === 0
    ? { name: 'Team Sun', color: 'var(--color-team-a)' }
    : { name: 'Team Moon', color: 'var(--color-team-b)' };
}

/**
 * Landing page for a spectator arriving at a room already in progress. Wears
 * the Refined Arcade Violet shell: a mini four-seat table diagram (who's here,
 * humans vs bots by label — never emoji) that reads at a glance, plus one-tap
 * actions to take over a bot's seat, keep watching, or leave.
 */
export function Visitor({ code, onSit, onWatch, onLeave }: VisitorProps) {
  const { roster, view } = useGameStore();
  const scores = view?.scores;
  // Whoever is first seated and human "owns" this table — the landing greets a
  // visitor by name, falling back to the raw room code.
  const host = roster?.seats.find((s): s is RosterSeat => s !== null && !s.isBot);
  const title = host !== undefined ? `${host.name}’s table` : `Room ${code}`;

  // One seat cell of the diagram: chip + name + a text label (team, and "Bot"
  // / "Away" tags) so nothing rides on colour alone.
  const seatCell = (seat: number) => {
    const info = roster?.seats[seat] ?? null;
    const team = teamOf(seat);
    const tags =
      info === null
        ? 'Open'
        : [info.isBot ? 'Bot' : null, team.name, info.connected ? null : 'Away']
            .filter((t): t is string => t !== null)
            .join(' · ');
    return (
      <div
        data-testid={`visitor-seat-${seat}`}
        className="flex flex-col items-center gap-1 text-center"
      >
        <AvatarChip name={info?.name ?? 'Open seat'} />
        <span className="max-w-[7rem] truncate font-arcade-ui text-[0.9em] font-semibold text-(--color-ap-text)">
          {info?.name ?? 'Open seat'}
        </span>
        <span className="font-arcade-ui text-[0.72em] font-semibold uppercase tracking-wide text-(--color-ap-muted)">
          {tags}
        </span>
      </div>
    );
  };

  const botSeats = SEATS.filter((seat) => roster?.seats[seat]?.isBot === true);

  return (
    <main className="grid min-h-screen place-items-center bg-(--color-ap-ground) p-6 font-arcade-ui text-(--color-ap-text)">
      <div className="flex w-full max-w-md flex-col gap-6">
        <header className="text-center">
          <h1 className="font-arcade-display text-[2.4em] leading-none text-(--color-ap-gold)">
            {title}
          </h1>
          <p className="mt-2 font-arcade-ui text-[0.95em] text-(--color-ap-muted)">
            Game in progress — take a seat or just watch.
          </p>
        </header>

        {/* Mini four-seat table: partners sit across, the way the felt does. */}
        <div
          role="group"
          aria-label="Who's at the table"
          className="mx-auto grid aspect-square w-full max-w-[19rem] grid-cols-3 grid-rows-3 items-center gap-2"
        >
          <div className="col-start-2 row-start-1">{seatCell(2)}</div>
          <div className="col-start-1 row-start-2">{seatCell(1)}</div>
          <div className="col-start-2 row-start-2 grid place-items-center">
            <div className="grid aspect-square w-full place-items-center rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-2 text-center shadow-(--shadow-ap-sm)">
              {scores !== undefined ? (
                <div className="font-arcade-display leading-tight tabular-nums">
                  <div className="text-[0.6em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
                    Score
                  </div>
                  <div className="mt-0.5 text-[1.3em]">
                    <span style={{ color: 'var(--color-team-a)' }}>{scores[0]}</span>
                    <span className="mx-1 text-(--color-ap-muted)">-</span>
                    <span style={{ color: 'var(--color-team-b)' }}>{scores[1]}</span>
                  </div>
                </div>
              ) : (
                <span className="font-arcade-display text-[0.9em] uppercase tracking-wide text-(--color-ap-muted)">
                  In play
                </span>
              )}
            </div>
          </div>
          <div className="col-start-3 row-start-2">{seatCell(3)}</div>
          <div className="col-start-2 row-start-3">{seatCell(0)}</div>
        </div>

        {scores !== undefined && (
          <p className="text-center font-arcade-ui text-[0.85em] text-(--color-ap-muted)">
            <span style={{ color: 'var(--color-team-a)' }}>Team Sun {scores[0]}</span>
            <span className="mx-2 text-(--color-ap-muted)">vs</span>
            <span style={{ color: 'var(--color-team-b)' }}>Team Moon {scores[1]}</span>
          </p>
        )}

        <div className="flex flex-col gap-3">
          {botSeats.map((seat) => {
            const info = roster?.seats[seat];
            if (info === undefined || info === null) return null;
            return (
              <Cta
                key={seat}
                type="button"
                data-testid={`take-seat-${seat}`}
                onClick={() => onSit(seat)}
                className="w-full"
              >
                Take {info.name}&rsquo;s seat
              </Cta>
            );
          })}
          <Cta type="button" variant="secondary" onClick={onWatch} className="w-full">
            Just watch
          </Cta>
          <Cta type="button" variant="secondary" onClick={onLeave} className="w-full">
            Leave
          </Cta>
        </div>
      </div>
    </main>
  );
}
