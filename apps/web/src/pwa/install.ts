/**
 * Install-prompt plumbing. Chrome/Edge fire `beforeinstallprompt` once, early —
 * often before React mounts — so the capture listener installs at module load
 * (imported from main.tsx) and the button subscribes to availability after.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function initInstallCapture(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    for (const l of listeners) l();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    for (const l of listeners) l();
  });
}

export function onInstallAvailabilityChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Native prompt is captured and ready to show. */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (deferred === null) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const choice = await ev.userChoice;
  return choice.outcome === 'accepted';
}

/** Already running as an installed app (home screen / desktop window). */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's pre-standard flag.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/**
 * Install UI has nothing to offer inside someone else's page: Chrome does not
 * fire beforeinstallprompt in a cross-origin frame, so the button would be
 * inert, and "install this app" is the embedder's call to make, not ours.
 */
export function isEmbedded(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/** iOS never fires beforeinstallprompt — install goes through the share sheet. */
export function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ masquerades as macOS but is touch-first.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
