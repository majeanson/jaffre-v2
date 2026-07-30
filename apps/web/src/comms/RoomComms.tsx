import { useEffect, useRef, useState } from 'react';
import { ARCADE, ChatPanel, useLang, type Lang } from '@jaffre/ui';
import { useChatSend } from '../chat/useChatSend.js';
import { MusicQueuePanel } from '../music/MusicQueuePanel.js';
import { useDismissLayer } from '../keys/layers.js';
import { useGameStore } from '../state/gameStore.js';
import { useMusicStore } from '../state/musicStore.js';
import { VoiceControls } from '../voice/VoiceControls.js';

const T: Record<Lang, { comms: string; chat: string; music: string }> = {
  en: { comms: 'Chat & music', chat: 'Chat', music: 'Music' },
  fr: { comms: 'Clavardage et musique', chat: 'Clavardage', music: 'Musique' },
};

type Tab = 'chat' | 'music';

/** Same-tab signal to open/close the popover — lets the table's keyboard
 * shortcut reach this component's own local open state. */
const TOGGLE_EVENT = 'jaffre:toggle-comms';

/** Toggle the room-comms popover (the "C" shortcut at the table). */
export function toggleRoomComms(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TOGGLE_EVENT));
}

export interface RoomCommsProps {
  /** Your absolute seat, or null (spectator). Gates voice and the skip vote. */
  readonly me: number | null;
  /** 'popover': a toggle cell for the table's utility bar. 'panel': always
   * open, for the lobby. Same tabbed surface either way. */
  readonly variant: 'popover' | 'panel';
  /** Popover only: mount already open (scene viewer parity). */
  readonly defaultOpen?: boolean;
  /** Which tab starts active (scene viewer parity; default 'chat'). */
  readonly defaultTab?: Tab;
}

/**
 * The one room-comms surface — text chat (with voice controls in its send
 * row) and the shared music queue as tabs — reused by the Lobby and the
 * in-game table so every room screen gets the same social layer. The actual
 * YouTube player lives in the App-level MusicDock; the music tab only drives
 * the shared store.
 */
export function RoomComms({
  me,
  variant,
  defaultOpen = false,
  defaultTab = 'chat',
}: RoomCommsProps) {
  const t = T[useLang()];
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [open, setOpen] = useState(variant === 'panel' || defaultOpen);
  const chat = useGameStore((s) => s.chat);
  const sendChat = useChatSend();
  const musicState = useMusicStore((s) => s.state);
  const seenRef = useRef(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // System lines (sat/left/dropped/botPlaying/back/started) are table
  // narration, not a person messaging you — they must never trip the badge.
  const humanChat = chat.filter((e) => e.system === undefined).length;
  // While the surface is open, every chat entry counts as read.
  if (open) seenRef.current = humanChat;
  const unread = open ? 0 : humanChat - seenRef.current;
  const nowPlaying = musicState?.current != null;

  // Same seenRef idea for the Music tab: while it's the active tab, the
  // queue's current length counts as seen. A song added while you're parked
  // on Chat leaves the count stale, so the tab gets its own unread dot.
  const queueLen = musicState?.queue.length ?? 0;
  const musicSeenRef = useRef(queueLen);
  if (tab === 'music') musicSeenRef.current = queueLen;
  const musicUnread = tab !== 'music' && queueLen > musicSeenRef.current;

  // The keyboard shortcut lives at the table but the open state lives here.
  useEffect(() => {
    if (variant !== 'popover') return undefined;
    const onToggle = (): void => setOpen((o) => !o);
    window.addEventListener(TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_EVENT, onToggle);
  }, [variant]);

  // Popover: Escape closes and returns focus to the toggle (same contract the
  // collapsible ChatPanel used to provide) — through the app-wide layer stack,
  // so it closes only this and only when it is the topmost thing open. No Tab
  // trap and no focus grab: the chat input is a place you go on purpose, and
  // taking the keyboard on open would fight the felt.
  useDismissLayer(
    popRef,
    () => {
      setOpen(false);
      toggleRef.current?.focus();
    },
    {
      enabled: variant === 'popover' && open,
      initialFocus: () => null,
      restoreFocus: false,
    },
  );

  const tabButton = (which: Tab, label: string) => (
    <button
      type="button"
      data-testid={`comms-tab-${which}`}
      aria-pressed={tab === which}
      onClick={() => setTab(which)}
      className={`relative cursor-pointer rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) px-2.5 py-1 font-arcade-display text-[0.65em] uppercase tracking-wide shadow-(--shadow-ap-sm) transition-colors ${
        tab === which
          ? 'bg-(--color-ap-violet) text-(--color-ap-ink)'
          : 'bg-(--color-ap-panel) text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)'
      }`}
    >
      {label}
      {which === 'music' && nowPlaying && (
        <span aria-hidden className="ml-1 inline-block animate-pulse">
          ♪
        </span>
      )}
      {which === 'music' && musicUnread && (
        <span
          aria-hidden
          data-testid="music-tab-unread"
          className="absolute -top-1 -right-1 size-2 rounded-full bg-(--color-ap-gold)"
        />
      )}
    </button>
  );

  const surface = (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {tabButton('chat', t.chat)}
        {tabButton('music', t.music)}
      </div>
      {tab === 'chat' ? (
        <ChatPanel
          entries={chat}
          onSend={sendChat}
          actions={me !== null ? <VoiceControls me={me} /> : undefined}
        />
      ) : (
        <div className={ARCADE.panel}>
          <MusicQueuePanel me={me} />
        </div>
      )}
    </div>
  );

  if (variant === 'panel') return surface;

  return (
    <div className="relative">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t.comms}
        title={t.comms}
        data-testid="chat-toggle"
        className={`relative cursor-pointer ${ARCADE.iconBtnCell} ${
          open
            ? 'bg-(--color-ap-violet) text-(--color-ap-ink)'
            : 'text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)'
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
        {/* No "music is playing" badge here: the MusicDock pill in the corner
            is that signal, and two of them 30px apart read as two features. */}
      </button>
      {open && (
        // Soft scrim (same treatment as the game log): the popover floats over
        // the live trick and seat chips — dim them and let a tap dismiss.
        <div
          aria-hidden
          className="fixed inset-0 z-20 bg-black/30"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        // Desktop: popover above the toggle. Narrow screens: a bottom sheet
        // pinned to the viewport so it never overflows the 390px layout.
        <div
          ref={popRef}
          className="absolute right-0 bottom-full z-30 mb-2 w-72 max-sm:fixed max-sm:inset-x-2 max-sm:bottom-2 max-sm:mb-0 max-sm:w-auto"
        >
          {surface}
        </div>
      )}
    </div>
  );
}
