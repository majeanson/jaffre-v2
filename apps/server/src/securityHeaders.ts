/**
 * The security headers the front door ships — and the ONE list that both
 * delivery paths read from, so neither can drift from the other.
 *
 * jaffre carries real identity (Google OAuth, HMAC session tokens, email OTP),
 * and it shares the parent domain with its siblings. SameSite=Lax does NOT
 * fence a cookie off from a sibling `*.marcportal.com` origin, so "the app can
 * be framed" is a real clickjacking surface, not a theoretical one. Before
 * this file the live site answered with none of these headers (security audit
 * 02-jaffre-v2, finding H1).
 *
 * WHY TWO DELIVERY PATHS. Cloudflare's asset router serves a request that
 * matches a real file — `/` → index.html, `/assets/*`, and (with
 * not_found_handling = single-page-application + the 2025-04-01
 * assets_navigation_prefers_asset_serving default our compat date opts into)
 * the SPA fallback for navigations — WITHOUT invoking the Worker at all. So
 * `withSecurityHeaders` never runs for the actual front door, and a code-only
 * fix would leave `/` bare while every `/api/*` miss had the headers. The
 * `_headers` file is the layer that reaches those asset-served responses, and
 * ONLY those: Cloudflare applies `_headers` to static assets, never to
 * Worker-generated responses. The two are complementary, which is why both are
 * built from this one `ENFORCED` list — one source, two emitters. The Worker
 * uses `withSecurityHeaders` on the responses it DOES generate (the /join/*
 * share shell and the asset-binding fallback — both run_worker_first or
 * Worker-reached, so `_headers` can't touch them); vite.config.ts writes
 * `headersFileSource()` into dist/_headers at build time for the rest.
 */

/**
 * The Content-Security-Policy, one directive per line so the next reader can
 * see exactly which origin each clause admits and why.
 *
 * Everything the client ships is self-hosted: scripts and the stylesheet are
 * Vite's own hashed bundles, the fonts are @fontsource woff2 compiled into
 * /assets (no Google Fonts CDN). The only cross-origin admissions are the two
 * real third-party surfaces:
 *   - YouTube, for the optional music dock (src/music/youtube.ts injects
 *     https://www.youtube.com/iframe_api on first "Listen", which pulls its
 *     widget script and creates the player iframe). script-src + frame-src.
 *   - the game's own WebSocket (src/net/socket.ts, rooms.ts) to wss on this
 *     origin. 'self' already covers same-origin wss; the explicit prod origin
 *     is belt-and-suspenders and documents intent.
 * `style-src 'unsafe-inline'` is the one concession: React writes `style=""`
 * attributes across the table and home surfaces. Scripts stay strictly 'self'
 * plus YouTube — no inline-script escape hatch.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // 'self' = Vite's hashed bundles. YouTube IFrame API (music dock) pulls
  // iframe_api from www.youtube.com, which in turn loads its widget script
  // from s.ytimg.com — both needed or the optional music feature console-errors.
  "script-src 'self' https://www.youtube.com https://s.ytimg.com",
  // React inline style attributes; the compiled Tailwind sheet is 'self'.
  "style-src 'self' 'unsafe-inline'",
  // data: covers the inline SVG favicon, qrcode-generator's data-URL output,
  // and a painted-avatar <img src=dataURL> round-trip (src/paint/importImage.ts).
  // i.ytimg.com: the music queue's track thumbnails are the YouTube oEmbed
  // thumbnail_url (apps/server/src/room/music.ts), rendered as <img> in
  // MusicDock / MusicQueuePanel — without it every thumbnail is blank.
  "img-src 'self' data: https://i.ytimg.com",
  "font-src 'self'",
  // 'self' covers same-origin wss on whatever host serves the page (prod and
  // the workers.dev preview alike); the explicit prod wss names the game socket.
  "connect-src 'self' wss://jaffre.marcportal.com",
  // The YouTube player iframe (music dock). Nothing else is framed by the app.
  "frame-src 'self' https://www.youtube.com",
  // Who may FRAME jaffre: itself and the portal family. dads.marcportal.com
  // embeds the table beside its chat (src/embed.ts), and it matches
  // *.marcportal.com. No X-Frame-Options: it can't express a two-origin
  // allowlist, and a DENY beside this would refuse dads in browsers that read
  // XFO first. frame-ancestors supersedes XFO everywhere CSP is honoured.
  "frame-ancestors 'self' https://marcportal.com https://*.marcportal.com",
  "base-uri 'self'",
  // The app posts no cross-origin forms; the Google sign-in is a server 302,
  // not a form submit, so 'self' here does not touch OAuth.
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/**
 * Every header, name and value, applied identically on both paths.
 *
 * Permissions-Policy denies the capabilities jaffre never asks for but KEEPS
 * `microphone=(self)` — the voice chat (src/voice/rtc.ts getUserMedia) needs
 * it, including inside the dads frame, where 'self' = jaffre's own origin.
 * Disabling it here would silently break push-to-talk.
 */
export const ENFORCED: ReadonlyArray<readonly [name: string, value: string]> = [
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)'],
  ['Content-Security-Policy', CSP_DIRECTIVES],
];

/**
 * The text of dist/_headers. vite.config.ts writes this so the asset-served
 * front door (`/`, `/assets/*`, SPA fallback) carries the SAME policy the
 * Worker wrapper applies to everything else. The file is parsed by Cloudflare
 * and never itself served as an asset.
 */
export function headersFileSource(): string {
  return [
    '# Generated at build time from apps/server/src/securityHeaders.ts — do not edit.',
    '/*',
    ...ENFORCED.map(([name, value]) => `  ${name}: ${value}`),
    '',
  ].join('\n');
}

/**
 * Copy a response, adding the enforced headers. Used on the responses the
 * Worker itself generates (the /join/* shell and the asset-binding fallback),
 * which the asset router's `_headers` never reaches. NEVER call this on the
 * WebSocket upgrade (status 101) — that response can't be reconstructed this
 * way, and the router leaves those untouched by design.
 */
export function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [name, value] of ENFORCED) headers.set(name, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
