import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLang, type Lang } from '../i18n.js';
import { ARCADE } from './arcade.js';

const T: Record<
  Lang,
  {
    chat: string;
    collapse: string;
    messages: string;
    empty: string;
    placeholder: string;
    inputLabel: string;
    send: string;
    slowDown: string;
    quickLabel: string;
    quick: readonly string[];
    watching: string;
    /** System-entry lines — code + name in, sentence out. Kept invariant
     * under fr gender (no "assis(e)"/"déconnecté(e)" agreement): the server
     * has no idea who's masculine or feminine, so every verb here is phrased
     * so it never needs to know either. */
    system: {
      sat: (name: string) => string;
      left: (name: string) => string;
      dropped: (name: string) => string;
      botPlaying: (name: string) => string;
      back: (name: string) => string;
      started: string;
    };
  }
> = {
  en: {
    chat: 'Chat',
    collapse: 'Collapse chat',
    messages: 'Chat messages',
    empty: 'No messages yet.',
    placeholder: 'Message…',
    inputLabel: 'Chat message',
    send: 'Send',
    slowDown: 'Slow down…',
    quickLabel: 'Quick messages',
    quick: [
      '👍',
      '😅',
      '🎉',
      '😮',
      'Nice one!',
      'Good game',
      'Ouch',
      'Your turn',
      'One sec',
      'Sorry',
    ],
    watching: 'watching',
    system: {
      sat: (name) => `${name} sat down.`,
      left: (name) => `${name} left.`,
      dropped: (name) => `${name} dropped.`,
      botPlaying: (name) => `A bot is playing ${name}'s hand.`,
      back: (name) => `${name} is back.`,
      started: 'Game on.',
    },
  },
  fr: {
    chat: 'Clavardage',
    collapse: 'Replier le clavardage',
    messages: 'Messages du clavardage',
    empty: 'Pas encore de messages.',
    placeholder: 'Message…',
    inputLabel: 'Message de clavardage',
    send: 'Envoyer',
    slowDown: 'Doucement…',
    quickLabel: 'Messages rapides',
    quick: [
      '👍',
      '😅',
      '🎉',
      '😮',
      'Belle passe!',
      'Belle partie',
      'Ayoye',
      'À ton tour',
      'Une minute',
      'Désolé',
    ],
    watching: 'regarde',
    system: {
      sat: (name) => `${name} prend place à la table.`,
      left: (name) => `${name} quitte la table.`,
      dropped: (name) => `${name} a perdu la connexion.`,
      botPlaying: (name) => `Un bot joue la main de ${name}.`,
      back: (name) => `${name} est de retour.`,
      started: 'La partie commence !',
    },
  },
};

export interface ChatMessage {
  readonly from: string;
  readonly text: string;
  readonly at: number;
  /** Sender's seat (0-3), so the name can be coloured like the felt does.
   * Absent for spectators and for entries persisted before this field existed. */
  readonly seat?: number;
  /** A table-moment notice (sat/left/dropped/botPlaying/back/started) rather
   * than a human message — rendered as a muted, centered line instead of a
   * bubble. See @jaffre/protocol's ChatEntry.system for the wire contract. */
  readonly system?: {
    readonly code: 'sat' | 'left' | 'dropped' | 'botPlaying' | 'back' | 'started';
    readonly name?: string;
  };
}

export interface ChatPanelProps {
  readonly entries: readonly ChatMessage[];
  /** Return false to reject the message (e.g. throttled) — shows a "slow down" hint. */
  readonly onSend: (text: string) => boolean;
  /**
   * When true (table) the panel collapses to a "Chat" button with an unread
   * badge, expanding upward as a popover. When false (lobby) it is always open.
   */
  readonly collapsible?: boolean;
  /** Collapsible only: mount with the popover already open (scene viewer). */
  readonly defaultOpen?: boolean;
  /** Collapsible only: render the toggle as a borderless cell of a shared
   * button bar (the bar brings the border/shadow). */
  readonly plainToggle?: boolean;
  /** Extra controls in the send row, after the Send button (e.g. voice). */
  readonly actions?: ReactNode;
}

const MAX_CHARS = 500;

