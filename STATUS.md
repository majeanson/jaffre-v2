# STATUS.md — checkpoint ledger

What is DONE and VERIFIED, so future work starts from trust instead of
re-checking. Updated at major checkpoints only. Details live in git history
and `docs/archive/` (completed plans + the retired polishing backlog).

Last checkpoint: **2026-07-29**.

## Shipped and settled

- **Game core** — pure engine (`packages/engine`, 100% coverage enforced,
  seeded folds → bit-identical replays), bots (`packages/bots` — re-bench with
  `npm run botbench -- --vs <ref>` before re-adding any "intuitive" idea; most
  lose), Zod protocol, redaction as the anti-cheat boundary.
- **Server** — one `GameRoom` DO per room, carved into invariant-owning
  modules (`apps/server/src/room/`: presence · bots · seats · music ·
  persistence · types). Presence hardening (disconnect clocks, bot takeover,
  `botSwapAt`/`botPlaying` roster contract, recap ready-timeout, all-bots
  unfreeze) is settled — treat as load-bearing. Lobby DO: matchmaking + Elo
  leaderboard, claim reservation/vacate closed. The worker entry got the same
  carve: `index.ts` is a 135-line router and nothing else, with every handler
  in `apps/server/src/routes/` (http · auth · profile · games · stats ·
  dealBoard · leaderboard · tables · socket · telemetry · ice · push). One
  `computeStats` backs both the record and the awards derived from it; the
  three client-capability routes each state their own degradation contract
  (telemetry never throws · ice falls back to STUN · push refuses).
