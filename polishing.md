# polishing.md — the perfection backlog

A living list of **improvements to existing features only** — no new features, no bloat.
Rules of this document:

- Every item names the exact file/element and the exact change. If an item can't be
  stated that concretely, it doesn't belong here.
- Ranked best-first within each theme. `S` = small (minutes), `M` = medium (an hour-ish).
- Check items off as they ship; add new ones at the bottom of their theme with the same
  format. Prune anything that stops being true.
- The filter is **UX simplicity first**: refinements and cuts beat additions. When in
  doubt, an item should make the game feel _simpler_, faster, or more consistent.

Sourced from a five-theme code sweep on 2026-07-24 (home/meta, felt table, lobby/social,
i18n/copy, perf/tech). Line numbers drift — re-locate by the described element.

---

## Pick of the litter (start here)

- [ ] **(M) FR tutoiement pass on ALL unlock/requirement copy** — the single biggest
      copy inconsistency: `cosmetics.ts`, `awards.ts`, `theme.ts`, `progression.ts:141`,
      `Leaderboard.tsx` all say "Gagnez/Atteignez/Réussissez/Jouez/Terminez" (vous) while every
      gameplay surface says _tu_. One coordinated pass → "Gagne / Atteins / Réussis / Joue /
      Termine / Peins ta carte". Smoking gun: `awards.ts:129` mixes both registers in ONE
      string ("Terminez le tutoriel. Débloque le bonhomme…").
- [ ] **(S/M) Code-split routes with `React.lazy`** — all 13 screens are eagerly imported
      in `App.tsx:19-32`; zero dynamic imports in the app → one 898 KB index chunk (the Vite
      warning in every build). Lazy every non-Home/non-Table route behind `Suspense`; hash
      navigation already implies a screen swap.
- [ ] **(S) Error states that aren't infinite spinners** — `Corner.tsx` and `Journey.tsx`
      `catch` → `setStats(null)` which IS the loading state, so a failed fetch spins
      `PixelWave` forever. Add the error branch + CTA that `Stats.tsx` already has.
- [ ] **(S) Roster broadcast stringifies once** — `GameRoom.ts` `broadcastRoster` calls
      `JSON.stringify` per socket for an identical payload; `Lobby.ts:121` already does it
      right (stringify once, send the shared string). Make GameRoom match.
- [ ] **(S) Seat-chip badge collision** — `SeatChip.tsx:146-169`: the turn-timer pill and
      the auto-play badge render in the same absolute slot and can stack on one seat. Make
      them mutually exclusive (auto-play suppresses the countdown — a bot already covers).

---

## Home & meta screens

- [ ] (S) `Corner.tsx` + `Journey.tsx` — failed `fetchStats` must show an error note, not
      eternal `PixelWave` (see pick-of-litter).
- [ ] (S) `Stats.tsx` — `recentCaption` says "newest last" but the Recent table renders
      `[...recent].reverse()` (newest first). Fix the caption or drop the reverse.
- [ ] (M) Five near-identical `SHELL_NOTE` constants (Corner/Awards/Stats/Leaderboard/
      PublicLobby) with disagreeing padding (`1.4em` vs `1.2em`). One shared `<ShellNote>`.
- [ ] (M) The `AvatarChip + h1 + Home Cta` header is copy-pasted across all meta screens
      AND inconsistent (Collection/Leaderboard/PublicLobby omit the avatar). Extract
      `<MetaHeader>`; one rule for the avatar.
- [ ] (S) Loading copy is ad-hoc: Stats "Dealing…/On brasse…", PublicLobby "Finding
      tables…", the rest "Loading…". Pick one idiom for the meta surface.
- [ ] (M) Four progress bars (Awards/Journey/LevelBadge/Corner) share the idiom but
      mismatch heights (0.4/0.55/0.8em) and Awards alone drops the ink border. Extract
      `<ProgressBar>`.
- [ ] (S) `PlayMenu.tsx` — `tables.slice(0, 4)` silently hides a 5th standing table.
      Add a "+N more → Your corner" row (or raise the cap).
