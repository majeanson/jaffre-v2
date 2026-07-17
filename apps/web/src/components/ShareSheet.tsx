import { Cta } from '@jaffre/ui';

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
 * friend the table. Wears the Refined Arcade Violet shell: the room link sits
 * front-and-centre in a selectable field with a one-tap copy, warm invite
 * copy above it. QR is a noted follow-up (no external QR lib / service —
 * CSP + offline forbid it).
 */
export function ShareSheet({ code, onCopy, onClose }: ShareSheetProps) {
  const url = `${location.origin}/#room/${code}`;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite to your table"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-(--radius-ap-panel) border-2 border-(--color-ap-ink) bg-(--color-ap-panel) p-5 font-arcade-ui text-(--color-ap-text) shadow-(--shadow-ap-lg)"
      >
        <div>
          <h2 className="font-arcade-display text-[1.6em] leading-none text-(--color-ap-gold)">
            Invite to your table
          </h2>
          <p className="mt-2 text-[0.95em] text-(--color-ap-muted)">
            Send this link. Whoever taps it drops straight into your game — no account, nothing to
            install.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-arcade-ui text-[0.72em] font-semibold uppercase tracking-[0.14em] text-(--color-ap-muted)">
            Your table link
          </span>
          <input
            readOnly
            aria-label="Room link"
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-(--radius-ap-inner) border-2 border-(--color-ap-ink) bg-(--color-ap-ground) px-3 py-2.5 font-arcade-ui text-[0.95em] text-(--color-ap-text) shadow-(--shadow-ap-sm)"
          />
        </label>

        <div className="flex flex-col gap-2">
          <Cta type="button" onClick={onCopy} className="w-full">
            Copy link
          </Cta>
          <Cta type="button" variant="secondary" onClick={onClose} className="w-full">
            Done
          </Cta>
        </div>

        <p className="text-center font-arcade-ui text-[0.78em] text-(--color-ap-muted)">
          A scan-to-join QR is on the way.
        </p>
      </div>
    </div>
  );
}