- **Felt table** — the felt itself is deliberate (an "arena" rewrite was
  tried and reverted; change it surgically, shot-verified). One deal clock
  (`table/dealPace.ts`) drives the fly-out, the fan's 1-by-1 fill, the
  auction gate and the local bots' first bid. One toast stack over the felt
  (Stage's `#table-toast-stack`) holds every announcement — trump callout,
  trick banner, coach tip, tutorial marks — stacking when simultaneous. The
  scoreboard-delivery system (`table/flight.tsx`) flies every top-bar change
  in from its cause; displayed values wait for landing (holds mask DISPLAY
  only, 900 ms hard snap — game truth never waits). Real play only, by
  FlightLayer presence — scenes/replay get no-ops by construction.
- **Help** — one bilingual content tree (`help/helpContent.tsx`, en/fr
  bodies adjacent per card — structure cannot drift between languages),
  rules taught in learning order (goal + 41 in card one, tricks & trump
  merged, points before bidding), advanced strategy folded, glossary last.
- **Meta** — Corner/Journey/Collection/Awards/Stats/Leaderboard/Deal Board
  behind MetaNav; XP/20-level track (constants frozen, never-relock
  fallbacks); cosmetics play-earned; Paint Studio; awards spine + Elo board.
- **Platform** — real login (email codes + Google), PWA (SW, install,
  wake-lock, badge, Web Push), room music queue, voluntary auto-play (server
  plays at 'hard'), i18n fr-QC (tutoiement; locked terms levée/mise/brasseur/
  ronde/siège; EN strings pinned by e2e), replay viewer, scene catalog.

## The gates (all green at checkpoint)

- 182 e2e (`npm run e2e`; chromium = reduced motion, chromium-motion = the
  only project that watches pixels move) · 67-scene catalog, each axe-gated
  (`npm run e2e:scenes`, 100 tests — fast, and the first thing to run) ·
  112 web unit · 194 server · engine property tests (100% cov).
- `apps/web/test/violetInk.test.ts` enforces the visual law: **violet pairs
  with ink, never white** (it caught a 4th live instance on its first run).
- Full shots sweep 2026-07-29: **60/60 viewport×skin combos, ~4,300 shots,
  zero layout warnings** — the first fully clean sweep. All 15 skins
  baselined. Re-run with `npm run shots` (~1.7 h, starves the machine —
  don't run beside other work).
- `main` auto-deploys to jaffre.marcportal.com behind CI's e2e gate +
  live-bundle verify. No PR gate — land on main.

## How we work here

- UX simplicity first: reuse surfaces, cut redundant buttons; refinements
  beat additions. Small shot-verified steps on the felt.
- Comments explain WHY and encode invariants — keep them with their code.
- Timing goes through `paced()`; reduced motion = instant everywhere.
- Colocated `T` tables for copy; check e2e-pinned strings before rewording.

## Liquidity, renewal and operability (2026-07-29)

- **Drop-in seats.** `players` counts humans, so a live public room under
  capacity holds a bot seat a spectator can take over mid-hand
  (`droppableRooms` in `Lobby.ts`). Quick Play prefers a not-yet-dealt table,
  then drops into one of these. Bots now KEEP a table joinable instead of
  closing it — that loop ("host alone → add bots → room goes watch-only → next
  player hosts their own empty room") was the cold-start death spiral. A FULL
  live room is still unclaimable. The client derives join-vs-watch from
  `phase` + `players < capacity`, the same rule, so the two cannot disagree.
- **Renewal.** Deal Board runs end on a result card you have to dismiss (they
  used to tear the felt down instantly), with a share line carrying the
  challenge URL, a daily streak, and a link to yesterday's board. The
  leaderboard has a **This month** tab: ranked by WINS, derived from
  `games` + `game_players` — there is no per-game rating delta stored anywhere,
  so a monthly Elo would need a migration, and an Elo _reset_ would punish a
  small pool. No min-games gate, so a newcomer is on it after one game.
- **Operability.** `[observability]` is ON in wrangler.toml (it is opt-in;
  without it every `console.error` lived only in a `wrangler tail`). Room-code
  and game-id are on the logs that matter, and `syncLobby`'s catch no longer
  swallows failures silently.
- **Bounded growth.** Room `meta` is rewritten on every action against a 2MB
  DO ceiling, past which `storage.put` throws inside `applyEngineAction` and
  the game can never advance. Paint rides the SOCKET until its owner sits
  (`onSit` promotes it), and `pruneMeta` at game_over forgets everyone no
  longer seated. Telemetry `kind` is an allowlist (it is a PK column on an
  unauthenticated endpoint); expired `login_codes` are swept.
- **`playersByGame` is chunked at 80.** D1 caps bound parameters at 100 and
  `computeStats` passes every finished game — `/api/stats` and `/api/awards`
  broke permanently on a player's 101st game. Regression-tested at 120.

Known gap: the monthly board finds "you" only within the returned top 100.

## Identity in public (2026-07-29)

One rule, server-side: a name that is still the untouched default leaves
as `Player <4 hex of its publicId>` (`publicId.ts`'s `displayName`), applied
at every point a name reaches other people — roster, chat, deal board,
leaderboard, replay rosters. Anonymous but never ambiguous, no new state.
Use the LAST 4 hex: FNV-1a leaves the leading hex identical for uids that
differ only in their final character (a test pins this). The rename card
(`components/NamePrompt.tsx`, no longer room-specific) is now an invitation,
not a defence — it guards the lobby seat pick and the Deal Board's play
button, and skipping it is safe.

## Open threads

Two, both from the 2026-07-29 review, both deliberately NOT started:

- **Head-to-head view** — the Stats SocialPanel's nemesis/best-partner tiles
  are dead ends. Tapping one should open the record vs/with that player, the
  shared games (each already links to its replay) and a derived "regulars"
  list (anyone faced/partnered ≥3 games). No stored social graph — derive it,
  like everything else here.
- **Room storage self-destruct** — nothing ever deletes a GameRoom DO's
  storage (zero `deleteAll()` calls in `apps/server`), and merely CONNECTING
  to a room code persists a `meta` write, so every mistyped code and expired
  invite mints permanent billed storage. The fix (a long-dated alarm at
  game_over/never-started with zero sockets) has to weave into the existing
  single-alarm arbitration in `scheduleNextWake`/`runAlarm`, which is
  load-bearing — give it a fresh session and its own tests, not the tail end
  of a long one.

Also considered and REJECTED, so nobody re-proposes them: post-20 XP/prestige
(the constants are frozen by design; the monthly ladder is the real answer), a
stronger-than-hard bot (the bench is a graveyard of intuitive ideas that lose),
friends/DMs/clans (the room is the social unit), and any currency or shop (it
would cheapen every already-earned unlock). Cutting "Host a public table" was
also proposed and rejected: drop-in seats changed Quick Play's job, so hosting
a fresh public table is now a capability rather than a duplicate.

These threads are closed for good:

- **Visitor TTF** — decided, not deferred. Silkscreen IS the display face;
  the app was drawn and shot against it. The `'Visitor'` fallback is gone
  from `--font-arcade-display` and the "swap it later" note is gone from
  `main.tsx`. Don't put either back.
- **nemesis stat** — ships (server → `Stats.tsx` SocialPanel → pinned by
  `stats.spec.ts`).
- **QR** — finished (`components/QrCode.tsx`: bundled encoder,
  dynamic-imported, crisp SVG path with a quiet zone).
- **`index.ts` carve** — done; see Server above.
