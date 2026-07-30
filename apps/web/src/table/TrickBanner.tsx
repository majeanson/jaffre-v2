import { useLang, type Lang } from '@jaffre/ui';
import { useLayoutEffect, useRef } from 'react';
import { TEAMS } from '../teams.js';
import { hold, launchFlight, pointsHoldKey, scoreTarget, specialsHoldKey } from './flight.js';
import { paced } from './pacePref.js';
import type { HeldBanner } from './useTableDerived.js';

const T: Record<
  Lang,
  {
    youTake: string;
    takes: (name: string) => string;
    forTeam: string;
    redBadge: string;
    brownBadge: string;
  }
> = {
  en: {
    youTake: 'You take the trick!',
    takes: (name) => `${name} takes the trick`,
    forTeam: 'for',
    redBadge: 'RED 0 +5',
    brownBadge: 'BROWN 0 −3',
  },
  fr: {
    youTake: 'Tu prends la levée!',
    takes: (name) => `${name} prend la levée`,
    forTeam: 'pour',
    redBadge: 'ROUGE 0 +5',
    brownBadge: 'BRUN 0 −3',
  },
};

export interface TrickBannerProps {
  readonly banner: HeldBanner;
}

/**
 * Owns the trick result: a big, glanceable card — who took it, how many
 * points, for which team — shown while the finished trick is held.
 */
export function TrickBanner({ banner }: TrickBannerProps) {
  const t = T[useLang()];
  const team = TEAMS[banner.team];
  const special = banner.specials.length > 0;
  const chipRef = useRef<HTMLSpanElement>(null);

  // A fresh banner IS a fresh trick — Stage unmounts the previous one before
  // this one ever mounts (banner is null in between) — so a plain mount
  // effect fires exactly once per held trick. It runs before the strip's
  // tally has painted the bumped points unmasked (see flight.ts: the hold
  // registered here wins the race against paint).
  useLayoutEffect(() => {
    const key = pointsHoldKey(banner.team);
    hold(key);
    launchFlight({
      from: chipRef.current ?? new DOMRect(),
      to: scoreTarget(banner.team),
      key,
      payload: (
        <span
          className="grid size-[2.2em] place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) font-arcade-display text-[1em] text-(--color-felt-950) shadow-(--shadow-ap-sm)"
          style={{ background: team.color }}
        >
          {banner.points > 0 ? '+' : ''}
          {banner.points}
        </span>
      ),
    });
    if (!special) return undefined;
    // The specials badge is its own, slightly-delayed flight — the emphasis
    // beat after the number lands, not competing with it for attention. It
    // gets its OWN hold (G11), armed here alongside the points hold above:
    // masking it under points-N instead released the bar's specials chip the
    // instant the points flight landed, ~200ms before this one actually did.
    const specialsKey = specialsHoldKey(banner.team);
    hold(specialsKey);
    const timer = window.setTimeout(() => {
      for (const kind of banner.specials) {
        launchFlight({
          from: chipRef.current ?? new DOMRect(),
          to: scoreTarget(banner.team),
          burst: true,
          key: specialsKey,
          payload: (
            <span
              className={`rounded-(--radius-ap-inner) border-2 bg-black/70 px-[0.6em] py-px font-arcade-display text-[0.9em] text-white ${
                kind === 'red_zero' ? 'border-(--color-suit-red)' : 'border-(--color-suit-brown)'
              }`}
            >
              {kind === 'red_zero' ? '+5' : '−3'}
            </span>
          ),
        });
      }
    }, paced(200));
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      data-testid="trick-banner"
      // pointer-events-none: the banner sits above the tap-to-continue felt
      // button and is the most eye-catching thing on screen while a trick is
      // held — i.e. exactly where a player taps to move on. It owns no
      // controls, so taps belong to the skip button underneath it. Positioned
      // by Stage's toast stack, not by itself, so simultaneous announcements
      // (trump callout, coach-marks) stack instead of colliding.
      className={`pointer-events-none max-w-full ${special ? 'special-burst' : 'pop-in'}`}
    >
      {/* Fluid: root font scales with the viewport, internals in em. Ink pill
          with a gold border + zero-blur hard shadow — permanently dark, so its
          text is white (not the flipping --color-ap-text). */}
      <div className="flex items-center gap-[1em] rounded-(--radius-ap-panel) border-2 border-(--color-ap-gold) bg-(--color-ap-ink) px-[1.2em] py-[0.7em] text-(length:--text-fluid-base) shadow-(--shadow-ap-lg)">
        <span
          ref={chipRef}
          className="grid size-[3em] shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) font-arcade-display text-[1.4em] text-(--color-felt-950) shadow-(--shadow-ap-sm)"
          style={{ background: team.color }}
        >
          {banner.points > 0 ? '+' : ''}
          {banner.points}
        </span>
        <span className="flex flex-col gap-[0.15em] leading-tight">
          <span className="font-arcade-display text-[1.1em] uppercase text-white">
            {banner.isYou ? t.youTake : t.takes(banner.winnerName)}
          </span>
          <span className="font-arcade-ui text-[0.85em] font-semibold text-white/75">
            {t.forTeam} {team.label}
            {/* Dark badge + suit border: a suit-color FILL can't carry
                AA-readable small text (brown especially). */}
            {banner.specials.map((s) => (
              <span
                key={s}
                className={`ml-2 rounded-(--radius-ap-inner) border-2 bg-black/50 px-[0.6em] py-px font-arcade-display text-[0.75em] text-white ${
                  s === 'red_zero' ? 'border-(--color-suit-red)' : 'border-(--color-suit-brown)'
                }`}
              >
                {s === 'red_zero' ? t.redBadge : t.brownBadge}
              </span>
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}
