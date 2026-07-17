import { useRef, useState, type ReactNode } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { GHOST_BTN } from '../components/buttonStyles.js';
import { HelpSheet } from './HelpSheet.js';

const T: Record<Lang, { howToPlay: string }> = {
  en: { howToPlay: 'How to play' },
  fr: { howToPlay: 'Comment jouer' },
};

export interface HelpButtonProps {
  /** Accessible label; 'How to play' on menus, 'Help' on the table. */
  readonly label?: string;
  /** Full chrome override for tighter spots (e.g. the lobby footer). */
  readonly className?: string;
  /** Mount with the sheet already open (scene viewer). */
  readonly defaultOpen?: boolean;
  /** Custom trigger content (e.g. an icon); the label stays the aria name. */
  readonly children?: ReactNode;
}

/**
 * The one way into the rules: a trigger + the shared HelpSheet. Owns the
 * open state and returns focus to the trigger on close.
 */
export function HelpButton({
  label,
  className = `px-3 py-1.5 text-sm text-(--color-ap-text) ${GHOST_BTN}`,
  defaultOpen = false,
  children,
}: HelpButtonProps) {
  const t = T[useLang()];
  const shownLabel = label ?? t.howToPlay;
  const [open, setOpen] = useState(defaultOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={shownLabel}
        title={shownLabel}
        onClick={() => setOpen(true)}
        className={className}
      >
        {children ?? shownLabel}
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
