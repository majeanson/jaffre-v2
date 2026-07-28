import { DEFAULT_TRICK_SWEEP, TRICK_SWEEPS } from '@jaffre/ui';
import { playClick, type ClickKind } from './audio/clicks.js';
import { atLevel, type Cosmetic } from './cosmetics.js';

/**
 * Trick sweeps as a cosmetic — the FIFTH axis (themes / card skins / bonhommes
 * / felts / sweeps), and the only one made of motion instead of colour. The
 * variants themselves live in the devkit (`packages/ui/src/trickSweep.tsx`),
 * next to the component that runs them; this is just the unlock ladder and the
 * player's stored choice, in the same shape as every other axis.
 *
 * `sweep` is the default and free — it is what the table has always done, so
 * nobody has to opt in to keep what they had.
 */
export const SWEEPS: readonly Cosmetic[] = [
  { id: 'sweep', label: 'Classic Sweep', free: true },
  { id: 'fold', label: 'Dealer’s Fold', ...atLevel(4) },
  { id: 'snow-drift', label: 'Snow Drift', ...atLevel(9) },
  {
    // ≈ level 11 — the fast, contemptuous one: you only get to shove the cards
    // across the table once you've been taking a lot of them.
    id: 'riffle',
    label: 'Riffle',
    free: false,
    unlock: (s) => s.wins >= 15,
    requirement: (s, lang) => ({
      text: lang === 'fr' ? 'Gagne 15 parties' : 'Win 15 games',
      have: s.wins,
      need: 15,
    }),
  },
];

/**
 * The sound each variant makes when a trick leaves the table. Half of what
 * makes a sweep feel like its own thing — the motion and the sound are one
 * gesture, so they are chosen together and live next to each other.
 */
const SWEEP_SOUND: Readonly<Record<string, ClickKind>> = {
  sweep: 'sweep',
  fold: 'sweep-fold',
  'snow-drift': 'sweep-drift',
  riffle: 'sweep-riffle',
};

/** Play the equipped sweep's sound. Called once as a trick starts leaving. */
export function playSweepSound(): void {
  playClick(SWEEP_SOUND[currentSweep()] ?? 'sweep');
}

export const DEFAULT_SWEEP = DEFAULT_TRICK_SWEEP;
const KEY = 'jaffre-sweep';

/** Fired after the sweep changes so React consumers (App's provider) pick the
 * new variant up in place — mirrors CARD_SKIN_EVENT. */
export const SWEEP_EVENT = 'jaffre-sweep-change';

export function currentSweep(): string {
  const stored = localStorage.getItem(KEY);
  return SWEEPS.some((s) => s.id === stored) ? (stored as string) : DEFAULT_SWEEP;
}

/**
 * Apply a sweep. Unlike the token axes there is no `[data-*]` attribute to
 * toggle: the variant is a pure prop read through TrickSweepProvider, so this
 * persists the choice and lets the provider re-read it.
 */
export function applySweep(id: string): void {
  localStorage.setItem(KEY, id);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SWEEP_EVENT));
}

/** Guard: every catalog entry must name a variant the devkit actually ships,
 * or the tile would equip a sweep that silently falls back to the default. */
export function sweepCatalogIsSound(): boolean {
  const known = new Set(TRICK_SWEEPS.map((v) => v.id));
  return SWEEPS.every((c) => known.has(c.id));
}
