import { useRef, useState } from 'react';
import { GHOST_BTN } from '../components/buttonStyles.js';
import { HelpSheet } from './HelpSheet.js';

export interface HelpButtonProps {
  /** Visible + accessible label; 'How to play' on menus, 'Help' on the table. */
  readonly label?: string;
  /** Full chrome override for tighter spots (e.g. the lobby footer). */
  readonly className?: string;
}

/**
 * The one way into the rules: a trigger + the shared HelpSheet. Owns the
 * open state and returns focus to the trigger on close.
 */
export function HelpButton({
  label = 'How to play',
  className = `px-3 py-1.5 text-sm text-(--color-ivory)/80 ${GHOST_BTN}`,
}: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      {open && (
        <HelpSheet
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
