/**
 * Being embedded by another app.
 *
 * dads (dads.marcportal.com) frames Jaffre beside its chat so a group can talk
 * and play at the same table. This module is the whole contract, and it is
 * deliberately one-way in each direction:
 *
 *   in  — `?name=` seeds the player's name so nobody types it twice, and
 *         `?from=dads` marks where the player came from.
 *   out — a handful of postMessage events describing what happened at the
 *         table, so the embedder can narrate it in its own chat.
 *
 * Nothing here changes how the game plays, and nothing outside this file
 * needs to know an embedder exists.
 */

import { setPlayerName } from './net/playerName.js';

/** Who is allowed to frame us and receive table events. */
const DADS_ORIGIN = 'https://dads.marcportal.com';

/** Matches NameField/NamePrompt's own maxLength — an embedder must not be
 * able to set a name the app itself would refuse. */
const MAX_NAME = 20;

export const EMBED_BRIDGE_VERSION = 1;

export type TableEvent =
  | { v: 1; t: 'ready' }
  | { v: 1; t: 'seated'; name: string }
  | { v: 1; t: 'left'; name: string }
  | { v: 1; t: 'game-started' }
  | { v: 1; t: 'game-over'; summary: string };

function isLocal(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/** Running inside someone else's page. */
export function isEmbedded(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    // Cross-origin access to window.top throwing is itself proof of framing.
    return true;
  }
}

/**
 * The origin to post table events to, or null if we should stay quiet.
 *
 * Taken from the referrer rather than from a URL parameter so a page cannot
 * nominate someone else as the recipient, and checked against the allowlist
 * either way. A localhost embedder is only trusted by a localhost Jaffre, so
 * the deployed game never narrates itself to a page on someone's laptop.
 */
export function embedderOrigin(): string | null {
  if (!isEmbedded()) return null;
  let origin: string;
  try {
    origin = new URL(document.referrer).origin;
  } catch {
    return null;
  }
  if (origin === DADS_ORIGIN) return origin;
  if (isLocal(location.origin) && isLocal(origin)) return origin;
  return null;
}

/**
 * Where the player came from, if anywhere we know.
 *
 * Read lazily from the query string on every call, matching how the app's
 * other URL flags work, and deliberately NOT stripped from the URL: it has to
 * survive a reload for the way back to keep working.
 */
export function cameFrom(): 'dads' | null {
  return new URLSearchParams(location.search).get('from') === 'dads' ? 'dads' : null;
}

/** Where "back" goes, or null when there is nowhere to go back to. */
export function backLink(): string | null {
  return cameFrom() === 'dads' ? DADS_ORIGIN : null;
}

/**
 * Adopt anything the embedder put in the URL. Must run before the router and
 * before Home mints a guest token, or the token is minted for 'Player' and the
 * name arrives too late to matter.
 */
export function consumeEmbedParams(): void {
  const name = new URLSearchParams(location.search).get('name')?.trim();
  if (name !== undefined && name !== '') setPlayerName(name.slice(0, MAX_NAME));
}

/**
 * Tell the embedder what just happened. No-ops entirely when nobody is
 * listening, which is the normal case.
 */
export function emitTableEvent(event: TableEvent): void {
  const origin = embedderOrigin();
  if (origin === null) return;
  try {
    window.parent.postMessage(event, origin);
  } catch {
    // A frame that has gone away is not an error worth surfacing.
  }
}

/** Team 0 and team 1, in the order `scores` reports them. */
const TEAM_NAMES = ['Sun', 'Moon'] as const;

/**
 * Final score, as a line an embedder can print without knowing the rules.
 * `winner` is engine's Team (0 | 1), so it is compared against null rather
 * than tested for truthiness — team 0 winning is not "no winner".
 */
export function scoreSummary(scores: readonly [number, number], winner: 0 | 1 | null): string {
  const line = `${scores[0]}–${scores[1]}`;
  return winner === null ? line : `${line}, ${TEAM_NAMES[winner]} win`;
}
