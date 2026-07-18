import { ARCADE } from '@jaffre/ui';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — also the hover tooltip (icon buttons carry no text). */
  readonly label: string;
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
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${plain ? ICON_BTN_CELL : ICON_BTN_BASE} ${skin} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
