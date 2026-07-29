import { type CSSProperties } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { dailyChallenge } from '@jaffre/engine';
import { dailyPlayedId } from '../dailyPlayed.js';

const T: Record<Lang, { line: string }> = {
  en: { line: 'Today’s Hand of the Day is waiting.' },
  fr: { line: 'La main du jour t’attend.' },
};

/** Today's deal, still unplayed in this browser.
 *
 * Compared by CHALLENGE ID, not by date: the deal rolls at UTC midnight while
 * a player's "today" is local, so a date check would disagree with the board
 * for a few hours every night, somewhere in the world, always. */
function dailyDue(): boolean {
  try {
    return dailyPlayedId() !== dailyChallenge(Date.now()).id;
  } catch {
    return false;
  }
}

/**
 * One quiet row above the PLAY door pointing at today's hand.
 *
 * Deliberately NOT a badge inside the PLAY button. That slot is for urgency —
 * somebody is waiting on your turn — whereas an unplayed daily is true most
 * mornings, so it would sit there permanently and devalue the slot. It also
 * broke something concretely: badge text lives INSIDE the button, so the
 * button's accessible name stopped being "Play" and twelve e2e tests that
 * address it by name failed at once. Its own row costs nothing and says the
 * same thing.
 *
 * This is what answers DailyFirstWin's "see you tomorrow?" the next day — the
 * Hand of the Day is otherwise two taps deep, inside PLAY → BOTS.
 */
export function DailyDoor() {
  const t = T[useLang()];
  if (!dailyDue()) return null;
  return (
    <a
      href="#daily"
      data-testid="daily-door"
      className="rise-in flex items-center gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-2 font-arcade-ui text-(length:--text-fluid-xs) text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)"
      style={{ '--rise-delay': '40ms' } as CSSProperties}
    >
      <span aria-hidden className="shrink-0 text-(--color-ap-gold)">
        ★
      </span>
      <span className="min-w-0 flex-1">{t.line}</span>
      <span aria-hidden>→</span>
    </a>
  );
}
