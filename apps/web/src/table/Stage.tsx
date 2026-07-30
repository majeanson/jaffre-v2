import { TrickArea, useLang, type Lang } from '@jaffre/ui';
import type { ReactNode } from 'react';
import { CoachTipPill } from './CoachHint.js';
import { DealIntro } from './DealIntro.js';
import { SeatChip } from './SeatChip.js';
import { TrickBanner } from './TrickBanner.js';
import { skipTrickHold } from './useTrickHold.js';
import type { HeldBanner, TableDerived } from './useTableDerived.js';

const SKIP_HOLD_LABEL: Record<Lang, string> = {
  en: 'Continue — skip the pause on this trick',
  fr: 'Continuer — passer la pause sur cette levée',
};

export interface StageProps {
  readonly trickPlays: TableDerived['trickPlays'];
  readonly sweepTo: TableDerived['sweepTo'];
  readonly banner: HeldBanner | null;
  /** Winning card's position while the resolved trick is held (glow). */
  readonly winnerPosition: 0 | 1 | 2 | 3 | null;
  readonly seatInfo: TableDerived['seatInfo'];
  /** Bumped once per animated deal (see dealPace) — drives the deck's one-shot
   * fly-out, in step with the hand filling and the auction's short wait. */
  readonly dealKey: number;
  /** Auction controls, rendered over the stage on your bidding turn. */
  readonly bidOverlay?: ReactNode;
  /** A transient game announcement (the trump callout) — rendered at the TOP
   * of the felt's toast stack, above the trick banner. Table passes it only
   * in real play (dev), same gate the callout always had. */
  readonly announcement?: ReactNode;
  /** The Coach's one-line tip. Stacks BELOW the trick banner in the toast
   * stack while one is up (G5) rather than being hidden by it — the reasoning
   * for the last play should survive the hold that shows its result. */
  readonly coachTip?: string | null;
  /** Spectator view: no hand dock below, so the stage would absorb the whole
   * portrait height and stretch the felt into a tall oval — cap its height
   * relative to its width so the felt keeps a table-like shape. */
  readonly capHeight?: boolean;
  /** Replay: skip the decorative deal fly-out (see TableProps.noDealIntro). */
  readonly noDealIntro?: boolean;
}

