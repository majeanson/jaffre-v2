/**
 * Escape is the B button. When something is open it closes that (the layer
 * stack owns it); when nothing is, it steps back out of the screen you are in.
 *
 * The list of screens it works on is a whitelist, not a rule, and deliberately
 * short: the meta screens, which you enter from Home and leave the same way.
 * A game, a lobby, a replay and the paint studio are all places you leave
 * on purpose — a stray Escape must never walk you out of a live table or
 * abandon unsaved pixels — so they are simply absent here.
 */

import { hasOpenLayers } from './layers.js';
import { isDesktopPointer } from './spatialNav.js';

/** Home, as the app writes it everywhere else (see App's onLeave handlers). */
const HOME = '';

const TO_CORNER = [
  '#journey',
  '#collection',
  '#awards',
  '#stats',
  '#history',
  '#leaderboard',
  '#daily',
  '#h2h',
];

/**
 * Where Escape goes from `hash`, or null when this screen doesn't answer to
 * it. Pure, so the map is a test rather than a click-through.
 */
export function backTarget(hash: string): string | null {
  // '#collection/noir' and '#h2h/<id>' are still the collection and a head to
  // head — match the segment, not the whole string.
  const base = hash.split('/')[0] ?? '';
  if (base === '#corner' || base === '#lobby') return HOME;
  if (TO_CORNER.includes(base)) return '#corner';
  return null;
}

/** True when a keystroke belongs to a text field rather than to navigation. */
function typingHere(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Handle Escape as "back". Returns true when it navigated. */
export function handleBackKey(e: KeyboardEvent): boolean {
  if (e.key !== 'Escape') return false;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  if (e.defaultPrevented) return false;
  if (!isDesktopPointer()) return false;
  // Anything open closes first: the layer stack for surfaces that have
  // migrated to it, and the open-modal test for those that haven't yet.
  if (hasOpenLayers()) return false;
  if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null) return false;
  if (typingHere()) return false;
  const target = backTarget(location.hash);
  if (target === null) return false;
  e.preventDefault();
  location.hash = target;
  return true;
}
