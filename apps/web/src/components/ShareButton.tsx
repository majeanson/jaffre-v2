import { useState } from 'react';
import { useLang, type Lang } from '@jaffre/ui';
import { IconButton } from './IconButton.js';
import { IconShare } from './icons.js';
import { ShareSheet } from './ShareSheet.js';
import { Toast } from './Toast.js';

export interface ShareButtonProps {
  /** Room code — the invite link is `${origin}/#room/<code>`. */
  readonly code: string;
  /** Show the title beside the icon where there's room (options drawer). */
  readonly labeled?: boolean;
}

/**
 * One-tap invite: the OS share sheet when available, else our own warm share
 * sheet — the room link front-and-centre — while the link also lands on the
 * clipboard with a transient "Link copied" toast.
 */
const T: Record<Lang, { share: string; title: string; copied: string; inviteText: string }> = {
  en: {
    share: 'Share this table',
    title: 'Share',
    copied: 'Link copied',
    inviteText: 'Join my Jaffre table!',
  },
  fr: {
    share: 'Partager cette table',
    title: 'Partager',
    copied: 'Lien copié',
    inviteText: 'Viens jouer au Jaffre à ma table!',
  },
};

export function ShareButton({ code, labeled = false }: ShareButtonProps) {
  const t = T[useLang()];
  const [copied, setCopied] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const copyLink = () => {
    const url = `${location.origin}/#room/${code}`;
    navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      .catch(() => {
        // Clipboard unavailable (permissions / insecure context) — fall back
        // to our own share sheet so the link is still reachable (selectable
        // text, no silent no-op).
        setSheetOpen(true);
      });
  };

  const onShare = () => {
    const url = `${location.origin}/#room/${code}`;
    if (typeof navigator.share === 'function') {
      navigator.share({ title: 'Jaffre', text: t.inviteText, url }).catch(() => {
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
      <IconButton label={t.share} text={labeled ? t.title : undefined} onClick={onShare}>
        <IconShare />
      </IconButton>
      {sheetOpen && (
        <ShareSheet code={code} onCopy={copyLink} onClose={() => setSheetOpen(false)} />
      )}
      {copied && <Toast message={t.copied} onDone={() => setCopied(false)} />}
    </>
  );
}
