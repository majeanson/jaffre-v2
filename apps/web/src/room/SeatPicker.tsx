import type { Viewer } from '@jaffre/engine';
import type { Roster } from '@jaffre/protocol';
import { Seat } from '@jaffre/ui';
import { GHOST_BTN } from '../components/buttonStyles.js';

export interface SeatPickerProps {
  readonly roster: Roster | null;
  readonly viewer: Viewer | null;
  readonly onSit: (seat: 0 | 1 | 2 | 3) => void;
  readonly onAddBot: (seat: 0 | 1 | 2 | 3) => void;
}

/** Owns the lobby seat rows: who sits where, with sit-here / add-bot actions. */
export function SeatPicker({ roster, viewer, onSit, onAddBot }: SeatPickerProps) {
  const seated = viewer !== null && viewer !== 'spectator';
  return (
    <div className="flex flex-col gap-2.5">
      {([0, 1, 2, 3] as const).map((seat) => {
        const info = roster?.seats[seat] ?? null;
        return (
          <div key={seat} data-testid={`seat-row-${seat}`} className="flex items-center gap-3">
            <span className="w-16 text-right text-xs text-(--color-ivory)/45">
              Seat {seat + 1} · Team {seat % 2 === 0 ? 'A' : 'B'}
            </span>
            {info !== null ? (
              <Seat
                name={seat === viewer ? 'You' : info.name}
                team={(seat % 2) as 0 | 1}
                isBot={info.isBot}
                connected={info.connected}
              />
            ) : (
              <span className="flex gap-2">
                <button
                  onClick={() => onSit(seat)}
                  disabled={seated}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    seated
                      ? 'border-white/8 text-(--color-ivory)/30'
                      : 'border-(--color-accent)/50 text-(--color-lamplight) hover:bg-(--color-accent)/10 cursor-pointer'
                  }`}
                >
                  Sit here
                </button>
                <button
                  onClick={() => onAddBot(seat)}
                  className={`px-3 py-2 text-sm text-(--color-ivory)/75 ${GHOST_BTN}`}
                >
                  Add bot
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
