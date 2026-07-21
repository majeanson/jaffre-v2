/** Stroke icons for the paint tools — same geometry/scale as components/icons. */
import type { ReactNode } from 'react';

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

export function IconPencil() {
  return (
    <Svg>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </Svg>
  );
}

export function IconEraser() {
  return (
    <Svg>
      <path d="M4 15l7-7 6 6-5 5H8z" />
      <path d="M9 20h11" />
    </Svg>
  );
}

export function IconFill() {
  return (
    <Svg>
      <path d="M6 3l9 9-7 7a2 2 0 0 1-2.8 0L3 15a2 2 0 0 1 0-2.8z" />
      <path d="M6 3l1.5 1.5" />
      <path d="M20 15c1.2 1.8 1.2 3.5 0 4.6-1 1-2.4 1-3.3 0" />
    </Svg>
  );
}

export function IconDropper() {
  return (
    <Svg>
      <path d="M18 3.5a2 2 0 0 1 2.8 2.8L12 15l-3 .5.5-3z" />
      <path d="M14.5 6.5l3 3" />
      <path d="M11 13l-6 6" />
    </Svg>
  );
}

export function IconLine() {
  return (
    <Svg>
      <path d="M5 19L19 5" />
      <circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconRect({ filled = false }: { filled?: boolean }) {
  return (
    <Svg>
      <rect x="4" y="6" width="16" height="12" rx="1" fill={filled ? 'currentColor' : 'none'} />
    </Svg>
  );
}

export function IconMirror() {
  return (
    <Svg>
      <path d="M12 3v18" strokeDasharray="2 2" />
      <path d="M9 7L5 12l4 5z" />
      <path d="M15 7l4 5-4 5z" />
    </Svg>
  );
}

export function IconUndo() {
  return (
    <Svg>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
    </Svg>
  );
}

export function IconRedo() {
  return (
    <Svg>
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12H9a5 5 0 0 0 0 10h1" />
    </Svg>
  );
}

export function IconTrash() {
  return (
    <Svg>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13h10l1-13" />
    </Svg>
  );
}