function hhmm(at: number, lang: Lang): string {
  const d = new Date(at);
  return d.toLocaleTimeString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Localize a system entry's code (+ name) into the sentence ChatPanel shows
 * — the server never ships prose, only this. */
function systemLine(t: (typeof T)['en'], system: NonNullable<ChatMessage['system']>): string {
  const name = system.name ?? '';
  switch (system.code) {
    case 'sat':
      return t.system.sat(name);
    case 'left':
      return t.system.left(name);
    case 'dropped':
      return t.system.dropped(name);
    case 'botPlaying':
      return t.system.botPlaying(name);
    case 'back':
      return t.system.back(name);
    case 'started':
      return t.system.started;
  }
}

/** Room text chat: message list + input. Compact — shares space with the log. */
export function ChatPanel({
  entries,
  onSend,
  collapsible = false,
  defaultOpen = false,
  plainToggle = false,
  actions,
}: ChatPanelProps) {
  const lang = useLang();
  const t = T[lang];
  const [open, setOpen] = useState(!collapsible || defaultOpen);
  const [text, setText] = useState('');
  const [hint, setHint] = useState(false);
  const seenRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // System lines (sat/left/dropped/…) are table narration, not a message
  // from a person — they must never trip the unread badge.
  const humanEntries = entries.filter((e) => e.system === undefined).length;
  // While the panel is open every entry counts as read.
  if (open) seenRef.current = humanEntries;
  const unread = open ? 0 : humanEntries - seenRef.current;

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [entries.length, open]);

  useEffect(
    () => () => {
      if (hintTimer.current !== null) clearTimeout(hintTimer.current);
    },
    [],
  );

  // Collapsible popover: Escape closes it and hands focus back to the toggle,
  // so the keyboard never gets stranded inside the panel.
  useEffect(() => {
    if (!collapsible || !open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [collapsible, open]);

  /** Send a canned phrase straight out — same throttle path as typing, so a
   * tap-happy player gets the same "slow down" hint. */
  const sendQuick = (phrase: string) => {
    if (onSend(phrase)) setHint(false);
    else {
      setHint(true);
      if (hintTimer.current !== null) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), 1500);
    }
  };

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    if (onSend(trimmed)) {
      setText('');
      setHint(false);
    } else {
      setHint(true);
      if (hintTimer.current !== null) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), 1500);
    }
  };

  const panel = (
    <div data-testid="chat-panel" className={`${ARCADE.panel} flex w-full flex-col gap-1.5 p-2`}>
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-(--color-ap-muted)">
          {t.chat}
        </span>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t.collapse}
            className="rounded px-1.5 text-xs text-(--color-ap-muted) hover:text-(--color-ap-text) cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>
      <div
        ref={listRef}
        data-testid="chat-messages"
        role="region"
        aria-label={t.messages}
        tabIndex={0}
        className="h-32 overflow-y-auto px-1 text-xs leading-5 text-(--color-ap-text)"
      >
        {entries.length === 0 && <p className="text-(--color-ap-muted)">{t.empty}</p>}
        {entries.map((e, i) =>
          e.system !== undefined ? (
            // Table narration, not a person talking — muted, centered, no
            // name/timestamp bubble, so it reads as the room's own voice.
            <p key={i} className="my-1 text-center text-[11px] text-(--color-ap-muted)">
              {systemLine(t, e.system)}
            </p>
          ) : (
            <p key={i} className="break-words">
              <span className="tabular-nums text-(--color-ap-muted)">{hhmm(e.at, lang)}</span>{' '}
              <span
                className="font-bold text-(--color-ap-violet-soft)"
                style={
                  typeof e.seat === 'number'
                    ? { color: e.seat % 2 === 0 ? 'var(--color-team-a)' : 'var(--color-team-b)' }
                    : undefined
                }
              >
                {e.from}
              </span>
              {/* A seatless entry is a spectator's — the only other kind of
                  seatless line is a system one, handled in the branch above. */}
              {e.seat === undefined && (
                <span className="text-[10px] text-(--color-ap-muted)"> ({t.watching})</span>
              )}{' '}
              <span>{e.text}</span>
            </p>
          ),
        )}
      </div>
      {/* One tap to say the usual things: free-text-only chat is a wall on a
          phone mid-trick, and canned phrases keep the room civil. */}
      <div
        role="group"
        aria-label={t.quickLabel}
        data-testid="chat-quick"
        className="flex flex-wrap gap-1 px-1"
      >
        {t.quick.map((phrase) => (
          <button
            key={phrase}
            type="button"
            onClick={() => sendQuick(phrase)}
            className="cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-1.5 py-0.5 text-[11px] text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)"
          >
            {phrase}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-wrap items-center gap-1.5"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_CHARS}
          placeholder={t.placeholder}
          aria-label={t.inputLabel}
          data-testid="chat-input"
          className="min-w-0 flex-1 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-2.5 py-1.5 text-xs text-(--color-ap-text) placeholder:text-(--color-ap-muted)"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) px-3 py-1.5 font-arcade-display text-[0.7em] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) transition-[transform,box-shadow] duration-(--duration-flick) hover:bg-(--color-ap-panel-hover) active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          {t.send}
        </button>
        {/* Voice (or other controls) live in the send row; the live voice bar
            wraps to its own full-width line when it grows chips. */}
        {actions}
      </form>
      {hint && <p className="px-1 text-[11px] text-(--color-ap-gold)">{t.slowDown}</p>}
    </div>
  );

  if (!collapsible) return panel;

  return (
    <div className="relative">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t.chat}
        title={t.chat}
        data-testid="chat-toggle"
        className={`relative cursor-pointer ${plainToggle ? ARCADE.iconBtnCell : ARCADE.iconBtnBase} ${
          open
            ? 'bg-(--color-ap-violet) text-(--color-ap-ink)'
            : plainToggle
              ? 'text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)'
              : ARCADE.iconBtnNeutral
        }`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-[1.2em]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z" />
        </svg>
        {unread > 0 && (
          <span
            data-testid="chat-unread"
            className="absolute -top-2 -right-2 grid min-w-4.5 place-items-center rounded-full bg-(--color-ap-gold) px-1 text-[10px] font-bold text-(--color-ap-ink)"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        // Desktop: popover above the toggle. Narrow screens: a bottom sheet
        // pinned to the viewport so it never overflows the 390px layout.
        <div className="absolute right-0 bottom-full z-30 mb-2 w-72 max-sm:fixed max-sm:inset-x-2 max-sm:bottom-2 max-sm:mb-0 max-sm:w-auto">
          {panel}
        </div>
      )}
    </div>
  );
}
