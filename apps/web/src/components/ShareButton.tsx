import { useState } from 'react';
import { IconButton } from './IconButton.js';
import { IconShare } from './icons.js';
import { ShareSheet } from './ShareSheet.js';
import { Toast } from './Toast.js';

export interface ShareButtonProps {
  /** Room code — the invite link is `${origin}/#room/<code>`. */
  readonly code: string;
}

/**
 * One-tap invite: the OS share sheet when available, else our own warm share
 * sheet — the room link front-and-centre — while the link also lands on the
 * clipboard with a transient "Link copied" toast.
 */
export function ShareButton({ code }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const copyLink = () => {
    const url = `${location.origin}/#room/${code}`;
    navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      .catch(() => {
        // Clipboard unavailable (permissions / insecure context) — silently drop.
      });
  };

  const onShare = () => {
    const url = `${location.origin}/#room/${code}`;
    if (typeof navigator.share === 'function') {
      navigator.share({ url }).catch(() => {
        // User cancelled, or the OS share sheet failed — nothing to recover.
      });
      return;
    }
    // No OS share sheet: copy straight away (the toast confirms) and open our
    // own warm sheet so the link is visible to hand off another way.
    copyLink();
    setSheetOpen(true);
  };

  return (
    <>
      <IconButton label="Share this table" onClick={onShare}>
        <IconShare />
      </IconButton>
      {sheetOpen && (
        <ShareSheet code={code} onCopy={copyLink} onClose={() => setSheetOpen(false)} />
      )}
      {copied && <Toast message="Link copied" onDone={() => setCopied(false)} />}
    </>
  );
}
