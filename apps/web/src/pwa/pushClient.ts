/**
 * Turn-notification subscriptions. Server-gated: /api/push/vapid returns a
 * null key until the VAPID secrets are set (see apps/server/src/push.ts), and
 * the toggle stays hidden. The local pref only mirrors what we last did — the
 * subscription itself lives with the browser + server.
 */

import { getGuestToken, getSessionToken } from '../net/auth.js';
import { playerName } from '../net/socket.js';

const PREF_KEY = 'jaffre-push';

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushPrefOn(): boolean {
  return localStorage.getItem(PREF_KEY) === 'on';
}

/** The server's VAPID public key, or null when push is off/unconfigured. */
export async function fetchVapidKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/vapid');
    if (!res.ok) return null;
    const data = (await res.json()) as { key: string | null };
    return data.key;
  } catch {
    return null;
  }
}

async function bearer(): Promise<string | null> {
  return getSessionToken() ?? (await getGuestToken(playerName()))?.token ?? null;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission, subscribe this browser, and register it with the server. */
export async function enablePush(vapidKey: string): Promise<boolean> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64urlToBytes(vapidKey) as BufferSource,
    });
    const token = await bearer();
    if (token === null) return false;
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) return false;
    localStorage.setItem(PREF_KEY, 'on');
    return true;
  } catch {
    return false;
  }
}

/** Drop this browser's subscription, locally and server-side. */
export async function disablePush(): Promise<void> {
  localStorage.setItem(PREF_KEY, 'off');
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub === null) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    const token = await bearer();
    if (token !== null) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint }),
      });
    }
  } catch {
    // Best-effort: the server prunes dead endpoints on its own anyway.
  }
}
