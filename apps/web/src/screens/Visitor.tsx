import { AvatarChip, Cta, useLang, type Lang } from '@jaffre/ui';
import type { RosterSeat } from '@jaffre/protocol';
import { useGameStore } from '../state/gameStore.js';
import { getProfile } from '../net/auth.js';
import { playerName } from '../net/socket.js';
import { Comms } from '../table/Comms.js';

export interface VisitorProps {
  readonly code: string;
  readonly onSit: (seat: 0 | 1 | 2 | 3) => void;
  readonly onWatch: () => void;
  readonly onLeave: () => void;
}

const SEATS = [0, 1, 2, 3] as const;

const T: Record<
  Lang,
  {
    wantsYou: (host: string) => string;
    oneSeatOpen: string;
    room: (code: string) => string;
    openSeat: string;
    open: string;
    youSitHere: string;
    bot: string;
    away: string;
    teamSun: string;
    teamMoon: string;
    score: string;
    inPlay: string;
    vs: string;
    sitDown: string;
    takeOver: (name: string) => string;
    justWatch: string;
    leave: string;
    whoAtTable: string;
  }
> = {
  en: {
    wantsYou: (host) => `${host} wants you`,
    oneSeatOpen: 'at the table — one seat open.',
    room: (code) => `Room ${code}`,
    openSeat: 'Open seat',
    open: 'Open',
    youSitHere: 'You · sit here',
    bot: 'Bot',
    away: 'Away',
    teamSun: 'Team Sun',
    teamMoon: 'Team Moon',
    score: 'Score',
    inPlay: 'In play',
    vs: 'vs',
    sitDown: 'Sit down',
    takeOver: (name) => `Take over ${name}’s seat`,
    justWatch: 'Just watch',
    leave: 'Leave',
    whoAtTable: "Who's at the table",
  },
  fr: {
    wantsYou: (host) => `${host} t'attend`,
    oneSeatOpen: 'à la table — un siège libre.',
    room: (code) => `Salon ${code}`,
    openSeat: 'Siège libre',
    open: 'Libre',
    youSitHere: 'Toi · assis-toi ici',
    bot: 'Bot',
    away: 'Absent',
    teamSun: 'Équipe Soleil',
    teamMoon: 'Équipe Lune',
    score: 'Pointage',
    inPlay: 'En jeu',
    vs: 'c.',
    sitDown: "S'asseoir",
    takeOver: (name) => `Prendre le siège de ${name}`,
    justWatch: 'Juste regarder',
    leave: 'Quitter',
    whoAtTable: 'Qui est à la table',
  },
};

type Strings = (typeof T)[Lang];

/** Seats 0 & 2 are Team Sun, 1 & 3 Team Moon — the felt-table pairing. */
function teamOf(seat: number, t: Strings): { name: string; color: string } {
  return seat % 2 === 0
    ? { name: t.teamSun, color: 'var(--color-team-a)' }
    : { name: t.teamMoon, color: 'var(--color-team-b)' };
}

/**
 * Landing page for a spectator arriving at a room already in progress. Wears
 * the Refined Arcade Violet shell: a mini four-seat table diagram (who's here,
 * humans vs bots by label — never emoji) that reads at a glance, plus one-tap
 * actions to take over a bot's seat, keep watching, or leave.
 */
