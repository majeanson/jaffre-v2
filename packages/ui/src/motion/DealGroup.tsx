import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Deal-in stagger: children rise from the deck position with a spring, one
 * after another. Wrap each card in <Dealt index={i}>.
 */
export function DealGroup({ children }: { children: ReactNode }) {
  return (
    <motion.div className="flex items-end -space-x-3" initial="hidden" animate="shown">
      {children}
    </motion.div>
  );
}

export function Dealt({ index, children }: { index: number; children: ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden: { y: -90, x: 40, opacity: 0, rotate: 8 },
        shown: {
          y: 0,
          x: 0,
          opacity: 1,
          rotate: 0,
          transition: { type: 'spring', stiffness: 380, damping: 28, delay: index * 0.055 },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
