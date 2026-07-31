# Link-preview (unfurl) setup — the one manual step

The code side shipped 2026-07-31: share links are `/join/<code>`, the Worker
serves them with live OG tags (`apps/server/src/routes/join.ts`), and the
preview image lives at `/social/og.png`. **None of it shows in Messenger /
Slack / Discord until the zone WAF lets scrapers in.**

## Why

`jaffre.marcportal.com` 403s datacenter IPs (`cf-mitigated` — documented in
`scripts/verify-deploy.ts`, which dodges it via the workers.dev fallback).
Every link scraper IS a datacenter IP: facebookexternalhit (Messenger),
Slackbot, Discordbot, WhatsApp, Twitterbot, TelegramBot, LinkedInBot.

## The dashboard step (once)

1. Find which product is blocking: Cloudflare dashboard → marcportal.com →
   **Security → Events**, then probe from any machine:

   ```
   curl -si -A "facebookexternalhit/1.1" https://jaffre.marcportal.com/join/test | head -5
   ```

   A 403 with a `cf-mitigated` header confirms it; the event log names the
   product (Bot Fight Mode, a WAF custom rule, etc.).

2. Add a **Skip rule for verified bots**, scoped to the three surfaces
   scrapers touch (Security → WAF → Custom rules → Create rule, action
   _Skip_, skipping the product identified above):

   ```
   (cf.client.bot) and (
     starts_with(http.request.uri.path, "/join/")
     or http.request.uri.path eq "/social/og.png"
     or http.request.uri.path eq "/"
   )
   ```

   `cf.client.bot` is Cloudflare's verified-bot list — it covers every
   scraper named above and nothing self-declared. If the blocker is Bot
   Fight Mode specifically, its "verified bots" allowance is the same lever.

## Verify (after the rule + a deploy)

- Re-run the curl above expecting **200** and `og:title` = "Join my Jaffre
  table" in the body.
- **Facebook Sharing Debugger** (developers.facebook.com/tools/debug) —
  Messenger reads the same cache. Paste a `/join/<code>` URL; hit **Scrape
  Again** (FB caches previews ~7 days, so a link shared before a copy fix
  keeps its old card until re-scraped).
- Paste a link in a private Slack channel and a test Discord server: expect
  the gold-cards image, the host's name in the title, and a live seat count.

## Boundaries the code already pins

- An unfurl never 500s: any status-peek failure renders the generic invite
  copy (`apps/server/test/join.test.ts`).
- The response is `Cache-Control: public, max-age=60` — a group-chat burst
  costs one DO wake; a seat count can be up to a minute stale, and the SPA
  shows truth on arrival.
- Push notification deep links deliberately stay `/#room/<code>` (in-app
  navigation, no scraper) — see the comments in `room/presence.ts`.
