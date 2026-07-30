/**
 * DOM discovery for the spatial-nav engine and the layer stack. Nothing
 * registers itself anywhere: whatever is focusable in the live DOM is a
 * keyboard destination, so every existing and future button just works.
 * `data-nav="skip"` on an element or an ancestor opts a subtree out.
 */

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex="0"]',
  // react-aria listbox options (the hand's cards) carry tabindex="-1" and rove
  // internally; including them lets arrows enter and leave the fan.
  '[role="option"]',
].join(', ');

export type IsVisible = (el: HTMLElement) => boolean;

/** Chromium's checkVisibility when present; rendered-box fallback elsewhere. */
export function defaultIsVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility();
  return el.getClientRects().length > 0;
}

/**
 * Where the keyboard may roam right now: the topmost open modal dialog, else
 * the whole page. Same open-modal test as useTableKeys' typingElsewhere(), so
 * the engine and the digit shortcuts agree on when a sheet owns the keys.
 * "Topmost" = last visible match in DOM order — the sheets portal to body, so
 * later means above.
 */
export function getScopeRoot(isVisible: IsVisible = defaultIsVisible): HTMLElement {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  for (let i = dialogs.length - 1; i >= 0; i--) {
    const dialog = dialogs[i];
    if (dialog !== undefined && isVisible(dialog)) return dialog;
  }
  return document.body;
}

/** Every visible keyboard destination under `root`, in DOM order. */
export function collectFocusables(
  root: HTMLElement,
  isVisible: IsVisible = defaultIsVisible,
): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      el.closest('[data-nav="skip"]') === null &&
      // Backdrops and decorative wrappers are aria-hidden; nothing inside them
      // is a real destination.
      el.closest('[aria-hidden="true"]') === null &&
      isVisible(el),
  );
}
