/**
 * Trophy-shelf arrangement — the pure half of the Awards screen.
 *
 * Kept out of the component so it can be tested without pulling in the profile
 * cache, the audio layer or anything else that needs a browser: this is the
 * one piece of that screen that can silently LOSE a trophy, so it wants tests
 * that are cheap to run.
 */

/**
 * Apply a stored arrangement to a list of award ids.
 *
 * Defensive by construction: unknown ids are dropped, duplicates collapse, and
 * anything the arrangement never mentions is appended in catalog order. A
 * stale shelf — saved before an award existed, or after one was renamed — can
 * therefore never hide a trophy. The worst case is that a newly earned award
 * appears at the end, which is exactly where a new thing belongs.
 */
export function arrangeIds(ids: readonly string[], order: readonly string[] | null): string[] {
  if (order === null) return [...ids];
  const available = new Set(ids);
  const placed: string[] = [];
  for (const id of order) {
    // `delete` returns false for an id that was never earned OR was already
    // placed, so this drops unknowns and collapses duplicates in one step.
    if (available.delete(id)) placed.push(id);
  }
  return [...placed, ...ids.filter((id) => available.has(id))];
}

/** Swap two entries, returning a new array. Out-of-range moves are a no-op so
 * the caller can wire the ends of the shelf without special-casing them. */
export function moveWithin(ids: readonly string[], index: number, delta: number): string[] {
  const target = index + delta;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return [...ids];
  const next = [...ids];
  next[index] = ids[target] as string;
  next[target] = ids[index] as string;
  return next;
}
