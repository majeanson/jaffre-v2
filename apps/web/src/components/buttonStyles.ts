/** Shared "ghost" button chrome (bordered pill) used across the table and lobby. */
export const GHOST_BTN = 'rounded-lg border border-white/15 hover:bg-white/8 cursor-pointer';

/** Ghost button at utility-row size (Log toggle, Last trick, Add bot). */
export const GHOST_BTN_SM = `${GHOST_BTN} px-3 py-2 text-xs text-(--color-ivory)/75`;

/** Ghost button on a permanently-dark pill (replay/scene bars): white text —
 * `--color-ivory` flips dark in the light skin and would vanish on black. */
export const GHOST_BTN_SM_DARK = `${GHOST_BTN} px-3 py-2 text-xs text-white/80`;
