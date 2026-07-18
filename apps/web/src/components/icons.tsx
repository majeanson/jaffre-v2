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

/** Options: gear. */
export function IconGear() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
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

/** Card skins / cosmetics: two overlapping cards. */
export function IconCards() {
  return (
    <Svg>
      <rect x="8" y="6" width="11" height="14" rx="2" />
      <path d="M15 6V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h1" />
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
