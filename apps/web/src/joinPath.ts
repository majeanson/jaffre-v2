/**
 * The client half of the /join/<code> share link.
 *
 * The Worker (apps/server/src/routes/join.ts) serves that path with an inline
 * script that rewrites the address to /#room/<code> before the app boots.
 * This module is the SAFETY NET for the ways that script can be missing: a
 * service worker installed before /join/ joined the navigateFallbackDenylist
 * (it serves the cached shell — right page, wrong address), offline
 * navigation, and any path-based entry that missed the worker. Both halves
 * converge on the same URL, so double-execution is a no-op — the redundancy
 * is deliberate; don't remove either.
 */

/** Same shape the server route accepts; mixed case tolerated then lowercased,
 * matching parseHash's own tolerance for #room codes. */
const JOIN_PATH_RE = /^\/join\/([a-zA-Z0-9-]{1,32})$/;

/**
 * `/join/<valid code>` → `#room/<lowercased code>`. Any OTHER /join path →
 * a (length-capped) hash that parseHash cannot route, so the app shows the
 * BadLinkNotice instead of silently pretending the link worked. Everything
 * else → null (not ours).
 */
export function joinPathToHash(pathname: string): string | null {
  const match = JOIN_PATH_RE.exec(pathname);
  if (match !== null) return `#room/${(match[1] as string).toLowerCase()}`;
  if (pathname === '/join' || pathname.startsWith('/join/')) {
    return `#join/${pathname.slice('/join/'.length, '/join/'.length + 40)}`;
  }
  return null;
}

/** Rewrite a /join path into the hash the SPA routes, before first render. */
export function consumeJoinPath(): void {
  const hash = joinPathToHash(location.pathname);
  if (hash !== null) history.replaceState(null, '', `/${hash}`);
}
