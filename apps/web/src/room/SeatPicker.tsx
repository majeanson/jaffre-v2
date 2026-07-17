import type { Viewer } from '@jaffre/engine';
import type { BotDifficulty, Roster } from '@jaffre/protocol';
import { Seat, useLang, type Lang } from '@jaffre/ui';
import { GHOST_BTN } from '../components/buttonStyles.js';

export interface SeatPickerProps {
  readonly roster: Roster | null;
  readonly viewer: Viewer | null;
  readonly onSit: (seat: 0 | 1 | 2 | 3) => void;
  readonly onAddBot: (seat: 0 | 1 | 2 | 3, difficulty: BotDifficulty) => void;
}

const DIFFICULTY_ORDER: readonly BotDifficulty[] = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABEL: Record<Lang, Record<BotDifficulty, string>> = {
  en: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },
  fr: { easy: 'Facile', normal: 'Normal', hard: 'Difficile' },
};

const T: Record<
  Lang,
  {
    seatTeam: (n: number, team: string) => string;
    teamSun: string;
    teamMoon: string;
    you: string;
    cycleBot: string;
    moveHere: string;
    sitHere: string;
    addBot: string;
  }
> = {
  en: {
    seatTeam: (n, team) => `Seat ${String(n)} · ${team}`,
    teamSun: 'Team Sun',
    teamMoon: 'Team Moon',
    you: 'You',
    cycleBot: 'Tap to change bot difficulty',
    moveHere: 'Move here',
    sitHere: 'Sit here',
    addBot: 'Add bot',
  },
  fr: {
    seatTeam: (n, team) => `Siège ${String(n)} · ${team}`,
    teamSun: 'Équipe Soleil',
    teamMoon: 'Équipe Lune',
    you: 'Toi',
    cycleBot: 'Touche pour changer la difficulté du bot',
    moveHere: 'Déplace-toi ici',
    sitHere: 'Assis-toi ici',
    addBot: 'Ajouter un bot',
  },
};

function nextDifficulty(current: BotDifficulty): BotDifficulty {
  const i = DIFFICULTY_ORDER.indexOf(current);
  return DIFFICULTY_ORDER[(i + 1) % DIFFICULTY_ORDER.length] as BotDifficulty;
}

/** Owns the lobby seat rows: who sits where, with sit-here / add-bot actions
 * and a per-bot difficulty toggle (Easy → Normal → Hard) before the game starts. */
export function SeatPicker({ roster, viewer, onSit, onAddBot }: SeatPickerProps) {
  const lang = useLang();
  const t = T[lang];
  const difficultyLabel = DIFFICULTY_LABEL[lang];
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
              {t.seatTeam(seat + 1, seat % 2 === 0 ? t.teamSun : t.teamMoon)}
            </span>
            {info !== null ? (
              <span className="flex items-center gap-2">
                <Seat
                  name={seat === viewer ? t.you : info.name}
                  team={(seat % 2) as 0 | 1}
                  isBot={info.isBot}
                  connected={info.connected}
                />
                {info.isBot && !started && (
                  <button
                    data-testid={`bot-difficulty-${seat}`}
                    onClick={() => onAddBot(seat, nextDifficulty(difficulty))}
                    title={t.cycleBot}
                    className={`px-2 py-1 text-xs text-(--color-ivory)/70 ${GHOST_BTN}`}
                  >
                    {difficultyLabel[difficulty]}
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
                  {seated ? t.moveHere : t.sitHere}
                </button>
                <button
                  onClick={() => onAddBot(seat, 'normal')}
                  className={`px-3 py-2 text-sm text-(--color-ivory)/75 ${GHOST_BTN}`}
                >
                  {t.addBot}
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
