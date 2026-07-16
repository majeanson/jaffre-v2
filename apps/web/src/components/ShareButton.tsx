import { useState } from 'react';
import { IconButton } from './IconButton.js';
import { IconShare } from './icons.js';
import { Toast } from './Toast.js';

export interface ShareButtonProps {
  /** Room code — the invite link is `${origin}/#room/<code>`. */
  readonly code: string;
}

/**
 * One-tap invite: the OS share sheet when available, else a clipboard copy
 * with a transient "Link copied" toast.
 */
export function ShareButton({ code }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const onShare = () => {
    const url = `${location.origin}/#room/${code}`;
    if (typeof navigator.share === 'function') {
      navigator.share({ url }).catch(() => {
        // User cancelled, or the OS share sheet failed — nothing to recover.
      });
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      .catch(() => {
        // Clipboard unavailable (permissions / insecure context) — silently drop.
      });
  };

  return (
    <>
      <IconButton label="Share this table" onClick={onShare}>
        <IconShare />
      </IconButton>
      {copied && <Toast message="Link copied" onDone={() => setCopied(false)} />}
    </>
  );
}