- [ ] (M) `TableCards.tsx` `useTableStatuses` peeks once on mount — the "Your turn"
      pulse goes stale while Home sits open. Re-peek on window focus (cheap, no polling).
- [ ] (M) `Home.tsx` — `useState(listTables)` never re-reads on route re-entry; a table
      created/finished elsewhere in-session is stale. Re-read on hashchange back to home or
      window focus.
- [ ] (M) `Home.tsx` "Your corner" row and `LevelBadge` are the same nav-row idiom built
      twice by hand. Factor a shared `<HomeNavRow icon label onClick>`.
- [ ] (S) `Corner.tsx` h1 "Your corner" sits directly above a MetaNav tab also labelled
      "Your corner". Consider a shorter current-tab label to kill the stacked duplicate.
- [ ] (S) `PublicLobby.tsx` empty-state copy references Quick Play but renders _below_
      the button it points at. Reorder so the pointer precedes the CTA.

## Felt table & gameplay

- [ ] (S) `SeatChip.tsx` — turn-timer pill + auto-play badge can stack (see
      pick-of-litter).
- [ ] (S) `Seat.tsx` (packages/ui) — on phones the whose-turn signal is only a 2px violet
      avatar ring (plate chrome + "Playing" label are `max-sm:hidden`). Strengthen the active
      avatar on mobile: thicker ring/soft glow/gentle pulse.
