/**
 * Pure spatial-navigation scoring — no DOM in here. Given the rect you are
 * leaving and the rects you could land on, pick the best one in a direction.
 *
 * The rules, in plain terms:
 *   - a candidate qualifies when its centre lies beyond the source's centre in
 *     the pressed direction — centres, not edges, so slightly overlapping
 *     elements (the card fan) still navigate;
 *   - nearer beats farther along the pressed axis;
 *   - staying in line beats drifting sideways: cross-axis separation costs
 *     double, and a candidate whose cross-axis span overlaps the source's
 *     counts as no separation at all (aligned rows and columns win);
 *   - exact ties resolve to the lowest index, and callers pass rects in DOM
 *     order, so ties follow the document.
 */

export interface NavRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type NavDir = 'up' | 'down' | 'left' | 'right';

/** Sideways drift costs double the forward distance. */
const DRIFT_WEIGHT = 2;

/**
 * A whisker of score for centre misalignment, so that among overlapping,
 * equally-near candidates the one straight ahead wins.
 */
const ALIGN_WEIGHT = 0.05;

/** Sub-pixel jitter must never make an element its own neighbour. */
const EPSILON = 0.5;

function centerX(r: NavRect): number {
  return (r.left + r.right) / 2;
}

function centerY(r: NavRect): number {
  return (r.top + r.bottom) / 2;
}

/** Distance between two 1-D spans; zero when they overlap. */
function spanGap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (bEnd < aStart) return aStart - bEnd;
  if (bStart > aEnd) return bStart - aEnd;
  return 0;
}

/**
 * Index of the best candidate in `dir` from `from`, or null when nothing lies
 * that way (the caller then leaves the key to the browser, so an arrow at the
 * edge of the page still scrolls).
 */
export function bestCandidate(
  from: NavRect,
  candidates: readonly NavRect[],
  dir: NavDir,
): number | null {
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  let best: number | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c === undefined) continue;
    const forward = horizontal
      ? sign * (centerX(c) - centerX(from))
      : sign * (centerY(c) - centerY(from));
    if (forward <= EPSILON) continue;
    const drift = horizontal
      ? spanGap(from.top, from.bottom, c.top, c.bottom)
      : spanGap(from.left, from.right, c.left, c.right);
    const misalign = horizontal
      ? Math.abs(centerY(c) - centerY(from))
      : Math.abs(centerX(c) - centerX(from));
    const score = forward + DRIFT_WEIGHT * drift + ALIGN_WEIGHT * misalign;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
