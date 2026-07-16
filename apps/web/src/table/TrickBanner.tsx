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
      className={`absolute bottom-[4%] left-1/2 z-30 -translate-x-1/2 ${special ? 'special-burst' : 'pop-in'}`}
    >
      <div
        className="flex items-center gap-4 rounded-2xl border-2 bg-black/80 px-5 py-3 shadow-(--shadow-panel) max-sm:gap-3 max-sm:px-4 max-sm:py-2"
        style={{ borderColor: team.color }}
      >
        <span
          className="grid size-14 shrink-0 place-items-center rounded-xl font-display text-2xl font-black text-(--color-felt-950) max-sm:size-11 max-sm:text-xl"
          style={{ background: team.color }}
        >
          {banner.points > 0 ? '+' : ''}
          {banner.points}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-display text-xl text-white max-sm:text-lg">
            {banner.isYou ? 'You take the trick!' : `${banner.winnerName} takes the trick`}
          </span>
          <span className="text-sm font-semibold max-sm:text-xs" style={{ color: team.color }}>
            for {team.label}
            {/* Dark badge + suit border: a suit-color FILL can't carry
                AA-readable 11px text (brown especially). */}
            {banner.specials.map((s) => (
              <span
                key={s}
                className={`ml-2 rounded-full border-2 bg-black/60 px-2 py-px text-[11px] font-black text-white ${
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
