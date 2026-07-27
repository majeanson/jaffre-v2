import { useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { connect, playerName, setPlayerName } from '../net/socket.js';

const T: Record<
  Lang,
  { title: string; hint: string; placeholder: string; save: string; later: string }
> = {
  en: {
    title: 'What should we call you?',
    hint: 'This is the name the table sees.',
    placeholder: 'Player',
    save: 'Save',
    later: 'Maybe later',
  },
  fr: {
    title: 'Comment on t’appelle?',
    hint: 'C’est le nom que la table voit.',
    placeholder: 'Joueur',
    save: 'Enregistrer',
    later: 'Plus tard',
  },
};

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
    // Storage unavailable — worst case the prompt shows again next lobby.
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
 * One-shot lobby card for players still carrying the default name: a single
 * field, save or skip. Saving persists the name and reconnects the room socket
 * so the rename rides the fresh identity (there is no rename message — names
 * travel at connect). Never shows again once answered or skipped.
 */
export function NamePrompt({ code }: { readonly code: string }) {
  const t = T[useLang()];
  const [gone, setGone] = useState(
    () => !promptEnabled() || latched() || localStorage.getItem('jaffre-name') !== null,
  );
  const [value, setValue] = useState('');
  if (gone) return null;

  const dismiss = (): void => {
    latch();
    setGone(true);
  };
  const save = (): void => {
    const name = value.trim();
    if (name === '' || name === playerName()) {
      dismiss();
      return;
    }
    setPlayerName(name);
    latch();
    setGone(true);
    // Reconnect so the new name rides the identity token; the welcome
    // snapshot restores the room state (and any seat) seamlessly.
    connect(code);
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
          onClick={dismiss}
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
    </form>
  );
}