- [ ] (S) `ScoreStrip.tsx:732` — the whose-turn "action" line (the novice's anchor) is the
      _smallest_ text in the phone HUD (`max-sm:text-[0.55em]`). Bump to ≥0.62em.
- [ ] (M) `PlayerPeek.tsx` — refetches stats/leaderboard on every popover open with a
      "Loading…" flash. Session-cache the record and render last-known immediately.
      (Pairs with the fetch-dedupe item under Perf.)
- [ ] (S) `GameLogPanel.tsx:60` — log close button is 28px (`size-7`); bump to `size-9`+.
- [ ] (M) `UtilityRow.tsx` — 32px edge-to-edge cells with 2px dividers; auto-play is a
      costly mis-tap neighbor. Raise the mobile floor toward 40px or add gutters.
- [ ] (S) `DealIntro.tsx` — 1.7s+fade decorative deal replays EVERY round and renders at
      `z-30`, above the `z-[15]` BidOverlay. Trim to ~1s and drop it below the auction.
- [ ] (M) `Replay.tsx:220-231` — the "View as" seat selector is `max-sm:hidden`; phone
      viewers are locked to seat 1. Fold it into a compact mobile control.
- [ ] (S) `GameRecap.tsx` — "Still at the table" shows `connected` as "Ready", ignoring
      the per-seat `ready` flag. Reflect ready like the round summary does.
- [ ] (M) `PlayerPeek.tsx:214` — public standing matched by display NAME; duplicate names
      show the wrong Elo. Match a stable id or mark ambiguity.
- [ ] (M) `RoundSummaryOverlay.tsx` — the who-are-we-waiting-on list is undifferentiated
      tiny text. Use small avatar chips / team colors.
- [ ] (M) `SeatChip.tsx` — your own "Bot plays in 0:15" pill offers no tap-to-dismiss
      "I'm here". Make the pill on your own seat tappable to reset the clock.
- [ ] (S) `TrickBanner.tsx` / `CoachHint.tsx` — both anchor `bottom-[4%] left-1/2`,
      possibly crowding the bottom-left seat chip on narrow phones. Verify + nudge on max-sm.
- [ ] (S) `TrickArea.tsx:87` — sweep duration hardcoded 0.56s, not token-driven; verify
      reduced-motion makes it instant and source it from a motion token.
- [ ] (S) `ScoreStrip.tsx:297` — score flash keyed by score VALUE; a repeated value skips
      the flash. Key on a monotonic tick.

## Lobby, rooms & social

- [ ] (S) `PublicLobby.tsx` — the header "Live" pulse (list auto-updates) and the
      per-card red "LIVE" (game in progress) use the same word for two meanings. Rename the
      header one ("Auto-updating" / "Mise à jour en direct").
- [ ] (S) `SeatPicker.tsx` — `hostSeat` is threaded in but only gates kick; nothing shows
      WHO the host is. Add a small "Host"/"Hôte" tag on that seat.
- [ ] (M) `Lobby.tsx` — public/private is invisible without opening House rules (the
      auto-open effect explicitly excludes `public`). Now that Private table exists, add a
      compact public/private pill near the ShareButton.
- [ ] (S/M) `Lobby.tsx` — the disabled Start button carries the only instruction
      ("Waiting for players — add bots…"). Keep "Start the game" disabled + a helper line
      below with the live count ("2 seats left" / "2 sièges à remplir").
- [ ] (S) `Lobby.tsx` — a dropped connection shows only muted "Reconnecting…" text while
      the felt gets the red `ConnectionBanner`. Reuse the banner in the lobby.
- [ ] (S) `MusicDock.tsx` — dock "Stop"/"Couper" only mutes YOU but reads room-wide.
      Align with the panel's "Stop listening"/"Couper la musique".
- [ ] (M) `MusicQueuePanel.tsx` — paste→Add clears the input with no pending signal until
      oEmbed resolves. Add an "Adding…"/"Ajout…" ghost row until the next music state.
- [ ] (S/M) `VoiceBar.tsx` (packages/ui) — idle voice is an unlabeled mic icon buried in
      the chat send row. Give it its visible "Join voice"/"Vocal" label.
- [ ] (S) `VoiceBar.tsx:134-140` — voice error state removes the join button entirely.
      Add "Try again"/"Réessayer".
- [ ] (M) `NoticeToast.tsx` + `socket.ts` — server rejections (seat taken, rate limit,
      bad link) render verbatim English. Map the server `code` (already sent) to localized
      client strings for the common cases.
- [ ] (M) `PublicLobby.tsx` — full-but-waiting rooms still show an enabled "Join" that
      the server bounces. Render disabled "Full"/"Complète" when `players >= capacity`.
- [ ] (S) `Toast.tsx` (2s) vs `NoticeToast.tsx` (5s) — two dwell times for sibling
      bubbles. One shared constant.
- [ ] (S) `MusicQueuePanel.tsx:137-140` — "Added by" built via `addedBy('')` + glued
      component (trailing-space landmine, FR gender-fixed "Ajoutée"). Make the name a real
      substitution slot.
- [ ] (S) `ShareButton.tsx:45-47` — clipboard failure is swallowed silently; fall back to
      opening the ShareSheet (selectable link) instead of doing nothing.
- [ ] (S) `Lobby.tsx` — EN keeps the branded "Hail-Mary 12 sans atout", FR drops the
      brand. Align both languages on one name.
- [ ] (S) `Visitor.tsx` — an "Away" human seat offers no path and no explanation. One
      hint line: "Away seats free up or pass to a bot shortly."
- [ ] (S) `RoomComms.tsx` — a queued song produces no signal on the Music tab while
      you're on Chat. Mirror chat's unread-dot via the existing `seenRef` pattern.

## i18n & copy

- [ ] (M) **Tutoiement pass** on cosmetics/awards/theme/progression/Leaderboard unlock
      copy (see pick-of-litter; includes the mixed-register `awards.ts:129` and
      `Leaderboard.tsx` empty string).
- [ ] (S) `GameRecap.tsx:119` — "Touchez une ronde…" → "Touche une ronde…" (vous leak in
      gameplay).
- [ ] (M) Team labels defined in ~7 files with real drift (`l'Équipe Soleil` vs `Équipe
Soleil`). Promote one bilingual `TEAM_LABELS` in `teams.ts` and import everywhere.
- [ ] (S) EN oscillates "bid"/"bet" for the one FR "mise" (BidPanel vs BetCards vs
      PlayerPeek vs RoundSummary). Standardize on "bid".
- [ ] (S) `SeatPicker.tsx` — imperative tu ("Assis-toi ici") next to bare infinitives
      ("Échanger ici", "Joindre"). Align: "Échange ici", "Joins-toi".
- [ ] (S) "Starting hands"/"Mains de départ" defined twice (GameRecap +
      StartingHandsPanel). Consolidate into StartingHandsPanel's table.
- [ ] (M) `SeatPicker.tsx` — FR seat buttons ("Déplace-toi ici") are ~2× EN width in a
      horizontal row; verify wrap on narrow phones or shorten FR.
- [ ] (S) `RoomComms.tsx` — "Clavardage et musique" is long for the collapsed toggle
      cell; verify truncation, shorten if it clips.
- [ ] (S) `Stats.tsx:261` — date locale `'en'` → `'en-CA'` (FR already `fr-CA`).
- [ ] (S) `ChatPanel.tsx:69-72` — timestamps hand-built `HH:MM`; use
      `toLocaleTimeString(locale)` so EN gets 12h.
- [ ] (S) `GameRecap.tsx:88` — personal Elo labelled FR "Classement" (= standings, and
      already the Leaderboard's title). Use "Cote".
- [ ] (S) `PlayerPeek.tsx:93` — FR "Taux" is bare; "% victoires" is clearer and matches
      existing cosmetic copy.

## Performance & tech

- [ ] (S/M) **`React.lazy` the route screens** (see pick-of-litter; 898 KB index chunk).
- [ ] (S/M) Lazy the heavy leaf deps: `qrcode-generator` (rides into the main chunk via
      ShareSheet) → dynamic import inside the component; paint editor covered by lazy routes.
- [ ] (S) `GameRoom.ts` `broadcastRoster` — stringify once (see pick-of-litter).
- [ ] (S) Home fires TWO concurrent `/api/stats` (LevelBadge + reconcileCosmetics).
      One-line in-flight promise dedupe in `net/history.ts`.
- [ ] (M) No JS-layer cache for stats/awards/history: Home→Corner→Journey→Stats→Awards
      re-hits `/api/stats` 5+ times per session (9 fetchStats call sites). Add a ~30s TTL
      cache keyed on identity in `net/history.ts` / `net/awards.ts`. (Also fixes the
      PlayerPeek loading flash.)
- [ ] (M) `useTableDerived.ts:205` + `useQueuedPlay.ts:22` — whole-store `useGameStore()`
      subscriptions in the hot table render path; convert to `useShallow` selectors.
- [ ] (S) `main.tsx` imports all `@fontsource-variable/rubik` subsets — ~80 KB of
      arabic/cyrillic/hebrew/vietnamese woff2 bundled + SW-precached for an en/fr app.
      Import the latin(-ext) entrypoints only.
- [ ] (S) `index.html` — no font preload; @fontsource faces are discovered after JS
      parses → guaranteed FOUT on cold load. Preload the two primary latin woff2.
- [ ] (S/M) `Collection.tsx:191` — 48 KB og-card JPG rendered at ~46px with no
      width/height (CLS). Thumbnail variant or at least intrinsic dimensions.
- [ ] (M) `useTableStatuses` — N parallel status fetches per Home visit; candidate for a
      batched `/api/table-status?codes=` endpoint (needs a server route — only if N grows).
- [ ] (S) `QrCode.tsx:18-30` — QR re-encoded on every render; `useMemo` on `value`.
- [ ] (S) `App.tsx` reconcile effect — gate the unlock-toast fetch behind
      `requestIdleCallback`; it never blocks UI.
- [ ] (S) `vite.config.ts` og-cards cache `CacheFirst` 30d can pin stale art if a file is
      ever replaced in place; switch to `StaleWhileRevalidate` (matches api-reads).

---

## Verified-good (don't "polish" these into regressions)

- Felt layering/theming is coherent post-revert; BidOverlay's `z-[15]` is deliberate.
- Toasts carry `role="status"`/`aria-live`; `:focus-visible` is global; motion is gated
  on `prefers-reduced-motion`; the YouTube API is already lazy-loaded.
- `LISTEN_VOLUME_FLOOR` anti-silence guard and the socket reconnect intent queue are
  sound.
- FR gameplay glossary (levée/mise/brasseur/ronde/siège) is clean everywhere — the drift
  is register (tu/vous) and duplication, not vocabulary.
