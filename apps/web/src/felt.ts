import type { Lang } from '@jaffre/ui';
import { atLevel, type Cosmetic } from './cosmetics.js';
import { masteryRequirement, masteryUnlocked } from './mastery.js';

/**
 * Felt — a FOURTH cosmetic axis (`[data-felt]`), beside themes, card skins and
 * bonhommes. The playing surface was always a separable thing: `.table-felt`
 * and `.felt-oval` read nothing but the four `--color-felt-*` tokens. It was
 * simply welded to the theme, so choosing a look for your cards and a look for
 * your table were the same decision. This unwelds them.
 *
 * A felt is a `[data-felt]` token block in tokens.css that overrides those four
 * variables (and, optionally, `--felt-texture`, an image layer the oval paints
 * over its gradient). Blocks sit BELOW every `[data-theme]` block, so source
 * order lets a chosen felt win.
 *
 * `house` is the default and declares NO block and NO attribute, exactly like
 * the `arcade` card skin and the `dark` theme: the active theme keeps full
 * control of the table until the player deliberately picks a surface.
 */
export const FELTS: readonly Cosmetic[] = [
  // ── Starters (free) ──
  { id: 'house', label: 'House Green', free: true },
  { id: 'tavern', label: 'Tavern Wood', free: true },
  // ── The ladder: level track + challenges, interleaved by effective
  //    difficulty, exactly as CARD_SKINS and THEMES do it. ──
  { id: 'arborite', label: 'Kitchen Arborite', ...atLevel(3) },
  {
    // ≈ level 4-5 — the felt you win on.
    id: 'casino',
    label: 'Casino Baize',
    free: false,
    unlock: (s) => s.wins >= 5,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Gagne 5 parties' : 'Win 5 games',
      have: s.wins,
      need: 5,
    }),
  },
  { id: 'rink', label: 'Rink Ice', ...atLevel(6) },
  {
    // ≈ level 9 — the mastery lane that has no crest deck of its own pays a
    // surface instead (the sans-atout SKIN is already spoken for at its own
    // grandfathered threshold; see mastery.ts).
    id: 'slate',
    label: 'Bare Slate',
    free: false,
    unlock: (s) => masteryUnlocked(s, 'sansAtout'),
    requirement: (s, lang: Lang) => masteryRequirement('sansAtout', s, lang),
  },
  { id: 'velvet', label: 'Midnight Velvet', ...atLevel(12) },
  { id: 'sugarbush', label: 'Sugar Shack', ...atLevel(16) },
];

/** Ids are open (the catalog grows) — validated against FELTS at runtime. */
export type FeltId = string;

export const DEFAULT_FELT = 'house';
const KEY = 'jaffre-felt';

/** Fired after the felt changes so React consumers re-render in place —
 * mirrors CARD_SKIN_EVENT / BONHOMME_SKIN_EVENT. */
export const FELT_EVENT = 'jaffre-felt';

export function currentFelt(): FeltId {
  const stored = localStorage.getItem(KEY);
  return FELTS.some((f) => f.id === stored) ? (stored as FeltId) : DEFAULT_FELT;
}

/** I1 — table-style view override (see overrideFelt). Never persisted. */
let feltOverride: FeltId | null = null;

function syncFeltAttribute(): void {
  const shown = feltOverride ?? currentFelt();
  if (shown === DEFAULT_FELT) delete document.documentElement.dataset['felt'];
  else document.documentElement.dataset['felt'] = shown;
}

/** Apply a felt: persist locally, toggle the <html> attribute (the default =
 * no attribute, exactly like the `arcade` skin and the `dark` theme), and
 * notify React consumers. Under an active table-style override the equip
 * still PERSISTS but the attribute keeps showing the override — equipping
 * from the table's CollectionSheet mid-game must not punch through the
 * host's look. */
export function applyFelt(id: FeltId): void {
  localStorage.setItem(KEY, id);
  syncFeltAttribute();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FELT_EVENT));
}

export function initFelt(): void {
  applyFelt(currentFelt());
}

/**
 * I1 — table-style house rule: a VIEW override, never a choice. `applyFelt`
 * above PERSISTS to localStorage — calling it here to show the host's felt
 * would silently overwrite every guest's own equip the moment the rule
 * turned on, and leave it overwritten after they left the table. This is why
 * the override is its own function rather than a call site passing a flag:
 * it only ever touches the `<html data-felt>` attribute (and fires the same
 * event, so consumers — the felt oval, any live preview — re-render), and
 * NOTHING here reads or writes `localStorage`. Passing `null` restores the
 * viewer's own equipped felt (`currentFelt()`) — the caller does this both
 * when the rule turns off and when the viewer leaves the room.
 */
export function overrideFelt(id: FeltId | null): void {
  // `house` is STILL the absence of the attribute (see the module doc) even
  // under an override — otherwise "the host wears house" would render as
  // literally no felt chosen rather than as the specific house-green felt.
  // The override is REMEMBERED (not applied once) so an applyFelt equip made
  // while it's active persists without punching through the display.
  feltOverride = id;
  syncFeltAttribute();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FELT_EVENT));
}
