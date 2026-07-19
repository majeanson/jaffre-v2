import { ARCADE } from '@jaffre/ui';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — also the hover tooltip. */
  readonly label: string;
  /** Optional visible title shown beside the icon when there's room. It
   * collapses to icon-only on narrow screens (no space); `label` stays the
   * accessible name either way. Omit for a plain icon-only button. */
  readonly text?: string | undefined;
  /** Lit state (toggles like coach/log/sound) — golden tint when on. */
  readonly active?: boolean;
  /** Danger styling (Leave). */
  readonly danger?: boolean;
  /** Borderless cell inside a shared button bar (the bar owns the chrome). */
  readonly plain?: boolean;
  readonly children: ReactNode;
}

/** Base chrome for a small square icon button — shared with icon-styled
 * triggers. Composed from the ARCADE concept mapping (single source). */
export const ICON_BTN_BASE = `${ARCADE.iconBtnBase} cursor-pointer`;

/** The neutral (idle) icon-button look, as a plain class string. */
export const ICON_BTN_NEUTRAL = `${ICON_BTN_BASE} ${ARCADE.iconBtnNeutral}`;

/** Base chrome for a labeled (icon + collapsible title) button. */
export const ICON_BTN_LABELED = `${ARCADE.iconBtnLabeled} cursor-pointer`;

/** Borderless bar-cell chrome (shared bar owns the border/shadow). */
export const ICON_BTN_CELL = `${ARCADE.iconBtnCell} enabled:cursor-pointer disabled:opacity-40`;

/** The neutral bar-cell look: transparent idle, panel-hover fill. */
export const ICON_BTN_CELL_NEUTRAL = `${ICON_BTN_CELL} text-(--color-ap-text) enabled:hover:bg-(--color-ap-panel-hover)`;

/**
 * The one small square icon button used across the table chrome — hover-bar
 * style like other apps: no text, an icon, tooltip + aria-label for meaning.
 * Fluid-sized so it scales with the cards.
 */
export function IconButton({
  label,
  text,
  active = false,
  danger = false,
  plain = false,
  children,
  className = '',
  ...rest
}: IconButtonProps) {
  const skin = danger
    ? plain
      ? 'text-(--color-ap-danger-text) enabled:hover:bg-(--color-ap-panel-hover)'
      : 'border-(--color-ap-danger) bg-(--color-ap-panel) text-(--color-ap-danger-text) hover:bg-(--color-ap-panel-hover)'
    : active
      ? 'bg-(--color-ap-gold) text-(--color-ap-ink)'
      : plain
        ? 'text-(--color-ap-text) enabled:hover:bg-(--color-ap-panel-hover)'
        : 'bg-(--color-ap-panel) text-(--color-ap-text) hover:bg-(--color-ap-panel-hover)';
  const base = text !== undefined ? ICON_BTN_LABELED : plain ? ICON_BTN_CELL : ICON_BTN_BASE;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${base} ${skin} ${className}`}
      {...rest}
    >
      {children}
      {text !== undefined && (
        <span className="hidden font-arcade-display text-[0.65em] uppercase sm:inline">{text}</span>
      )}
    </button>
  );
}
