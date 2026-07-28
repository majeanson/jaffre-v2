/**
 * The shared level/XP/unlock progress bar idiom — one height (0.55em) + the
 * ink border. Used across Corner, Journey, LevelBadge and Awards, which
 * previously mismatched heights (0.4/0.55/0.8em) and Awards alone dropped
 * the border. Width is caller-controlled via `className` (e.g. `w-full` in a
 * flex-column tile, `min-w-0 flex-1` beside fixed-width siblings in a row).
 */
export function ProgressBar({
  pct,
  className = 'w-full',
  fill,
}: {
  readonly pct: number;
  readonly className?: string;
  /** Fill colour (any CSS colour or var()). Defaults to the shell violet —
   * pass a suit colour for the mastery lanes, where the bar's colour IS the
   * label. */
  readonly fill?: string;
}) {
  return (
    <span
      className={`block h-[0.55em] overflow-hidden rounded-full border-2 border-(--color-ap-ink) bg-(--color-ap-ink)/20 ${className}`}
    >
      <span
        className={`block h-full ${fill === undefined ? 'bg-(--color-ap-violet)' : ''}`}
        style={{ width: `${String(pct)}%`, ...(fill === undefined ? {} : { background: fill }) }}
      />
    </span>
  );
}
