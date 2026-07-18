# Login setup — what Marc must configure

Guest play needs **nothing** — everything below is optional and feature-gated.
Until a secret is set, its login method simply doesn't appear in the UI
(`GET /api/auth/methods` reports what's on).

## Email codes (Resend) — ~2 minutes

The from-address is `Jaffre <noreply@marcportal.com>` and **marcportal.com is
already verified on Resend** (SPF/DKIM done for marcportal, 2026-05-24), so
there is **zero DNS work**. Reuse the same Resend API key the portal uses:

```sh
cd apps/server
wrangler secret put RESEND_API_KEY   # paste the marcportal Resend key (re_…)
```

Locally: add `RESEND_API_KEY=re_…` to `apps/server/.dev.vars`.

Mind the Resend free tier (100/day, 3000/mo) is now shared between the portal
and jaffre login codes.

## Google sign-in — ~10 minutes

1. [console.cloud.google.com](https://console.cloud.google.com) → APIs &
   Services → Credentials → **Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `https://jaffre.marcportal.com/api/auth/google/callback`
   - (add `http://localhost:8788/api/auth/google/callback` for local dev)
2. If prompted, configure the consent screen: External, app name "Jaffre",
   scopes `openid`, `email`, `profile`. Publish it (or keep Testing and add
   your accounts as test users).
3. Set the secrets:

```sh
cd apps/server
wrangler secret put GOOGLE_CLIENT_ID       # ….apps.googleusercontent.com
wrangler secret put GOOGLE_CLIENT_SECRET
```

## Database

`0006_login.sql` (google_sub column + login_codes table) applies automatically
on deploy (`wrangler d1 migrations apply jaffre --remote` runs in CI).

## How it behaves

- Guests play exactly as before; the 3-word code still mints + restores
  ("I have a code" under Customize) but is no longer displayed.
- "Keep your games" appears under Customize (+ quiet one-liners in the lobby
  and the game-over recap) only while nothing is linked AND a method is
  configured.
- Linking attaches the credential to the CURRENT guest uid — games, stats,
  cosmetics all carry over. Signing in on a new device with the same
  credential resolves to the same uid.
