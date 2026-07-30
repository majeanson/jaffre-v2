/**
 * Arrow keys move focus across whatever is on screen — the gameboy d-pad.
 * Enter and Space are deliberately untouched: the focused button, link or
 * hand card activates natively, which is why nothing needs a keyboard prop.
 *
 * The engine listens on window in the BUBBLE phase, so every component-level
 * handler on the path runs first. That is the whole integration story: a
 * component that already owns an arrow (react-aria's hand listbox, a range
 * slider) calls preventDefault, the engine sees defaultPrevented and stands
 * down. Nothing has to register, and nothing has to be taught about the
 * engine.
 *
 * Three escape hatches exist for what preventDefault can't express:
 *   data-nav="skip"        — element/subtree is not a destination (focusables.ts)
 *   data-nav-own-arrows    — focus inside this subtree keeps its own arrows
 *   data-nav-suspend       — a screen owns arrows outright (replay scrubbing);
 *                            it lives on window too, where bubble order can't
 *                            protect it.
 *
 * Desktop only, and checked per keystroke rather than subscribed: a device
 * without a fine pointer never gets a focus cursor it cannot see.
 */

import { useEffect } from 'react';
import { bestCandidate, type NavDir, type NavRect } from './geometry.js';
import { collectFocusables, defaultIsVisible, getScopeRoot, type IsVisible } from './focusables.js';
import { handleBackKey } from './backNav.js';

const DIRS: Readonly<Record<string, NavDir>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** Input types that are buttons in disguise — arrows mean nothing to them. */
const BUTTON_INPUTS = new Set(['checkbox', 'button', 'submit', 'reset', 'radio', 'image']);

const DESKTOP_QUERY = '(hover: hover) and (pointer: fine)';

let desktopMql: MediaQueryList | null = null;

/** Live desktop test — matchMedia stays current on its own, no subscription. */
export function isDesktopPointer(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  desktopMql ??= window.matchMedia(DESKTOP_QUERY);
  return desktopMql.matches;
}

export interface NavDeps {
  readonly getRect: (el: HTMLElement) => NavRect;
  readonly isVisible: IsVisible;
}

const DOM_DEPS: NavDeps = {
  getRect: (el) => el.getBoundingClientRect(),
  isVisible: defaultIsVisible,
};

/** True when the focused element handles arrows itself. */
function focusOwnsArrows(active: Element | null): boolean {
  if (!(active instanceof HTMLElement)) return false;
  if (active.isContentEditable) return true;
  if (active.closest('[data-nav-own-arrows]') !== null) return true;
  const tag = active.tagName;
  if (tag === 'SELECT' || tag === 'TEXTAREA') return true;
  if (active instanceof HTMLInputElement) return !BUTTON_INPUTS.has(active.type);
  return tag === 'INPUT';
}

/**
 * Move focus one step in `dir`. Returns true when focus moved — the caller
 * only swallows the key then, so an arrow at the edge of a long screen still
 * scrolls the page.
 */
export function navigate(dir: NavDir, deps: NavDeps = DOM_DEPS): boolean {
  const root = getScopeRoot(deps.isVisible);
  const active = document.activeElement;
  const candidates = collectFocusables(root, deps.isVisible);
  if (candidates.length === 0) return false;

  // Coming from outside the scope — a fresh screen, or a sheet that just
  // opened: enter at the near end rather than guessing a geometric origin.
  if (!(active instanceof HTMLElement) || !root.contains(active) || active === root) {
    const entry =
      dir === 'up' || dir === 'left' ? candidates[candidates.length - 1] : candidates[0];
    if (entry === undefined) return false;
    entry.focus();
    entry.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  const others = candidates.filter((el) => el !== active);
  if (others.length === 0) return false;
  const index = bestCandidate(
    deps.getRect(active),
    others.map((el) => deps.getRect(el)),
    dir,
  );
  if (index === null) return false;
  const next = others[index];
  if (next === undefined) return false;
  next.focus();
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

/** The keydown decision, exported whole so tests can drive it without a React tree. */
export function handleKey(e: KeyboardEvent, deps: NavDeps = DOM_DEPS): boolean {
  // e.repeat is allowed through: holding a direction should keep moving.
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  const dir = DIRS[e.key];
  if (dir === undefined) return false;
  if (!isDesktopPointer()) return false;
  if (e.defaultPrevented) return false;
  if (focusOwnsArrows(document.activeElement)) return false;
  if (document.querySelector('[data-nav-suspend]') !== null) return false;
  if (!navigate(dir, deps)) return false;
  e.preventDefault();
  return true;
}

/**
 * Mount once, in App. Also flags the document while the keyboard is driving,
 * so the focus cursor can be loud for keyboard users without ever appearing
 * for a mouse.
 *
 * The flag goes up only for moves the engine itself made. That is what keeps
 * the loud cursor off the felt: roving the hand is react-aria's arrow, not
 * ours, and a card already says it is focused by lifting out of the fan — a
 * violet halo there would only compete with the Coach's own violet ring.
 */
export function useSpatialNav(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Escape backs out of a screen only when nothing is open to close —
      // the layer stack gets first refusal, inside handleBackKey.
      if (handleBackKey(e)) {
        document.documentElement.dataset.kbNav = '1';
        return;
      }
      if (handleKey(e)) {
        document.documentElement.dataset.kbNav = '1';
      }
    };
    const onPointerDown = (): void => {
      delete document.documentElement.dataset.kbNav;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);
}
