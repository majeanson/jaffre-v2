# Phase 1 — Identity & the social loop

Goal: a player is a durable person, not a browser. Their name, games, and
tables survive reloads, new devices, and time — and inviting a friend is one
tap. This unlocks stats/progression (phase 2) and FR localization audiences
(phase 4).

Grounding (from the code map, 2026-07-16):

- Identity today is split: the server token `uid` (minted by `/api/auth/guest`,
  `apps/server/src/auth/session.ts`) and the browser's `jaffre-uid`
  (`apps/web/src/net/socket.ts`) are two unrelated UUIDs. History is keyed by
  whichever one the auth mode used — rows silently vanish across modes.
- History (`games`/`game_players` in D1, `apps/server/migrations/0001_init.sql`)
  stores no player names: replays show "Player 1–4".
- No invite mechanism beyond the raw `#room/<code>` URL; no clipboard/share.
- Rematch re-seeds the same DO (`GameRoom.onStart`) but there is no "series"
  tally across games at a table.
- Telemetry: none at all (confirmed).

## Workstreams

### A — One identity + recovery words (foundation)

The server token `uid` becomes the single canonical player id.

- Migration `0002_identity.sql`: `users.recovery_hash TEXT`, `users.color TEXT`.
- `/api/auth/guest`: on FIRST mint also generate a 3-word recovery code
  (`lampe-tricot-hibou` style, from a small FR-flavored word list), store only
  its hash, return the code once. Bearer-authenticated re-calls keep the same
  `uid` (rename = new token, same uid).
- New `POST /api/auth/recover {code, name?}` → token for the matching uid
  (constant-time hash compare; 404 on miss, rate-limit by IP basics).
- Client `apps/web/src/net/auth.ts` + `socket.ts`: token uid is used everywhere
  (socket `?u=` fallback only in no-secret dev). `jaffre-uid` kept only as a
  legacy fallback when no token can be minted. Name change re-mints with the
  same uid instead of minting a fresh identity.
- Home screen: show the recovery words once in a small "this gets your games
  back on a new phone" card (copy action); an "I have a code" entry point
  restores identity. Keep it zero-friction — no accounts vocabulary.

### B — Names in history + stats (depends on A)

- Migration `0003_history_names.sql`: `game_players.name TEXT`,
  `games.round_summaries TEXT` (JSON of the engine's `RoundSummary[]` — the
  engine already carries `state.roundSummaries`).
- `GameRoom.persistHistory` + `apps/server/src/history.ts`: store each seat's
  display name and the round summaries.
- `/api/history`: include `players: {seat, name, isBot}[]` per game.
- `/api/stats?` (Bearer/`?u=`): aggregates from D1 — games, wins, win rate,
  bids attempted/made (from round_summaries where contract seat = your seat),
  sans-atout record, best partner (seat%2 teammate with highest shared win
  rate), current/best win streak.
- Web: History rows show "with Ginette · vs Marcel & Réal"; Replay uses stored
  names; new `#stats` screen ("Your record") — functional layout now, visual
  design pass comes from claude.ai/design later.

### C — Invite & the standing table

- Share: in the lobby and the table Options drawer, a Share icon button —
  `navigator.share` when available, else clipboard copy with a "Link copied"
  toast. Link = `https://…/#room/<code>`.
- Visitor landing: show whose table it is ("Marcel's table" — first seated
  human) and the mini seat map it already has.
- Standing-table tally: `GameRoom.Meta.seriesWins: [number, number]` increments
  at game_over; shown on GameRecap ("Tonight: Sun 3 — Moon 2") and reset only
  when the room empties for good.
- Home: "Resume last room" strip stays; label it with the series tally when
  the server exposes it (roster message gains `seriesWins?`).

### D — Telemetry (fly blind no more)

- Client: `window.onerror` + `unhandledrejection` → `navigator.sendBeacon`
  to `POST /api/telemetry` (message, stack head, url, ua; no PII beyond that;
  drop after 10 events/session).
- Server: `/api/telemetry` logs via `console.error` (Workers Logs picks it up)
  with basic size caps; DO catch blocks get consistent `console.error` tags
  (`[history]`, `[alarm]`, …). No third-party SDK.

## Cross-cutting rules (unchanged from previous plans)

- Tokens only, all three skins; light-skin contrast rule for dark surfaces.
- Every new visual state → a scene in `sceneManifest.ts` + `scenes.ts` with a
  probe (axe-checked by `scenes.spec.ts`).
- Verify per change: `npm run format && npm run lint && npm run typecheck &&
  npm test`, plus targeted e2e. Migrations are forward-only additive.
- Engine package keeps 100% coverage; server changes need vitest coverage in
  `apps/server/test`.

## Order

A first (everything keys off the unified uid) → B and C in parallel → D any
time (isolated). Design pass on the new surfaces (profile, stats, invite
landing, standing table) runs in claude.ai/design off `docs/` design kit and
lands as a follow-up restyle.