/** Owns the center stage: trick area, opponents' seat chips, trick banner, bid overlay. */
export function Stage({
  trickPlays,
  sweepTo,
  banner,
  winnerPosition,
  seatInfo,
  dealKey,
  bidOverlay,
  announcement,
  coachTip = null,
  capHeight = false,
  noDealIntro = false,
}: StageProps) {
  const skipLabel = SKIP_HOLD_LABEL[useLang()];
  // A held trick is the one moment the felt itself is tappable: it means
  // "I've seen it, move on" — and after the last trick of a round it's what
  // the recap is waiting on.
  const holding = banner !== null;
  // On a bidding turn the centered bet panel owns the middle-to-bottom of the
  // stage; BidOverlay renders the coach tip stacked above it there, so the
  // bottom-anchored hint below would only duplicate it (and get overlapped).
  const bidding = Boolean(bidOverlay);
  return (
    <div
      className={`relative w-full max-w-[min(96vw,100rem)] min-h-0 flex-1 ${
        capHeight ? 'my-auto max-h-[min(77vw,80rem)]' : ''
      }`}
    >
      {/* The green felt playing surface — a discrete oval on the arcade ground.
          On a phone it swells to nearly the whole stage so no space is wasted;
          on desktop, where there's room to breathe, it keeps its margins. */}
      <div
        aria-hidden
        className="felt-oval pointer-events-none absolute inset-[7%] rounded-[46%] max-sm:inset-x-[2%] max-sm:inset-y-[3%]"
      />
      {/* One-shot deal animation, anchored to the felt's own positioning
          context (not persistent — see DealIntro). Sits under the seat chips
          (z-20) but over the felt so the flung cards read as on-table. */}
      {!noDealIntro && <DealIntro dealKey={dealKey} />}
      {/* Trick insets keep cards clear of the seat chips. On phones the box
          widens with the felt so the bigger cards use the space. */}
      <div className="absolute inset-x-[21%] inset-y-[13%] z-10 max-sm:inset-x-[15%] max-sm:inset-y-[10%]">
        <TrickArea plays={trickPlays} sweepTo={sweepTo} highlight={winnerPosition} size="lg" />
      </div>
      {holding && (
        // Covers the felt while a trick is held, so a tap anywhere on the
        // table continues. Sits above the cards (z-10) but below the seat
        // chips (z-20) so a chip peek still wins the tap.
        <button
          type="button"
          data-testid="skip-hold"
          aria-label={skipLabel}
          title={skipLabel}
          onClick={skipTrickHold}
          className="absolute inset-[7%] z-[11] cursor-pointer rounded-[46%] max-sm:inset-x-[2%] max-sm:inset-y-[3%]"
        />
      )}
      {/* ONE bottom-anchored stack for everything that announces over the
          felt: the trump callout (passed in as `announcement`), the trick
          banner, the Coach's tip — and the tutorial coach-marks, which portal
          themselves into this node by id (TutorialCoach). Before, the trump
          callout and the coach-marks sat under the top bar at the SAME fixed
          coordinates and buried each other; now simultaneous notices stack in
          a column and every one stays readable. */}
      <div
        id="table-toast-stack"
        className="pointer-events-none absolute bottom-[4%] left-1/2 z-30 flex w-max max-w-[94vw] -translate-x-1/2 flex-col items-center gap-2 px-3 max-sm:bottom-[12%]"
      >
        {announcement}
        {banner !== null && <TrickBanner banner={banner} />}
        {/* Stacks below the banner instead of waiting for `banner === null` —
            a held trick's result and the Coach's reasoning for the play that
            caused it are both worth reading at once (G5). Still hidden during
            the auction: BidOverlay renders its own tip stacked over the bet
            panel there, so this one would only duplicate it. */}
        {!bidding && coachTip !== null && coachTip !== '' && <CoachTipPill tip={coachTip} />}
      </div>
      {/* Desktop: full nameplates on the rim (there's space to show "Marcel ·
          bot"). Phone: compact avatar tokens pulled ONTO the felt, diagonally
          offset beside their own played card, so the rim isn't dead space.
          z-20 keeps the chips — and everything they pop up (tap peek, bid
          bubble, bot-swap countdown) — ABOVE the played cards: an outer z-0
          would trap those popovers under the trick no matter their own z.
          The seat positions are chosen to stay clear of the card slots.
          top-4 keeps the top chip (and its bid bubble) below the top bar.
          No persistent face-down fan anymore (that used to crowd the chips
          and the felt all game) — DealIntro above shows the deck only for
          the brief deal at the start of each round. */}
      {/* data-deal-target anchors: DealIntro measures these rects so the dealt
          cards fly to the avatars' REAL positions, not eyeballed directions. */}
      <div
        data-deal-target="2"
        className="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 max-sm:top-[3%] max-sm:left-[30%]"
      >
        <SeatChip info={seatInfo(2)} compact />
      </div>
      {/* Position 1 sits low on the left (not mid-rim) — the table reads as an
          anti-clockwise turn of the classic N/S/E/W diamond. Its peek opens
          upward so it can't spill past the stage's bottom edge. */}
      {/* Phone: your own chip lives right of the utility bar (UtilityRow), so
          the felt's bottom rim is free — this seat hugs the bottom-left corner
          instead of floating mid-rim, keeping the middle clear for cards. */}
      <div
        data-deal-target="1"
        className="absolute bottom-[4%] left-0 z-20 flex flex-col items-center gap-1 max-sm:bottom-[4%] max-sm:left-[2%]"
      >
        <SeatChip info={seatInfo(1)} compact peekAlign="start" peekPlacement="up" />
      </div>
      <div
        data-deal-target="3"
        // Phone: 22% (not 34%) keeps this chip above the vertically-centered
        // bid panel's band — at 34% its avatar and PASS bubble sat right on
        // the panel's Sans-atout corner through every auction.
        className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 max-sm:right-[2%] max-sm:top-[22%]"
      >
        <SeatChip info={seatInfo(3)} compact peekAlign="end" />
      </div>
      {bidOverlay}
    </div>
  );
}
