/** Shared "ghost" button chrome (bordered pill) used across the table and lobby.
 * Arcade shell: 2px ink border, hard shadow, panel-hover on hover. */
export const GHOST_BTN =
  'rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover) cursor-pointer';

/** Ghost button at utility-row size (Log toggle, Last trick, Add bot).
 * Fluid text + em padding: scales with the viewport like the cards. */
export const GHOST_BTN_SM = `${GHOST_BTN} bg-(--color-ap-panel) px-[1em] py-[0.66em] text-(length:--text-fluid-xs) font-arcade-display uppercase tracking-wide text-(--color-ap-text)`;

/** Ghost button on a permanently-dark pill (replay/scene bars): white text —
 * `--color-ivory`/`--color-ap-text` flip in the light skin and would vanish on
 * a surface that stays dark in every skin. */
export const GHOST_BTN_SM_DARK = `${GHOST_BTN} bg-(--color-ap-panel) px-[1em] py-[0.66em] text-(length:--text-fluid-xs) font-arcade-display uppercase tracking-wide text-white/85`;
