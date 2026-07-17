import type { ReactNode } from 'react';
import { Cta, WordPlate } from '@jaffre/ui';
import { QrCode } from './QrCode.js';

export interface ShareSheetProps {
  /** Room code — the invite link is `${origin}/#room/<code>`. */
  readonly code: string;
  /** Copy the link again (re-triggers the "Link copied" toast). */
  readonly onCopy: () => void;
  /** Dismiss the sheet. */
  readonly onClose: () => void;
}

const SHARE_TARGET_CLASS =
  'flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-(--radius-ap-control) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) py-2.5 font-arcade-display text-[0.85em] uppercase tracking-wide text-(--color-ap-text) shadow-(--shadow-ap-sm) hover:bg-(--color-ap-panel-hover)';

/** One share-target tile (Text / Email / More) — a link when it has an href
 * (native sms:/mailto: hand-off), a button when it runs code (Web Share). */
function ShareTarget({
  icon,
  label,
  href,
  onClick,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly href?: string;
  readonly onClick?: () => void;
}) {
  const inner = (
    <>
      <span aria-hidden className="text-(--color-ap-violet-soft)">
        {icon}
      </span>
      {label}
    </>
  );
  return href === undefined ? (
    <button type="button" onClick={onClick} className={SHARE_TARGET_CLASS}>
      {inner}
    </button>
  ) : (
    <a href={href} className={SHARE_TARGET_CLASS}>
      {inner}
    </a>
  );
}

const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/**
 * The inviter's share sheet — the warm, at-a-glance surface for handing a
 * friend the table (design 6d). A bottom sheet in the Refined Arcade Violet
 * shell: a scan-to-join QR, the room code as ivory word-plates, the link with
 * one-tap copy, and Text / Email / More hand-off targets. The QR encoder is
 * bundled (no CDN / network), so it works offline and under a strict CSP.
 */
export function ShareSheet({ code, onCopy, onClose }: ShareSheetProps) {
  const url = `${location.origin}/#room/${code}`;
  const message = `Come play Jaffré with me — ${url}`;
  const words = code.split('-');

  const shareMore = () => {
    if (typeof navigator.share === 'function') {
      navigator.share({ url, text: message }).catch(() => {
        // Cancelled or unsupported mid-flight — nothing to recover.
      });
      return;
    }
    onCopy();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite to your table"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-5 font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-lg)"
      >
        <div aria-hidden className="mx-auto h-1.5 w-11 rounded-full bg-(--color-ap-ink)/40" />

        <div className="text-center">
          <h2 className="font-arcade-display text-[1.7em] leading-none text-(--color-ap-gold)">
            Pull up a chair
          </h2>
          <p className="mt-2 text-[0.9em] text-(--color-ap-muted)">
            Send this to whoever you want at the table. They drop straight in with one tap — no
            account, nothing to install.
          </p>
        </div>

        {/* QR + the room code as ivory word-plates. */}
        <div className="flex items-stretch gap-3">
          <div className="grid size-[7.5em] shrink-0 place-items-center rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-card-face) p-2 shadow-(--shadow-ap-sm)">
            <QrCode value={url} label={`Scan to join room ${code}`} className="size-full" />
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-2">
            <span className="font-arcade-ui text-[0.68em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
              Table code
            </span>
            <div className="flex flex-wrap gap-1.5">
              {words.map((w, i) => (
                <WordPlate key={i}>{w}</WordPlate>
              ))}
            </div>
            <span className="text-[0.78em] leading-snug text-(--color-ap-muted)">
              Scan the code, or read the words out loud.
            </span>
          </div>
        </div>

        {/* Link + copy. */}
        <div className="flex gap-2">
          <input
            readOnly
            aria-label="Room link"
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-3 py-2.5 font-arcade-ui text-[0.9em] text-(--color-ap-text) shadow-(--shadow-ap-sm)"
          />
          <Cta type="button" onClick={onCopy}>
            Copy
          </Cta>
        </div>

        {/* Hand-off targets. */}
        <div className="flex gap-2">
          <ShareTarget
            href={`sms:?body=${encodeURIComponent(message)}`}
            label="Text"
            icon={
              <svg {...ICON}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
          />
          <ShareTarget
            href={`mailto:?subject=${encodeURIComponent('Jaffré')}&body=${encodeURIComponent(message)}`}
            label="Email"
            icon={
              <svg {...ICON}>
                <path d="M4 4h16v16H4z" />
                <path d="m4 6 8 6 8-6" />
              </svg>
            }
          />
          <ShareTarget
            label="More"
            onClick={shareMore}
            icon={
              <svg {...ICON}>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
              </svg>
            }
          />
        </div>

        <Cta type="button" variant="secondary" onClick={onClose} className="w-full">
          Done
        </Cta>
      </div>
    </div>
  );
}
