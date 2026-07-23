import type { ReactNode } from 'react';

/**
 * Minimal stroke icon set (Phosphor-style geometry, drawn inline — no icon
 * dependency). Every icon is 1em square and inherits currentColor, so the
 * IconButton tint and fluid sizing do all the styling work.
 */
function Svg({ children }: { children: ReactNode }) {
  return (
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
      {children}
    </svg>
  );
}

/** Leave the table: arrow out of a doorway. */
export function IconSignOut() {
  return (
    <Svg>
      <path d="M9 4H5v16h4" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9" />
    </Svg>
  );
}

/** Auto-play: a friendly bot head — a bot covers your turns while you're away. */
export function IconRobot() {
  return (
    <Svg>
      <rect x="5" y="8" width="14" height="10" rx="2.5" />
      <path d="M12 5.5V8" />
      <circle cx="12" cy="4.2" r="1.2" />
      <path d="M9.5 12.5h.01M14.5 12.5h.01" />
      <path d="M3.5 12v3M20.5 12v3" />
    </Svg>
  );
}

/** Swap seats: two arrows trading places. */
export function IconSwap() {
  return (
    <Svg>
      <path d="M4 8h13" />
      <path d="M14 5l3 3-3 3" />
      <path d="M20 16H7" />
      <path d="M10 13l-3 3 3 3" />
    </Svg>
  );
}

/** Remove / close: an X. */
export function IconX() {
  return (
    <Svg>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

/** Options: a cogwheel — teeth cut into the rim, not detached rays (that read
 * as a sun next to the felt's sun/moon team glyphs). */
export function IconGear() {
  return (
    <Svg>
      <path d="M10.4 2.9 L13.6 2.9 L13.7 5.3 L15.6 6.1 L17.3 4.5 L19.5 6.7 L17.9 8.4 L18.7 10.3 L21.1 10.4 L21.1 13.6 L18.7 13.7 L17.9 15.6 L19.5 17.3 L17.3 19.5 L15.6 17.9 L13.7 18.7 L13.6 21.1 L10.4 21.1 L10.3 18.7 L8.4 17.9 L6.7 19.5 L4.5 17.3 L6.1 15.6 L5.3 13.7 L2.9 13.6 L2.9 10.4 L5.3 10.3 L6.1 8.4 L4.5 6.7 L6.7 4.5 L8.4 6.1 L10.3 5.3 Z" />
      <circle cx="12" cy="12" r="3.1" />
    </Svg>
  );
}

/** Install the app: arrow down into a tray. */
export function IconDownload() {
  return (
    <Svg>
      <path d="M12 4v10" />
      <path d="M8 10l4 4 4-4" />
      <path d="M4 17v3h16v-3" />
    </Svg>
  );
}

/** Notifications: bell (line through it when off). */
export function IconBell({ off = false }: { off?: boolean }) {
  return (
    <Svg>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15Z" />
      <path d="M10 21h4" />
      {off && <path d="M4 4l16 16" />}
    </Svg>
  );
}

/** Chat: speech bubble. */
export function IconChat() {
  return (
    <Svg>
      <path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z" />
    </Svg>
  );
}

/** Sort: two opposing vertical arrows. */
export function IconSort() {
  return (
    <Svg>
      <path d="M8 20V5M8 5L5 8M8 5l3 3" />
      <path d="M16 4v15M16 19l-3-3M16 19l3-3" />
    </Svg>
  );
}

/** Help: question mark in a circle. */
export function IconQuestion() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.9c-.8.35-1 .9-1 1.8" />
      <circle cx="12" cy="16.8" r="0.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Coach: four-point sparkle. */
export function IconSparkle() {
  return (
    <Svg>
      <path d="M12 3.5l1.8 5.4 5.4 1.8-5.4 1.8L12 18l-1.8-5.5-5.4-1.8 5.4-1.8z" />
      <path d="M18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </Svg>
  );
}

/** Log: bulleted list. */
export function IconList() {
  return (
    <Svg>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="0.5" fill="currentColor" />
      <circle cx="4.5" cy="12" r="0.5" fill="currentColor" />
      <circle cx="4.5" cy="18" r="0.5" fill="currentColor" />
    </Svg>
  );
}

/** Share: box with an arrow pointing out the top. */
export function IconShare() {
  return (
    <Svg>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </Svg>
  );
}

/** Sound on: speaker with waves. */
export function IconSpeaker({ muted = false }: { muted?: boolean }) {
  return (
    <Svg>
      <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" />
      {muted ? (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      ) : (
        <path d="M15.5 9.5a4 4 0 0 1 0 5M18 7.5a7 7 0 0 1 0 9" />
      )}
    </Svg>
  );
}

/** Card skins / cosmetics: a painter's palette with dabs of paint — cosmetics
 * are a creative choice, and two stacked rectangles just read as "copy". */
export function IconPalette() {
  return (
    <Svg>
      <path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.9-.8 1.9-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.7-1.7 1.7-1.7h1.6A5.3 5.3 0 0 0 21.5 10c0-3.9-4.2-7-9.5-7Z" />
      <circle cx="8" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.6" cy="8.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="17.4" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Language: a globe with meridians. */
export function IconGlobe() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </Svg>
  );
}

/** Last trick: a clock face with a counter-clockwise "look back" arrow. */
export function IconHistory() {
  return (
    <Svg>
      <path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3" />
      <path d="M4.5 13.5V17h3.5" />
      <path d="M12 8.5V12l2.8 1.8" />
    </Svg>
  );
}

/** Voice / microphone: a capsule on a stand. */
export function IconMic() {
  return (
    <Svg>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
    </Svg>
  );
}
