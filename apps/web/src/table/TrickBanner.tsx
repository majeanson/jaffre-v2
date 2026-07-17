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
      {/* Fluid: root font scales with the viewport, internals in em. Ink pill
          with a gold border + zero-blur hard shadow — permanently dark, so its
          text is white (not the flipping --color-ap-text). */}
      <div className="flex items-center gap-[1em] rounded-(--radius-ap-panel) border-2 border-(--color-ap-gold) bg-(--color-ap-ink) px-[1.2em] py-[0.7em] text-(length:--text-fluid-base) shadow-(--shadow-ap-lg)">
        <span
          className="grid size-[3em] shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) font-arcade-display text-[1.4em] text-(--color-felt-950) shadow-(--shadow-ap-sm)"
          style={{ background: team.color }}
        >
          {banner.points > 0 ? '+' : ''}
          {banner.points}
        </span>
        <span className="flex flex-col gap-[0.15em] leading-tight">
          <span className="font-arcade-display text-[1.1em] uppercase text-white">
            {banner.isYou ? 'You take the trick!' : `${banner.winnerName} takes the trick`}
          </span>
          <span className="font-arcade-ui text-[0.85em] font-semibold text-white/75">
            for {team.label}
            {/* Dark badge + suit border: a suit-color FILL can't carry
                AA-readable small text (brown especially). */}
            {banner.specials.map((s) => (
              <span
                key={s}
                className={`ml-2 rounded-(--radius-ap-inner) border-2 bg-black/50 px-[0.6em] py-px font-arcade-display text-[0.75em] text-white ${
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
