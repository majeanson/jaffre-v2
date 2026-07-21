/**
 * A distinct pixel avatar per seat for bot players. The four starter sprites
 * (General, top hat, smiley, heart) are pre-serialized to data URLs once, one
 * per seat, so a table of bots never shows four look-alike initial tokens —
 * each bot wears its own little character.
 */
import { gridToDataUrl } from './svg.js';
import { TEMPLATES } from './templates.js';

const BOT_AVATARS: readonly string[] = TEMPLATES.map((tpl) => gridToDataUrl(tpl.grid));

/** The pixel avatar for the bot at `seat` (0-3), cycling if seats exceed sprites. */
export function botAvatar(seat: number): string {
  const n = BOT_AVATARS.length;
  return BOT_AVATARS[((seat % n) + n) % n] as string;
}
