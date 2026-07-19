import { useEffect, useRef } from 'react';
import { Cta, WordPlate, useLang, type Lang } from '@jaffre/ui';
import { QrCode } from './QrCode.js';

const T: Record<
  Lang,
  {
    invite: string;
    pullUp: string;
    sendThis: string;
    scanToJoin: (code: string) => string;
    tableCode: string;
    scanOrRead: string;
    roomLink: string;
    copy: string;
    copied: string;
    autoCopied: string;
    done: string;
  }
> = {
  en: {
    invite: 'Invite to your table',
    pullUp: 'Pull up a chair',
    sendThis:
      'Send this to whoever you want at the table. They drop straight in with one tap — no account, nothing to install.',
    scanToJoin: (code) => `Scan to join room ${code}`,
    tableCode: 'Table code',
    scanOrRead: 'Scan the code, or read the words out loud.',
    roomLink: 'Room link',
    copy: 'Copy',
    copied: 'Copied',
    autoCopied: 'Link copied — just paste it to a friend.',
    done: 'Done',
  },
  fr: {
    invite: 'Inviter à ta table',
    pullUp: 'Tire-toi une bûche',
    sendThis:
      'Envoie ça à qui tu veux à la table. Un tap et la personne arrive direct — pas de compte, rien à installer.',
    scanToJoin: (code) => `Scanne pour joindre le salon ${code}`,
    tableCode: 'Code de la table',
    scanOrRead: 'Scanne le code, ou lis les mots à voix haute.',
    roomLink: 'Lien du salon',
    copy: 'Copier',
    copied: 'Copié',
    autoCopied: 'Lien copié — colle-le à un ami.',
    done: 'Terminé',
  },
};

export interface ShareSheetProps {
  /** Room code — the invite link is `${origin}/#room/<code>`. */
  readonly code: string;
  /** Copy the link again (re-triggers the "Link copied" toast). */
  readonly onCopy: () => void;
  /** Dismiss the sheet. */
  readonly onClose: () => void;
}

/**
 * The inviter's share sheet — the warm, at-a-glance surface for handing a
 * friend the table. A bottom sheet in the Refined Arcade Violet shell: a
 * scan-to-join QR, the room code as ivory word-plates, and the link — which is
 * auto-copied to the clipboard the moment the sheet opens (with a note), so the
 * common case is "open → paste". No Text/Email/native-share targets: the copied
 * link + QR cover every hand-off. The QR encoder is bundled (no CDN / network),
 * so it works offline and under a strict CSP.
 */
export function ShareSheet({ code, onCopy, onClose }: ShareSheetProps) {
  const t = T[useLang()];
  const url = `${location.origin}/#room/${code}`;
  const words = code.split('-');

  // Auto-copy on open — the sheet is opened by a tap, so the clipboard write is
  // still within the user-activation window. onCopy also fires the "Link copied"
  // toast; the manual button below re-copies if the auto-copy was blocked.
  const copied = useRef(false);
  useEffect(() => {
    if (copied.current) return;
    copied.current = true;
    onCopy();
  }, [onCopy]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.invite}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-5 font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-lg)"
      >
        <div aria-hidden className="mx-auto h-1.5 w-11 rounded-full bg-(--color-ap-ink)/40" />

        <div className="text-center">
          <h2 className="font-arcade-display text-[1.7em] leading-none text-(--color-ap-gold)">
            {t.pullUp}
          </h2>
          <p className="mt-2 text-[0.9em] text-(--color-ap-muted)">{t.sendThis}</p>
        </div>

        {/* QR + the room code as ivory word-plates. */}
        <div className="flex items-stretch gap-3">
          <div className="grid size-[7.5em] shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-paper) p-2 shadow-(--shadow-ap-sm)">
            <QrCode value={url} label={t.scanToJoin(code)} className="size-full" />
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-2">
            <span className="font-arcade-ui text-[0.68em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
              {t.tableCode}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {words.map((w, i) => (
                <WordPlate key={i}>{w}</WordPlate>
              ))}
            </div>
            <span className="text-[0.78em] leading-snug text-(--color-ap-muted)">
              {t.scanOrRead}
            </span>
          </div>
        </div>

        {/* Link + copy — auto-copied on open, with a note. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <input
              readOnly
              aria-label={t.roomLink}
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-3 py-2.5 font-arcade-ui text-[0.9em] text-(--color-ap-text) shadow-(--shadow-ap-sm)"
            />
            <Cta type="button" onClick={onCopy}>
              {t.copy}
            </Cta>
          </div>
          <p className="flex items-center gap-1.5 font-arcade-ui text-[0.78em] text-(--color-ap-ok)">
            <span aria-hidden>✓</span>
            {t.autoCopied}
          </p>
        </div>

        <Cta type="button" variant="secondary" onClick={onClose} className="w-full">
          {t.done}
        </Cta>
      </div>
    </div>
  );
}
