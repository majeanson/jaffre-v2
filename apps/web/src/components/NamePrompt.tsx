import { useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { setHelpLevel } from '../help/helpLevel.js';
import { playerName, setPlayerName } from '../net/socket.js';

const T: Record<
  Lang,
  {
    title: string;
    hint: string;
    placeholder: string;
    save: string;
    later: string;
    know: string;
    isNew: string;
    played: string;
  }
> = {
  en: {
    title: 'What should we call you?',
    hint: 'This is the name the table sees.',
    placeholder: 'Player',
    save: 'Save',
    later: 'Maybe later',
    know: 'Know the game?',
    isNew: 'I’m new — guide me',
    played: 'I’ve played before',
  },
  fr: {
    title: 'Comment on t’appelle?',
    hint: 'C’est le nom que la table voit.',
    placeholder: 'Joueur',
    save: 'Enregistrer',
    later: 'Plus tard',
    know: 'Tu connais le jeu?',
    // « Je débute » on purpose — dodges the gendered nouveau/nouvelle.
    isNew: 'Je débute — guide-moi',
    played: 'J’ai déjà joué',
  },
};

/** The two chips' dial positions: "I'm new" keeps the full teaching ladder,
 * "I've played before" turns advice off entirely (the picker's own copy for
 * 'off' is "Nothing. You know the game." — the same claim). Coach stays one
 * tap away in Settings/Options for a veteran who wants suggestions back. */
const EXPERIENCE = [
  { level: 'learning', key: 'isNew' },
  { level: 'off', key: 'played' },
] as const;

const LATCH_KEY = 'jaffre:namePrompt';

function latched(): boolean {
  try {
    return localStorage.getItem(LATCH_KEY) === '1';
  } catch {
    return false;
  }
}

function latch(): void {
  try {
    localStorage.setItem(LATCH_KEY, '1');
  } catch {
    // Storage unavailable — worst case the prompt shows again next time.
  }
}

/** Hidden under automation (same convention as the tutorial): the e2e suite
 * joins lobbies with fresh storage and would trip on a new card. `?nameprompt=1`
 * forces it on for the screenshot pass. */
function promptEnabled(): boolean {
  if (typeof navigator !== 'undefined' && navigator.webdriver) {
    return new URLSearchParams(location.search).get('nameprompt') === '1';
  }
  return true;
}

/**
 * Whether this browser still owes us a name.
 *
 * Exported because a caller may need to decide BEFORE rendering: the Deal
 * Board gates its play button on this, and a button that sometimes silently
 * did nothing would be worse than no gate at all.
 *
 * Gates on the NAME, not on the latch key's existence: Home writes 'Player'
 * verbatim the first time you tap any play action, so a key check would mean
 * this never fired for the very players it exists for.
 */
export function namePromptDue(): boolean {
  return promptEnabled() && !latched() && playerName() === 'Player';
}

/**
 * One-shot card for players still carrying the default name: a single field,
 * save or skip, never shown again once answered either way.
 *
 * Deliberately NOT room-specific (it used to live in room/). The lobby was the
 * only place that asked, which meant every other way a name reaches other
 * people — the daily board, spectator chat, a mid-game seat takeover — could
 * never trigger it. The server now disambiguates unnamed guests on its own
 * (see `displayName` server-side), so this card is an invitation rather than a
 * last line of defence, and "Maybe later" is a safe answer.
 *
 * `onDone` fires after either outcome, carrying whether a real rename
 * happened: the lobby reconnects only on true (names travel at connect-time),
 * while the Deal Board proceeds into the hand either way.
 */
export function NamePrompt({
  onDone,
  forceOpen = false,
}: {
  readonly onDone?: (renamed: boolean) => void;
  /** Scene viewer: render regardless of latch/automation state, so the card
   * gets a screenshot and an axe pass it could never earn by being clicked
   * (`promptEnabled()` is false under webdriver). */
  readonly forceOpen?: boolean;
}) {
  const t = T[useLang()];
  const [gone, setGone] = useState(() => !forceOpen && !namePromptDue());
  const [value, setValue] = useState('');
  // The experience chips apply ON TAP (setHelpLevel is idempotent and cheap;
  // tap the other to change your mind), so Save and "Maybe later" never need
  // to touch the dial — skipping leaves whatever was last tapped, or nothing.
  // No pre-selection: the boot level is an INFERENCE (helpLevel.ts's
  // placement rule), and a pre-lit chip would read as "you already answered".
  const [picked, setPicked] = useState<'learning' | 'off' | null>(null);
  if (gone) return null;

  const finish = (renamed: boolean): void => {
    latch();
    setGone(true);
    onDone?.(renamed);
  };
  const save = (): void => {
    const name = value.trim();
    if (name === '' || name === playerName()) {
      finish(false);
      return;
    }
    setPlayerName(name);
    finish(true);
  };

  return (
    <form
      data-testid="name-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-2 rounded-(--radius-ap-control) border-2 border-(--color-ap-violet)/60 bg-(--color-ap-panel) px-4 py-3 font-arcade-ui shadow-(--shadow-ap)"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-arcade-display text-sm uppercase tracking-wide text-(--color-ap-text)">
          {t.title}
        </span>
        <button
          type="button"
          onClick={() => finish(false)}
          className="shrink-0 cursor-pointer text-xs text-(--color-ap-muted) underline decoration-dotted underline-offset-2 hover:text-(--color-ap-text)"
        >
          {t.later}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={20}
          placeholder={t.placeholder}
          aria-label={t.title}
          className="min-w-0 flex-1 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel-hover) px-3 py-2 text-(--color-ap-text) outline-none placeholder:text-(--color-ap-muted) focus:border-(--color-ap-violet)"
        />
        <button
          type="submit"
          className="shrink-0 cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-gold) px-4 py-2 font-arcade-display text-xs uppercase text-(--color-ap-ink) shadow-(--shadow-ap-sm) hover:brightness-105"
        >
          {t.save}
        </button>
      </div>
      <p className="text-xs text-(--color-ap-muted)">{t.hint}</p>
      {/* "I'm new / I've played before" — the one moment the app ASKS instead
          of inferring the help dial. It rides this card because both questions
          arrive at the same time (your first brush with other people), and a
          second one-shot card would fail the one-start-here-slot rule.
          Gold-on-ink selected state, same as HelpLevelPicker's segments. */}
      <div className="flex flex-wrap items-center gap-2 border-t-2 border-(--color-ap-ink)/20 pt-2">
        <span className="font-arcade-display text-xs uppercase tracking-wide text-(--color-ap-muted)">
          {t.know}
        </span>
        {EXPERIENCE.map(({ level, key }) => (
          <button
            key={level}
            type="button"
            aria-pressed={picked === level}
            onClick={() => {
              setHelpLevel(level);
              setPicked(level);
            }}
            className={`cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-2.5 py-1.5 text-xs shadow-(--shadow-ap-sm) ${
              picked === level
                ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
                : 'bg-(--color-ap-panel-hover) text-(--color-ap-text) hover:brightness-110'
            }`}
          >
            {t[key]}
          </button>
        ))}
      </div>
    </form>
  );
}
