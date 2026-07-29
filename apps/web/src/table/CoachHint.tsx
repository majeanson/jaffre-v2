export interface CoachHintProps {
  readonly tip: string;
}

/**
 * The advice pill itself — an ink pill with a gold spark; permanently dark, so
 * its text is white (not the flipping --color-ap-text). Carries no positioning:
 * a wrapper places it (Stage's felt toast stack on card-play turns; stacked
 * above the bet panel during bidding via BidOverlay).
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
