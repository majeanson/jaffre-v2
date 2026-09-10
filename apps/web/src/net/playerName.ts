/**
 * The player's display name.
 *
 * A leaf on purpose: this is the one piece of net/socket.ts that boot-time
 * code needs before anything is connected, and importing socket.ts for it
 * drags the whole store graph (and its localStorage reads at module load)
 * along with it. socket.ts re-exports both so existing callers are unchanged.
 */

const NAME_KEY = 'jaffre-name';

export function playerName(): string {
  return localStorage.getItem(NAME_KEY) ?? 'Player';
}

export function setPlayerName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}
