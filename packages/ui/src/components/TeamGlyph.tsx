export interface TeamGlyphProps {
  readonly team: 0 | 1;
  /** Accessible label (e.g. "Team Sun"); omit for a decorative glyph. */
  readonly label?: string;
  /** Glyph size as a CSS length (default 1em) — scales with the parent. */
  readonly size?: string;
  readonly className?: string;
}

/**
 * The team pictogram: a ☀ sun (team 0) or ☾ moon (team 1), drawn as inline SVG
 * in the team colour (`--color-team-a/-b`) so it's crisp and theme-adaptive —
 * NOT an emoji (those ignore CSS colour and vary by platform). Used everywhere
 * a team is named so "Sun vs Moon" reads at a glance in every skin. Pass `label`
 * for a standalone indicator (adds an sr-only name); omit it when a visible team
 * name sits right next to it.
 */
export function TeamGlyph({ team, label, size = '1em', className = '' }: TeamGlyphProps) {
  const color = team === 0 ? 'var(--color-team-a)' : 'var(--color-team-b)';
  return (
    <span
      className={`inline-grid shrink-0 place-items-center ${className}`}
      style={{ width: size, height: size, color }}
      role={label !== undefined ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {team === 0 ? (
        // Sun: filled disc + eight rays.
        <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4.4" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
          </g>
        </svg>
      ) : (
        // Moon: a crescent (a disc with a bite taken out).
        <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" fill="currentColor" />
        </svg>
      )}
    </span>
  );
}
