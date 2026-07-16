export interface CoachHintProps {
  readonly tip: string;
}

/**
 * The Coach's one-line advice, shown over the stage on your turn. Deliberately
 * quiet — a suggestion, not an instruction — with the recommended card lit up
 * in your hand to match.
 */
export function CoachHint({ tip }: CoachHintProps) {
  return (
    <div className="pointer-events-none absolute bottom-[4%] left-1/2 z-20 -translate-x-1/2 px-3">
      <div className="pop-in flex max-w-[min(92vw,34rem)] items-center gap-2.5 rounded-full border border-(--color-lamplight)/40 bg-black/80 px-4 py-2 shadow-(--shadow-panel)">
        <span aria-hidden className="text-(--color-lamplight)">
          ✦
        </span>
        <span className="text-(length:--text-fluid-sm) leading-snug text-white/90">{tip}</span>
      </div>
    </div>
  );
}
