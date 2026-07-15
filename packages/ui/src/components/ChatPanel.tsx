import { useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  readonly from: string;
  readonly text: string;
  readonly at: number;
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
}

const MAX_CHARS = 500;

function hhmm(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Room text chat: message list + input. Compact — shares space with the log. */
export function ChatPanel({ entries, onSend, collapsible = false }: ChatPanelProps) {
  const [open, setOpen] = useState(!collapsible);
  const [text, setText] = useState('');
  const [hint, setHint] = useState(false);
  const seenRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // While the panel is open every entry counts as read.
  if (open) seenRef.current = entries.length;
  const unread = open ? 0 : entries.length - seenRef.current;

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
    <div
      data-testid="chat-panel"
      className="flex w-full flex-col gap-1.5 rounded-(--radius-panel) border border-white/8 bg-black/25 p-2"
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-(--color-ivory)/45">
          Chat
        </span>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Collapse chat"
            className="rounded px-1.5 text-xs text-(--color-ivory)/50 hover:text-(--color-ivory) cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>
      <div
        ref={listRef}
        data-testid="chat-messages"
        role="region"
        aria-label="Chat messages"
        tabIndex={0}
        className="h-32 overflow-y-auto px-1 text-xs leading-5 text-(--color-ivory)/85"
      >
        {entries.length === 0 && <p className="text-(--color-ivory)/40">No messages yet.</p>}
        {entries.map((e, i) => (
          <p key={i} className="break-words">
            <span className="tabular-nums text-(--color-ivory)/40">{hhmm(e.at)}</span>{' '}
            <span className="font-bold text-(--color-lamplight)">{e.from}</span>{' '}
            <span>{e.text}</span>
          </p>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_CHARS}
          placeholder="Message…"
          aria-label="Chat message"
          data-testid="chat-input"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-(--color-ivory) placeholder:text-(--color-ivory)/30"
        />
        <button
          type="submit"
          className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-(--color-ivory)/80 hover:bg-white/8 cursor-pointer"
        >
          Send
        </button>
      </form>
      {hint && <p className="px-1 text-[11px] text-(--color-lamplight)/80">Slow down…</p>}
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
        data-testid="chat-toggle"
        className="relative rounded-lg border border-white/15 px-3 py-2 text-xs text-(--color-ivory)/75 hover:bg-white/8 cursor-pointer"
      >
        Chat
        {unread > 0 && (
          <span
            data-testid="chat-unread"
            className="absolute -top-2 -right-2 grid min-w-4.5 place-items-center rounded-full bg-(--color-lamplight) px-1 text-[10px] font-bold text-(--color-felt-950)"
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
