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
  leaderboard, claim reservation/vacate closed.
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

- 176 e2e (`npm run e2e`; chromium = reduced motion, chromium-motion = the
  only project that watches pixels move) · 63-scene catalog, each axe-gated ·
  110 web unit · 164 server · engine property tests (100% cov).
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

## Open threads (the honest short list)

- `apps/server/src/index.ts` (1,906 lines) — same carve treatment as
  GameRoom when a session allows.
- Phase-4 cosmetics follow-ups that never bit: Visitor TTF, QR polish,
  nemesis stat.
