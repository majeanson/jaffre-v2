import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Global motion policy: honors prefers-reduced-motion in one place. Every
 * animated devkit component must sit under this provider.
 */
export function JaffreMotionConfig({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
