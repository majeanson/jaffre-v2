# STATUS.md — checkpoint ledger

What is DONE and VERIFIED, so future work starts from trust instead of
re-checking. Updated at major checkpoints only. Details live in git history
and `docs/archive/` (completed plans + the retired polishing backlog).

Last checkpoint: **2026-07-30** (the completions pass — see below).

## Shipped and settled

- **Game core** — pure engine (`packages/engine`, 100% coverage enforced,
  seeded folds → bit-identical replays), bots (`packages/bots` — re-bench with
  `npm run botbench -- --vs <ref>` before re-adding any "intuitive" idea; most
  lose), Zod protocol, redaction as the anti-cheat boundary.
- **Server** — one `GameRoom` DO per room, carved into invariant-owning
  modules (`apps/server/src/room/`: presence · bots · seats · music ·
  persistence · reaper · types). Presence hardening (disconnect clocks, bot takeover,
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

- 197 e2e (`npm run e2e`; chromium = reduced motion, chromium-motion = the
  only project that watches pixels move) · 69-scene catalog, each axe-gated
  (`npm run e2e:scenes`, 110 tests — fast, and the first thing to run) ·
  118 web unit · 208 server · engine property tests (100% cov).
- `apps/web/test/violetInk.test.ts` enforces the visual law: **violet pairs
  with ink, never white** (it caught a 4th live instance on its first run).
- Shots sweep, re-run against the head-to-head/regulars/lazy-felt work
  (2026-07-29→30): **phone 15/15 skins · tablet 15/15 · desktop 15/15 ·
  small-desktop 3/15, zero layout warnings** — every width that has ever caught
  a layout bug is fully covered in every skin. `report.txt` is appended LIVE,
  so a header-only report means clean even for an interrupted run.
  `shots-output/index.html` holds the phone+tablet contact sheet (2,370 shots,
  no missing cells); the desktop rows were verified clean but their images were
  wiped by a later run's global-setup.
- **The contact sheet was hiding half the sweep.** Its filename parser matched
  only `desktop-` and `phone-`, so every `tablet-` and `small-desktop-` shot
  the sweep took was dropped — the two widths where layout breaks first were
  taken and never shown. Fixed: `VIEWPORT_ORDER`/`SKIN_ORDER` now live in
  `shots-shared.ts` and both the sweep and the sheet read them (the old sort
  key also only knew dark/light/juicy, so twelve skins tied and ordered
  arbitrarily). Add a viewport or skin in one place and you must add it there.
- Two gotchas for whoever runs `npm run shots` (~1.7 h, starves the machine):
  killing it mid-run leaves an orphaned `workerd` holding port 8788 (the next
  run dies instantly with "already used" — kill the process, not the port),
  and its global-setup WIPES `shots-output/`, so an interrupted run destroys
  the previous baseline's images. Run rows selectively with
  `--grep "phone-|tablet-"`.
- Viewport shots, not full-page: on a long screen (the record) anything below
  the fold — the social tiles' regulars strip — is never in a shot at any
  width. That surface is gated by the per-width overflow assertions in
  `e2e/scenes.spec.ts` instead.
- `main` auto-deploys to jaffre.marcportal.com. The deploy gates on the FAST
  ci job only (format · lint · typecheck · contrast · unit · build) plus the
  live-bundle verify; the Playwright suite deliberately runs BESIDE the
  deploy, not before it — once after every green main push and again nightly
  (e2e.yml, where this trade is written down). So a browser-only regression
  CAN reach prod and is caught minutes later, not blocked: on 2026-07-30 a
  red e2e coexisted with a completed deploy, as designed. No PR gate — land
  on main.

## The completions pass (2026-07-30)

A five-agent audit read every feature area hunting cut corners — not bugs
so much as things that stop one step short. Six waves landed from it
(`c80d853`, `2246593`, `0bab285`, `4c80231`, `174b9fb`, + this one). The
plan is archived in `docs/archive/PLAN-completions-2026-07.md`. What
changed, and the rules that came out of it:

- **Bugs that were quietly costing us.** The Collection shipped a
  `Show all (dev)` checkbox with NO dev gate — a live progression bypass
  anyone could tick, which persisted to their profile. The LoginSheet
  promised "your card skins on any device" while nothing ever READ the
  equips back out of the saved profile (`applyProfileCosmetics` now cashes
  that promise at each identity-adoption point; `logOut` clears the
  seen-baselines so a second account on one device still gets its
  announcements). A spectator's recap offered a Rematch the server rejects
  (`NOT_SEATED`) and hid the seat-claim that IS legal between games. A
  standing table that lost a human could never rematch — `add_bot` was
  refused once `started`, though `sit`/`start` already honored the
  between-games window. Yesterday's Deal Board let you play a full hand
  into a 409, and a network blip on submit destroyed the run AND the
  streak (the log survives now; Retry re-sends the same hand).
- **The only errors a player ever saw at the felt were the untranslated
  ones.** `noticeCodes.ts` localized lobby/chat/music codes and none of the
  five ENGINE codes, so a French player got raw English naming "seat 2" at
  a table where everyone else has a name. All five speak both languages now.
- **Celebrations fired at the wrong time.** The progress reconcile ran on
  cold load only, so an unlock earned mid-game announced itself on the NEXT
  visit. It re-runs on return-to-menu. Level-up names its payout. Foils
  (server-granted 1-in-20) existed in the data and NOWHERE in the UI —
  they announce, badge the Collection tile, and their sheen is scoped to
  the live felt instead of shimmering over every preview of every skin.
  `LEVEL_TRACK` now carries the felt and sweep levels it always granted, so
  level 16 names Sugar Shack instead of claiming to be a breather.
- **Identity travels.** Head-to-head shows the person (colour, paint, the
  trophy they chose to show) plus last-played, recent form and biggest
  margin; the record's tiles wear paint; and a painted 0 stays painted
  when PLAYED, which the profile card had promised all along.
- **The table speaks.** `ChatEntry.system` carries a CODE and a name, never
  prose — the client localizes, an older client gets a plain-language
  fallback. Sat / left / game on / dropped / bot-playing / back. The
  takeover line is edge-detected and deduped because `botPlaying` is
  derived from a deadline and would otherwise repeat on every roster.
  System lines never trip the unread dot. `roster.spectators` was broadcast
  on every roster and rendered nowhere — the lobby and the table show it.
- **Table style (new house rule).** `tableStyle: 'own' | 'host'` makes every
  seat see the HOST's felt, sweep — and, since 2026-07-30, card skin
  (`overrideCardSkin`, same never-persist contract; a legacy host's skinless
  felt+sweep pair still drives the rule, pinned server-side). The load-bearing detail: `applyFelt()`
  PERSISTS, so the override goes through `overrideFelt()`, which touches
  only the `<html data-felt>` attribute and never localStorage — a guest's
  own equip is never overwritten, and the default felt stays the ABSENCE of
  the attribute. The roster resolves the pair by CURRENT host id, so a host
  handoff carries the look for free. Ownership gates equipping, not seeing.
- **`set_rules` REPLACES the rule set, it does not merge.** Every Lobby
  switch must send the whole set; the older two were silently reverting the
  new rule. Pinned by a server test — don't "simplify" it back.
- **A controlled switch needs `click()`, not Playwright's `check()`.** Every
  rule toggle is controlled by the roster echo, so it flips a round-trip
  after the click; `check()` asserts the new state instantly and fails.

Deliberately NOT done, and why: scheduled re-engagement pushes stay
rejected (see the list below). The three items parked behind the parallel
keys session's mount points all landed 2026-07-30 (`e8a4213`): the `win`
sting fires from GameRecap, the one-shot InstallNudge earns its single
appearance on Home (post-first-finish, via `funnelReached`), and Settings
shows the 3-word recovery code to unlinked identities.

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

Not a gap, a decision (the code says so at the call site): the monthly board
finds "you" only within the returned top 100. The all-time board runs a second
COUNT for an off-page caller because its 10-rated-games gate means most callers
ARE off-page; the monthly board has no gate and a small pool, so being outside
one month's top 100 is rare enough that a per-request COUNT would cost more
than it tells anyone. Don't "fix" it without a pool big enough to need it.

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

## Both open threads closed (2026-07-29, later session)

- **Room storage self-destruct** — SHIPPED (`apps/server/src/room/reaper.ts`).
  One rule: while a room has no open sockets it carries `meta.emptySince`, and
  the first alarm past the grace deletes everything it ever wrote (24 h for a
  never-started or game_over room, 7 days for one frozen mid-hand, which takes
  a resumable game away). The alarm arbitration is the load-bearing part:
  `alarm()` checks the reaper FIRST and re-arms it LAST, so `bots.ts` and
  `scheduleNextWake` are untouched; the reaper only arms while socket-empty
  (every game wake needs a connected human, so they never contend), it
  min-arms with `getAlarm()` so the pre-game vacate wake can't be pushed a day
  out, and the deadline lives in persisted `emptySince` — NOT in the alarm
  time — so a re-arm can never restart the clock. `test/reaper.test.ts` (7)
  pins all of it. Note: `room.test.ts`'s empty-room pause test now asserts
  what the pause means (the game doesn't advance), not an empty alarm slot.
  Residual gap CLOSED 2026-07-30: pre-ship rooms (no stamp, only reaped on a
  future connect) were swept by hand — every distinct `games.room_code` with
  a finish before the ship date (15 rooms) got one authed
  `POST /api/room/:code/leave`, whose existing `armReaper` call stamps a
  socket-empty room and arms its alarm. No server change needed. Pre-ship
  rooms that never finished a game are unenumerable (no D1 row, and DO
  namespaces don't list) — accepted: they hold only a meta write, and any
  future connect stamps them.
- **Head-to-head view** — SHIPPED. `#h2h/<pid>`
  (`screens/HeadToHead.tsx`) off both Stats social tiles: record with, record
  across, and every shared game (rows via the extracted
  `components/GameRow.tsx`, so the record's list and this one cannot drift).
  `/api/head2head` derives it from `game_players`; the address is the
  one-way PUBLIC id, and a test pins that no uid appears in the body. Stats
  also gained `regulars` (3+ shared games, with AND against counted together,
  uncapped, minus the two the tiles already name). The "edge" line reads ONLY
  the against-games — folding in games won side by side made every good
  partner look like a rival. The shared games are split into Partnered /
  Across the table, each headed with that record: one list repeated "with
  Ginette" on every row of a screen about Ginette while never stating what
  actually differed. A replay opened from here goes BACK here (App tracks the
  previous hash; the record stays the default for every other list). Scenes
  `head-to-head` / `head-to-head-none`.

## Rules the follow-up audit turned up (2026-07-29, same session)

- **Every named player is a door.** Stats' two tiles, the regulars strip and
  BOTH leaderboard rows link to `#h2h/<pid>` — the ladder already carried the
  public id (`routes/leaderboard.ts` hashes the uid on the way out), so the row
  naming the player above you leads to your record against them. Your own row
  stays inert. The Deal Board's standings are deliberately NOT linked: that
  list is about one deal, not about people you have played.
- **A player's name comes from their NEWEST shared game.** `game_players.name`
  is a per-game snapshot; `computeStats` walks oldest-first, so keeping the
  first name it saw showed a renamed partner's old name on the tile while the
  head-to-head behind it showed the new one. Pinned by a Bob→Roberta test.
- **Destinations are appended sr-only, never an `aria-label`.** A label
  REPLACES an element's own text as its accessible name: the aria-labels this
  work first added made a screen reader hear "head to head with Ginette" and
  lose the rank, the rating, the "beats you 5 of 8" — the very facts the row
  exists to state. Same class of law as violet-pairs-with-ink.
- **A record is fetched, not painted.** `/api/stats` + `/api/history` are
  NetworkFirst (3s timeout) in the service worker, not StaleWhileRevalidate:
  the app reads a resolved response ONCE, so "refresh behind" left the screen
  showing the stale body for the whole visit — an installed app showed the
  pre-game record after finishing a game, and the recap's XP strip stored that
  stale total as the baseline the next "+N XP" was measured against. The
  in-memory 30s cache is now busted on the game_over view (`net/socket.ts`);
  `bustStatsCache` had existed for exactly that and was called from nowhere.
- **Staged people have real public ids.** One `PID` map in `dev/scenes.ts`, 16
  hex like the real thing, shared by the record, both boards and the Deal
  Board — the old `'u1'` ids rendered links that fell through to the
  unknown-link notice (a scene lying about its screen), and two different
  staged people shared one id.
- **A lazy route isn't lazy if an eager module imports it.** The table's TopBar
  statically imported `CollectionSheet` → the Collection screen, so the whole
  gallery rode in the one index chunk every first-time visitor downloads —
  while App.tsx's `lazy()` claimed otherwise and rollup warned it on every
  build. The sheet lazies it now, and Collection is a 15 kB chunk on open.
- **The recap's "+N XP" survives the read-before-write race.** A finished
  game's history row is written INSIDE the game_over action that sends the
  recap, with no "persisted" signal on the wire, so the XP strip's read can
  arrive first. It re-reads once (busting the read cache, or the second fetch
  returns the same promise) and only advances the stored baseline on a read it
  believes — a stale baseline is what made a gain land a game late, on a hand
  that didn't earn it. The decision is pure (`xpMoment` in `progression.ts`,
  6 tests); a race can't be tested through a component.

## First paint, measured (2026-07-29)

`1.63 MB` of rendered JS loaded before first paint. What it was made of:
`react-dom` 441 kB (fixed), a 640 kB shared chunk of **react-aria +
framer-motion + motion-dom**, and 352 kB of table (help tree 51 kB, recap,
coach, login/settings sheets).

The table is now lazy plus an idle `import()` warm right after Home paints — it
is never the first screen, and "where every join flow lands" is a reason to
warm it, not to block on it. Entry chunk **844 → 483 kB (261 → 150 kB gzip)**;
eager total 1633 → 1475 kB rendered (it falls less than the entry because Home
and Lobby genuinely share some of the table's imports).

Corrected 2026-07-30: the "640 kB react-aria/framer-motion shared chunk" is
NOT a first-paint lever anymore — the lazy-table split above moved it off the
path. The built entry is one 483 kB file whose only motion content is the
`MotionConfig` sliver; react-aria's machinery lives entirely in the lazy Table
chunk (~234 kB) and motion's core in TrickArea's (~129 kB), both idle-warmed
after Home paints. The entire surface is five files — ONE react-aria import
(`Hand.tsx`'s ListBox) and three motion imports (root `MotionConfig`,
`TrickArea`'s fly-in/sweep, `Hand`'s layout-FLIP + pointer drag). Ripping them
out would recover ~360 kB of LAZY bytes (warm-time transfer, not first paint),
and the expensive part is rewriting Hand's drag gesture by hand — don't do it
for perf; only touch it if the drag must change anyway. (`DealGroup`/`Dealt`
were dead exports — deleted 2026-07-30; the CSS `.deal-in` keyframes are the
deal animation.)

Also considered and REJECTED, so nobody re-proposes them: post-20 XP/prestige
(the constants are frozen by design; the monthly ladder is the real answer), a
stronger-than-hard bot (the bench is a graveyard of intuitive ideas that lose),
friends/DMs/clans (the room is the social unit), any currency or shop (it
would cheapen every already-earned unlock), and scheduled re-engagement pushes
(2026-07-30: a daily-deal or streak-about-to-break reminder is nag territory —
a push should mean a PERSON is waiting on you, so turn alerts and host-join
stay the only pushes and the worker keeps no cron; the in-flow surfaces do the
inviting instead). Cutting "Host a public table" was
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

## Embed bridge (dads)

`dads.marcportal.com` frames Jaffre beside its chat so a group can talk and
play at the same table. The whole contract is `apps/web/src/embed.ts` — one
file, one-way in each direction, and nothing else in the app knows an embedder
exists:

- **in** — `?name=` seeds the player's name (adopted in `main.tsx` BEFORE
  `consumeJoinPath()`, which rewrites the URL and would drop the search with
  it, and before Home mints a guest token for `'Player'`); `?from=dads` shows
  `BackToDads`, deliberately left in the URL so it survives a reload.
- **out** — versioned `postMessage` table events (`seated`/`left`/
  `game-started`/`game-over`) emitted from the one inbound dispatch in
  `net/socket.ts`, addressed to an allowlisted origin taken from the
  **referrer**, never from a parameter. A localhost embedder is trusted only
  by a localhost Jaffre.
- Install UI is suppressed when framed (`isEmbedded()` in `pwa/install.ts`,
  OR'd into both gates — they cannot drift).
- `playerName`/`setPlayerName` moved to the leaf `net/playerName.ts` and are
  re-exported from `net/socket.ts`; boot-time code needed them without
  dragging the store graph (and its module-load `localStorage` reads) along.

Covered by `apps/web/test/embed.test.ts` (16, the refusal cases a browser
cannot stage) and `apps/web/e2e/embed.spec.ts` (3, the visible half).

Deliberately NOT done: no `frame-ancestors` allowlist. Jaffre has never sent
one and anyone can frame it today; adding it is a separate decision, and the
two places to touch would be `routes/join.ts`'s headers and the
`env.ASSETS.fetch` fallthrough in `index.ts`.
