/**
 * GET/HEAD /join/<code> — the share link that unfurls.
 *
 * A `#room/<code>` hash never reaches a server, so a pasted invite could only
 * ever preview as the generic site card. This real path lets the Worker serve
 * the SPA shell with LIVE Open Graph tags — who's hosting, how many seats are
 * taken — so the link a friend drops in Messenger/Slack reads like an
 * invitation instead of a bare URL. The browser still ends up in the exact
 * same place: an injected inline script rewrites the address to /#room/<code>
 * before the app boots (plus a client-side net in apps/web/src/joinPath.ts
 * for old service workers — deliberate redundancy, keep both halves).
 *
 * Degradation contract: an unfurl must never 500 or hang. Any failure of the
 * room-status peek (timeout, throw, non-OK) renders the generic invite copy.
 *
 * Scraper-probed codes waking DOs is accepted: the code-shape regex runs
 * before any DO is touched, the response is edge-cached for 60s, and a
 * /status on a virgin DO reads storage without writing anything.
 */
import type { Env } from '../env.js';

/** Hardcoded prod origin for og:url — scrapers need absolute URLs, and a
 * workers.dev preview pointing its canonical at prod is harmless (nobody
 * shares preview links). Same reasoning as og:image in index.html. */
const PROD_ORIGIN = 'https://jaffre.marcportal.com';

const STATUS_TIMEOUT_MS = 1500;

interface JoinStatus {
  readonly started: boolean;
  readonly players?: number;
  readonly hostName?: string;
}

/** The unfurl copy. Bilingual in ONE string (` · `), the same convention as
 * presence.ts's push bodies: a scraper gives no language signal, and the
 * description budget (~110 chars) fits both. Title stays English-only — a
 * two-language title reads as clutter, and the sender's own message carries
 * the personal note in their language. The waiting title deliberately echoes
 * ShareButton's inviteText ("Join my Jaffre table!") so the unfurl and the
 * sender's text read as one voice. */
function joinCopy(status: JoinStatus | null): { title: string; description: string } {
  const title =
    status?.hostName === undefined
      ? 'Join my Jaffre table'
      : `Join ${status.hostName}'s Jaffre table`;
  if (status === null || status.players === undefined) {
    return {
      title,
      description:
        'Pull up a chair — 4 players, no account needed · Tire-toi une bûche — 4 joueurs, pas besoin de compte',
    };
  }
  if (status.started) {
    return {
      title,
      description: 'Game in progress — come watch · Partie en cours — viens regarder',
    };
  }
  return {
    title,
    description: `${status.players} of 4 seats taken — pull up a chair · ${status.players} sièges sur 4 — tire-toi une bûche`,
  };
}

/**
 * `code` is the lowercased capture of `/^\/join\/([a-zA-Z0-9-]{1,32})$/` —
 * the regex IS the escaping. It cannot contain quotes, angle brackets or
 * backslashes, so interpolating it into the inline script and og:url below is
 * XSS-safe by construction. Never pass the raw pathname here. hostName (a
 * player-chosen string) only ever flows through setInnerContent/setAttribute,
 * which HTML-escape on serialization.
 */
export async function handleJoin(request: Request, env: Env, code: string): Promise<Response> {
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    // For humans and the edge, not scrapers (they cache on their own
    // schedule): 60s keeps a shared-in-a-group-chat burst to one DO wake
    // while seat counts stay near-live. `no-store` would buy nothing.
    'Cache-Control': 'public, max-age=60',
  });
  // HEAD never needs the shell or a DO wake.
  if (request.method === 'HEAD') return new Response(null, { headers });

  let status: JoinStatus | null = null;
  try {
    const id = env.GAME_ROOM.idFromName(code);
    const res = await Promise.race([
      env.GAME_ROOM.get(id).fetch(new Request('https://do/status')),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('status timeout')), STATUS_TIMEOUT_MS),
      ),
    ]);
    if (res.ok) status = await res.json<JoinStatus>();
  } catch {
    // Fall through to the generic copy — see the degradation contract above.
  }
  const { title, description } = joinCopy(status);
  const canonical = `${PROD_ORIGIN}/join/${code}`;

  const shell = await env.ASSETS.fetch(new Request(new URL('/', request.url)));
  const rewritten = new HTMLRewriter()
    .on('title', {
      element(e) {
        e.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', {
      element(e) {
        e.setAttribute('content', description);
      },
    })
    .on('meta[property="og:title"]', {
      element(e) {
        e.setAttribute('content', title);
      },
    })
    .on('meta[property="og:description"]', {
      element(e) {
        e.setAttribute('content', description);
      },
    })
    .on('meta[property="og:url"]', {
      element(e) {
        e.setAttribute('content', canonical);
      },
    })
    // Rewriting existing baseline tags (never injecting new metas) keeps the
    // document holding exactly one of each, whatever a scraper's tie-break.
    .on('head', {
      element(e) {
        // The SPA entry is <script type="module">, which never executes
        // before the document finishes parsing — so this inline classic
        // script wins the race by construction, and the app boots already
        // standing at /#room/<code>.
        e.append(`<script>history.replaceState(null,"","/#room/${code}")</script>`, {
          html: true,
        });
      },
    })
    .transform(shell);

  return new Response(rewritten.body, { status: 200, headers });
}
