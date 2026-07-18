# Web Push setup ("it's your turn" notifications)

Push is OFF until the VAPID secrets exist (same feature-gate pattern as auth —
see `docs/AUTH-SETUP.md`). Without them `/api/push/vapid` returns a null key
and the client hides the bell toggle on the home screen.

## Enable

```sh
# 1. Generate a keypair (prints both values):
node apps/server/scripts/gen-vapid.mjs

# 2. Set them as Worker secrets (from apps/server/):
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY

# 3. Apply the subscriptions migration in prod (CI normally does this):
wrangler d1 migrations apply jaffre --remote
```

Requires `SESSION_SECRET` to also be set — subscriptions are stored per
verified user id (`push_subscriptions` in D1, migration `0007_push.sql`).

## What it does

- Home screen shows a bell button; enabling asks notification permission and
  subscribes the browser (`apps/web/src/pwa/pushClient.ts`).
- When it becomes a player's turn and they have **no connected socket**, the
  room DO sends "À ton tour · It's your turn" to all their subscriptions
  (`GameRoom.notifyTurnIfAbsent` → `apps/server/src/push.ts`). Connected but
  hidden tabs get the app-icon badge instead (`apps/web/src/pwa/badge.ts`).
- Clicking the notification opens/focuses the app on `#room/<code>`
  (`apps/web/public/push-sw.js`, importScripts'd into the generated SW).
- Dead endpoints (404/410 from the push service) are pruned automatically.

iOS: works from 16.4+ only when the app is installed to the home screen.
