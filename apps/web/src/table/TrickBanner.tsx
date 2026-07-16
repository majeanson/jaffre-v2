import { TEAMS } from '../teams.js';
import type { HeldBanner } from './useTableDerived.js';

export interface TrickBannerProps {
  readonly banner: HeldBanner;
}

/**
 * Owns the trick result: a big, glanceable card — who took it, how many
 * points, for which team — shown while the finished trick is held.
 */
export function TrickBanner({ banner }: TrickBannerProps) {
  const team = TEAMS[banner.team];
  const special = banner.specials.length > 0;
  return (
    <div
      data-testid="trick-banner"
      className={`absolute bottom-[4%] left-1/2 z-30 w-max max-w-[94vw] -translate-x-1/2 ${special ? 'special-burst' : 'pop-in'}`}
    >
      {/* Fluid: root font scales with the viewport, internals in em. */}
      <div
        className="flex items-center gap-[1em] rounded-2xl border-2 bg-black/80 px-[1.2em] py-[0.7em] text-(length:--text-fluid-base) shadow-(--shadow-panel)"
        style={{ borderColor: team.color }}
      >
        <span
          className="grid size-[3.2em] shrink-0 place-items-center rounded-xl font-display text-[1.5em] font-black text-(--color-felt-950)"
          style={{ background: team.color }}
        >
          {banner.points > 0 ? '+' : ''}
          {banner.points}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-display text-[1.25em] text-white">
            {banner.isYou ? 'You take the trick!' : `${banner.winnerName} takes the trick`}
          </span>
          <span className="text-[0.85em] font-semibold" style={{ color: team.color }}>
            for {team.label}
            {/* Dark badge + suit border: a suit-color FILL can't carry
                AA-readable 11px text (brown especially). */}
            {banner.specials.map((s) => (
              <span
                key={s}
                className={`ml-2 rounded-full border-2 bg-black/60 px-[0.6em] py-px text-[0.8em] font-black text-white ${
                  s === 'red_zero' ? 'border-(--color-suit-red)' : 'border-(--color-suit-brown)'
                }`}
              >
                {s === 'red_zero' ? 'RED 0 +5' : 'BROWN 0 −2'}
              </span>
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}
