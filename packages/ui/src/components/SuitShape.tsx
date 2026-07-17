import type { CSSProperties } from 'react';
import type { SuitId } from '../types.js';
import { SUIT_STYLES } from '../types.js';

export interface SuitShapeProps {
  readonly suit: SuitId;
  /** Shape size as a CSS length (default 1em) — scales with the parent. */
  readonly size?: string;
  readonly className?: string;
}

/**
 * The suit's geometric mark — circle (red) · rounded square (brown) · triangle
 * (green) · diamond (blue). A suit is NEVER colour alone: the shape carries it
 * too (colour-blind safe). Rendered as pure CSS so it stays crisp at any size.
 */
export function SuitShape({ suit, size = '1em', className = '' }: SuitShapeProps) {
  const color = SUIT_STYLES[suit].color;
  const style: CSSProperties =
    suit === 'red'
      ? { width: size, height: size, borderRadius: '999px', background: color }
      : suit === 'brown'
        ? { width: size, height: size, borderRadius: '0.22em', background: color }
        : suit === 'blue'
          ? {
              width: `calc(${size} * 0.82)`,
              height: `calc(${size} * 0.82)`,
              background: color,
              transform: 'rotate(45deg)',
            }
          : {
              width: 0,
              height: 0,
              borderLeft: `calc(${size} * 0.56) solid transparent`,
              borderRight: `calc(${size} * 0.56) solid transparent`,
              borderBottom: `${size} solid ${color}`,
            };
  return <span aria-hidden className={`inline-block shrink-0 ${className}`} style={style} />;
}
