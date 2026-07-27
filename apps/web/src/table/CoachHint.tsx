export interface CoachHintProps {
  readonly tip: string;
}

/**
 * The advice pill itself — an ink pill with a gold spark; permanently dark, so
 * its text is white (not the flipping --color-ap-text). Carries no positioning:
 * a wrapper places it (bottom-anchored on card-play turns via {@link CoachHint};
 * stacked above the bet panel during bidding via BidOverlay).
 */
export function CoachTipPill({ tip }: CoachHintProps) {
  return (
    // data-testid is the contract for "the Coach is speaking" — the coach-off
    // e2e asserts this never appears. Both placements (bottom-anchored during
    // play, above the bet panel during bidding) render through here.
    <div
      data-testid="coach-tip"
      className="pop-in flex max-w-[min(92vw,34rem)] items-center gap-2.5 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-ink) px-4 py-2.5 shadow-(--shadow-ap)"
    >
      <span aria-hidden className="text-(--color-ap-gold)">
        ❖
      </span>
      <span className="font-arcade-ui text-(length:--text-fluid-sm) leading-snug text-white/90">
        {tip}
      </span>
    </div>
  );
}

/**
 * The Coach's one-line advice, shown over the stage on your turn. Deliberately
 * quiet — a suggestion, not an instruction — with the recommended card lit up
 * in your hand to match. Bottom-anchored for card-play turns; during bidding
 * the bet panel owns the center, so BidOverlay renders the pill above it.
 */
export function CoachHint({ tip }: CoachHintProps) {
  return (
    // w-max: an abs-positioned box at left-1/2 shrink-wraps against the HALF
    // of the container to its right, so the tip wrapped into a ~140px tower
    // on phones. max-w on the pill still caps it to the viewport.
    <div className="pointer-events-none absolute bottom-[4%] left-1/2 z-20 w-max max-w-full -translate-x-1/2 px-3">
      <CoachTipPill tip={tip} />
    </div>
  );
}
