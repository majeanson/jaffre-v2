import type { Viewer } from '@jaffre/engine';
import type { BotDifficulty, Roster } from '@jaffre/protocol';
import { Seat } from '@jaffre/ui';
import { GHOST_BTN } from '../components/buttonStyles.js';

export interface SeatPickerProps {
  readonly roster: Roster | null;
  readonly viewer: Viewer | null;
  readonly onSit: (seat: 0 | 1 | 2 | 3) => void;
  readonly onAddBot: (seat: 0 | 1 | 2 | 3, difficulty: BotDifficulty) => void;
}

const DIFFICULTY_ORDER: readonly BotDifficulty[] = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABEL: Record<BotDifficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

function nextDifficulty(current: BotDifficulty): BotDifficulty {
  const i = DIFFICULTY_ORDER.indexOf(current);
  return DIFFICULTY_ORDER[(i + 1) % DIFFICULTY_ORDER.length] as BotDifficulty;
}

/** Owns the lobby seat rows: who sits where, with sit-here / add-bot actions
 * and a per-bot difficulty toggle (Easy → Normal → Hard) before the game starts. */
export function SeatPicker({ roster, viewer, onSit, onAddBot }: SeatPickerProps) {
  const seated = viewer !== null && viewer !== 'spectator';
  const started = roster?.started ?? false;
  return (
    <div className="flex flex-col gap-2.5">
      {([0, 1, 2, 3] as const).map((seat) => {
        const info = roster?.seats[seat] ?? null;
        const difficulty = info?.difficulty ?? 'normal';
        return (
          <div key={seat} data-testid={`seat-row-${seat}`} className="flex items-center gap-3">
            <span className="w-16 text-right text-xs text-(--color-ivory)/45">
              Seat {seat + 1} · {seat % 2 === 0 ? 'Team Sun' : 'Team Moon'}
            </span>
            {info !== null ? (
              <span className="flex items-center gap-2">
                <Seat
                  name={seat === viewer ? 'You' : info.name}
                  team={(seat % 2) as 0 | 1}
                  isBot={info.isBot}
                  connected={info.connected}
                />
                {info.isBot && !started && (
                  <button
                    data-testid={`bot-difficulty-${seat}`}
                    onClick={() => onAddBot(seat, nextDifficulty(difficulty))}
                    title="Tap to change bot difficulty"
                    className={`px-2 py-1 text-xs text-(--color-ivory)/70 ${GHOST_BTN}`}
                  >
                    {DIFFICULTY_LABEL[difficulty]}
                  </button>
                )}
              </span>
            ) : (
              <span className="flex gap-2">
                <button
                  onClick={() => onSit(seat)}
                  disabled={started}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    started
                      ? 'border-white/8 text-(--color-ivory)/30'
                      : 'border-(--color-accent)/50 text-(--color-lamplight) hover:bg-(--color-accent)/10 cursor-pointer'
                  }`}
                >
                  {seated ? 'Move here' : 'Sit here'}
                </button>
                <button
                  onClick={() => onAddBot(seat, 'normal')}
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
