import type { Viewer } from '@jaffre/engine';
import type { BotDifficulty, Roster } from '@jaffre/protocol';
import { Cta, Seat, TeamGlyph, useLang, type Lang } from '@jaffre/ui';

/** Difficulty chips are colour-coded so the table reads at a glance: green
 * (easy) → gold (normal) → red (hard). */
const DIFFICULTY_TONE: Record<BotDifficulty, string> = {
  easy: 'border-(--color-ap-ok) text-(--color-ap-ok)',
  normal: 'border-(--color-ap-gold) text-(--color-ap-gold)',
  hard: 'border-(--color-ap-danger) text-(--color-ap-danger-text)',
};

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
    seatLabel: (n: number) => string;
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
    seatLabel: (n) => `Seat ${String(n)}`,
    teamSun: 'Team Sun',
    teamMoon: 'Team Moon',
    you: 'You',
    cycleBot: 'Tap to change bot difficulty',
    moveHere: 'Move here',
    sitHere: 'Sit here',
    addBot: 'Add bot',
  },
  fr: {
    seatLabel: (n) => `Siège ${String(n)}`,
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
            {/* The glyph (with an sr-only team name) replaces the team word. */}
            <span className="flex w-20 items-center justify-end gap-1.5 text-right font-arcade-ui text-xs text-(--color-ap-muted)">
              <span className="whitespace-nowrap">{t.seatLabel(seat + 1)}</span>
              <TeamGlyph
                team={(seat % 2) as 0 | 1}
                size="1.1em"
                label={seat % 2 === 0 ? t.teamSun : t.teamMoon}
              />
            </span>
            {info !== null ? (
              <span className="flex items-center gap-2">
                <Seat
                  name={info.name}
                  isYou={seat === viewer}
                  team={(seat % 2) as 0 | 1}
                  isBot={info.isBot}
                  connected={info.connected}
                />
                {info.isBot && !started && (
                  <button
                    type="button"
                    data-testid={`bot-difficulty-${seat}`}
                    onClick={() => onAddBot(seat, nextDifficulty(difficulty))}
                    title={t.cycleBot}
                    className={`cursor-pointer rounded-(--radius-ap-control) border-2 px-2.5 py-1 font-arcade-display text-[0.7em] uppercase tracking-wide shadow-(--shadow-ap-sm) hover:brightness-110 ${DIFFICULTY_TONE[difficulty]}`}
                  >
                    {difficultyLabel[difficulty]}
                  </button>
                )}
              </span>
            ) : (
              <span className="flex gap-2">
                <Cta onClick={() => onSit(seat)} disabled={started}>
                  {seated ? t.moveHere : t.sitHere}
                </Cta>
                <Cta
                  variant="secondary"
                  disabled={started}
                  onClick={() => onAddBot(seat, 'normal')}
                >
                  {t.addBot}
                </Cta>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