export function Visitor({ code, onSit, onWatch, onLeave }: VisitorProps) {
  const t = T[useLang()];
  const { roster, view } = useGameStore();
  const scores = view?.scores;
  // Whoever is first seated and human "owns" this table — the landing greets a
  // visitor in their name, falling back to the raw room code.
  const host = roster?.seats.find((s): s is RosterSeat => s !== null && !s.isBot);

  // A bot seat is your way in; the first is highlighted as "your" seat and
  // previews you — your name + chosen colour, the way the felt will show it.
  const botSeats = SEATS.filter((seat) => roster?.seats[seat]?.isBot === true);
  const yourSeat = botSeats[0];
  const me = playerName();
  const myColor = getProfile().color ?? undefined;

  // One seat cell of the diagram: chip + name + a text label (team, and "Bot"
  // / "Away" tags) so nothing rides on colour alone. The seat you'd take glows
  // and shows you.
  const seatCell = (seat: number) => {
    const info = roster?.seats[seat] ?? null;
    const team = teamOf(seat, t);
    const takeable = seat === yourSeat;
    const displayName = takeable ? me : (info?.name ?? t.openSeat);
    const tags = takeable
      ? t.youSitHere
      : info === null
        ? t.open
        : [info.isBot ? t.bot : null, team.name, info.connected ? null : t.away]
            .filter((t): t is string => t !== null)
            .join(' · ');
    return (
      <div
        data-testid={`visitor-seat-${seat}`}
        className="flex flex-col items-center gap-1 text-center"
      >
        <AvatarChip
          name={displayName}
          color={takeable ? myColor : undefined}
          highlight={takeable}
        />
        <span className="max-w-[7rem] truncate font-arcade-ui text-[0.9em] font-semibold text-(--color-ap-text)">
          {displayName}
        </span>
        <span
          className={`font-arcade-ui text-[0.72em] font-semibold uppercase tracking-wide ${takeable ? 'text-(--color-ap-gold)' : 'text-(--color-ap-muted)'}`}
        >
          {tags}
        </span>
      </div>
    );
  };

  return (
    <main className="grid min-h-screen place-items-center bg-(--color-ap-ground) p-6 font-arcade-ui text-(--color-ap-text)">
      {/* Visitors can chat with the table before they sit — the popover opens
          upward from the bottom-right toggle. */}
      <div className="fixed right-4 bottom-4 z-40">
        <Comms />
      </div>
      <div className="flex w-full max-w-md flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="font-arcade-display text-[2em] leading-none tracking-[0.06em] text-(--color-ap-gold)">
            Jaffré
          </div>
          {host !== undefined ? (
            <div className="flex items-center gap-3">
              <AvatarChip name={host.name} size="lg" />
              <div className="text-left">
                <h1 className="font-arcade-display text-[1.2em] uppercase leading-tight text-(--color-ap-text)">
                  {t.wantsYou(host.name)}
                </h1>
                <div className="font-arcade-ui text-[0.9em] text-(--color-ap-muted)">
                  {t.oneSeatOpen}
                </div>
              </div>
            </div>
          ) : (
            <h1 className="font-arcade-display text-[1.4em] uppercase text-(--color-ap-text)">
              {t.room(code)}
            </h1>
          )}
        </header>

        {/* Mini four-seat table: partners sit across, the way the felt does. */}
        <div
          role="group"
          aria-label={t.whoAtTable}
          className="mx-auto grid aspect-square w-full max-w-[19rem] grid-cols-3 grid-rows-3 items-center gap-2"
        >
          <div className="col-start-2 row-start-1">{seatCell(2)}</div>
          <div className="col-start-1 row-start-2">{seatCell(1)}</div>
          <div className="col-start-2 row-start-2 grid place-items-center">
            <div className="grid aspect-square w-full place-items-center rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-2 text-center shadow-(--shadow-ap-sm)">
              {scores !== undefined ? (
                <div className="font-arcade-display leading-tight tabular-nums">
                  <div className="text-[0.6em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
                    {t.score}
                  </div>
                  <div className="mt-0.5 text-[1.3em]">
                    <span style={{ color: 'var(--color-team-a)' }}>{scores[0]}</span>
                    <span className="mx-1 text-(--color-ap-muted)">-</span>
                    <span style={{ color: 'var(--color-team-b)' }}>{scores[1]}</span>
                  </div>
                </div>
              ) : (
                <span className="font-arcade-display text-[0.9em] uppercase tracking-wide text-(--color-ap-muted)">
                  {t.inPlay}
                </span>
              )}
            </div>
          </div>
          <div className="col-start-3 row-start-2">{seatCell(3)}</div>
          <div className="col-start-2 row-start-3">{seatCell(0)}</div>
        </div>

        {scores !== undefined && (
          <p className="text-center font-arcade-ui text-[0.85em] text-(--color-ap-muted)">
            <span style={{ color: 'var(--color-team-a)' }}>
              {t.teamSun} {scores[0]}
            </span>
            <span className="mx-2 text-(--color-ap-muted)">{t.vs}</span>
            <span style={{ color: 'var(--color-team-b)' }}>
              {t.teamMoon} {scores[1]}
            </span>
          </p>
        )}

        <div className="flex flex-col gap-3">
          {botSeats.map((seat) => {
            const info = roster?.seats[seat];
            if (info === undefined || info === null) return null;
            // The first open seat is the hero "Sit down"; any others read as
            // "take over <bot>'s seat" so the primary action stays singular.
            const primary = seat === yourSeat;
            return (
              <Cta
                key={seat}
                type="button"
                variant={primary ? 'primary' : 'secondary'}
                data-testid={`take-seat-${seat}`}
                onClick={() => onSit(seat)}
                className={primary ? 'w-full py-[0.9em] text-[1.3em]' : 'w-full'}
              >
                {primary ? t.sitDown : t.takeOver(info.name)}
              </Cta>
            );
          })}
          <Cta type="button" variant="secondary" onClick={onWatch} className="w-full">
            {t.justWatch}
          </Cta>
          <Cta type="button" variant="secondary" onClick={onLeave} className="w-full">
            {t.leave}
          </Cta>
        </div>
      </div>
    </main>
  );
}
