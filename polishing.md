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

- [x] **(M) FR tutoiement pass on ALL unlock/requirement copy** — the single biggest
      copy inconsistency: `cosmetics.ts`, `awards.ts`, `theme.ts`, `progression.ts:141`,
      `Leaderboard.tsx` all say "Gagnez/Atteignez/Réussissez/Jouez/Terminez" (vous) while every
      gameplay surface says _tu_. One coordinated pass → "Gagne / Atteins / Réussis / Joue /
      Termine / Peins ta carte". Smoking gun: `awards.ts:129` mixes both registers in ONE
      string ("Terminez le tutoriel. Débloque le bonhomme…").
- [x] **(S/M) Code-split routes with `React.lazy`** — all 13 screens are eagerly imported
      in `App.tsx:19-32`; zero dynamic imports in the app → one 898 KB index chunk (the Vite
      warning in every build). Lazy every non-Home/non-Table route behind `Suspense`; hash
      navigation already implies a screen swap.
- [x] **(S) Error states that aren't infinite spinners** — `Corner.tsx` and `Journey.tsx`
      `catch` → `setStats(null)` which IS the loading state, so a failed fetch spins
      `PixelWave` forever. Add the error branch + CTA that `Stats.tsx` already has.
- [x] **(S) Roster broadcast stringifies once** — `GameRoom.ts` `broadcastRoster` calls
      `JSON.stringify` per socket for an identical payload; `Lobby.ts:121` already does it
      right (stringify once, send the shared string). Make GameRoom match.
- [x] **(S) Seat-chip badge collision** — `SeatChip.tsx:146-169`: the turn-timer pill and
      the auto-play badge render in the same absolute slot and can stack on one seat. Make
      them mutually exclusive (auto-play suppresses the countdown — a bot already covers).
      DONE (see Felt table & gameplay for the matching entry).

---

## Home & meta screens

- [x] (S) `Corner.tsx` + `Journey.tsx` — failed `fetchStats` must show an error note, not
      eternal `PixelWave` (see pick-of-litter). DONE: both now track a separate `error`
      state and render a bilingual message (Corner via the new `<ShellNote>`, Journey via
      its existing `Panel` idiom) instead of sitting in `stats === null`/`progress === null`
      forever.
- [x] (S) `Stats.tsx` — `recentCaption` says "newest last" but the Recent table renders
      `[...recent].reverse()` (newest first). Fix the caption or drop the reverse. DONE:
      caption (sr-only, not e2e-pinned) now reads "newest first" / "les plus récentes en
      premier" to match the actual render order.
- [x] (M) Five near-identical `SHELL_NOTE` constants (Corner/Awards/Stats/Leaderboard/
      PublicLobby) with disagreeing padding (`1.4em` vs `1.2em`). One shared `<ShellNote>`.
      DONE for Corner/Awards/Stats/Leaderboard → `apps/web/src/components/ShellNote.tsx`
      (padding `1.4em`). PublicLobby's local copy is untouched — owned by another
      workstream, per this pass's scope.
- [x] (M) The `AvatarChip + h1 + Home Cta` header is copy-pasted across all meta screens
      AND inconsistent (Collection/Leaderboard/PublicLobby omit the avatar). Extract
      `<MetaHeader>`; one rule for the avatar. DONE: `apps/web/src/components/MetaHeader.tsx`,
      used by Corner/Journey/Awards/Stats/Collection/Leaderboard (avatar now shows on
      Collection + Leaderboard too). PublicLobby keeps its own header (out of scope).
- [x] (S) Loading copy is ad-hoc: Stats "Dealing…/On brasse…", PublicLobby "Finding
      tables…", the rest "Loading…". Pick one idiom for the meta surface. VERIFIED:
      Corner/Journey/Awards/Leaderboard were already plain "Loading…"/"Chargement…";
      Stats keeps its themed "Dealing…/On brasse…" as the one deliberate exception. No
      copy changes needed beyond confirming the four align.
- [x] (M) Four progress bars (Awards/Journey/LevelBadge/Corner) share the idiom but
      mismatch heights (0.4/0.55/0.8em) and Awards alone drops the ink border. Extract
      `<ProgressBar>`. DONE: `apps/web/src/components/ProgressBar.tsx`, one height
      (0.55em) + ink border, used by all four.
- [x] (S) `PlayMenu.tsx` — `tables.slice(0, 4)` silently hides a 5th standing table.
      Add a "+N more → Your corner" row (or raise the cap). DECIDED simplest per
      UX-simplicity: raised the slice cap to 6 (= `MAX` in `net/rooms.ts`, the storage
      cap), so nothing is ever hidden — no "+N more" row needed.
- [x] (M) `TableCards.tsx` `useTableStatuses` peeks once on mount — the "Your turn"
      pulse goes stale while Home sits open. Re-peek on window focus (cheap, no polling).
      DONE.
- [x] (M) `Home.tsx` — `useState(listTables)` never re-reads on route re-entry; a table
      created/finished elsewhere in-session is stale. Re-read on hashchange back to home or
      window focus. DONE: re-reads `listTables()` on window focus.
- [x] (M) `Home.tsx` "Your corner" row and `LevelBadge` are the same nav-row idiom built
      twice by hand. Factor a shared `<HomeNavRow icon label onClick>`. DONE:
      `apps/web/src/home/HomeNavRow.tsx`; LevelBadge stays an `<a href="#journey">`,
      Home's corner row stays a `<button>` — testids/roles/text preserved.
- [x] (S) SKIPPED: `Corner.tsx` h1 "Your corner" sits directly above a MetaNav tab also
      labelled "Your corner". Renaming either is a pinned e2e string (MetaNav's "Ton coin"
      link is asserted by i18n/journey/stats specs) — left as-is to avoid breaking them.
- [x] (S) `PublicLobby.tsx` empty-state copy references Quick Play but renders _below_
      the button it points at. Reorder so the pointer precedes the CTA. DONE: Quick Play
      moved after the live rooms list/empty-state, so the pointer text now precedes the CTA.

## Felt table & gameplay

- [x] (S) `SeatChip.tsx` — turn-timer pill + auto-play badge can stack (see
      pick-of-litter). DONE: the turn-timer pill is now suppressed whenever `info.autoPlay`
      is on (the badge already covers it).
- [x] (S) `Seat.tsx` (packages/ui) — on phones the whose-turn signal is only a 2px violet
      avatar ring (plate chrome + "Playing" label are `max-sm:hidden`). Strengthen the active
      avatar on mobile: thicker ring/soft glow/gentle pulse. DONE: `max-sm:border-[3px]` +
      a new static (no-pulse) `.seat-turn-glow-sm` utility in `tokens.css`, media-gated to
      the same `max-sm` breakpoint — safe under any motion preference by construction.
- [x] (S) `ScoreStrip.tsx:732` — the whose-turn "action" line (the novice's anchor) is the
      _smallest_ text in the phone HUD (`max-sm:text-[0.55em]`). Bump to ≥0.62em. DONE.
- [x] (M) `PlayerPeek.tsx` — refetches stats/leaderboard on every popover open with a
      "Loading…" flash. Session-cache the record and render last-known immediately.
      (Pairs with the fetch-dedupe item under Perf.) DONE: the 30s TTL `cached()` wrapper
      already covered `fetchStats`; `fetchLeaderboard` in `net/history.ts` did NOT have it —
      wrapped it too (`leaderboardCache`), so PlayerPeek's `PublicStanding` benefits like
      `OwnRecord` already did. Also busted by `bustStatsCache()`.
- [x] (S) `GameLogPanel.tsx:60` — log close button is 28px (`size-7`); bump to `size-9`+.
      DONE.
- [x] (M) `UtilityRow.tsx` — 32px edge-to-edge cells with 2px dividers; auto-play is a
      costly mis-tap neighbor. Raise the mobile floor toward 40px or add gutters. DONE:
      `ARCADE.iconBtnBase/iconBtnLabeled/iconBtnCell` clamp floor raised `2rem` → `2.5rem`
      (40px) in `packages/ui/src/components/arcade.tsx`, plus a 2px gap between cells in
      `UtilityRow.tsx`'s bar. Verified with the scenes `fit` e2e (see report).
- [x] (S) `DealIntro.tsx` — 1.7s+fade decorative deal replays EVERY round and renders at
      `z-30`, above the `z-[15]` BidOverlay. Trim to ~1s and drop it below the auction.
      DONE: `DEAL_MS` 1700 → 1000; layer `z-30` → `z-10` (below BidOverlay's `z-[15]`).
- [x] (M) `Replay.tsx:220-231` — the "View as" seat selector is `max-sm:hidden`; phone
      viewers are locked to seat 1. Fold it into a compact mobile control. DONE: dropped
      the hidden class (compact width/padding/text on `max-sm`); the frame counter (`1 / N`,
      redundant with the scrubber) now yields the room on phones instead via its own
      `max-sm:hidden` — no functional loss, the e2e spec runs Desktop Chrome so is unaffected.
- [x] (S) `GameRecap.tsx` — "Still at the table" shows `connected` as "Ready", ignoring
      the per-seat `ready` flag. Reflect ready like the round summary does. DONE, with a
      caveat: the server only populates `RosterSeat.ready` during `round_over` (see
      `GameRoom.ts` `readyState`/`broadcastRoster`) — it's never set at `game_over`, so a
      literal `ready ?? isBot` (RoundSummaryOverlay's exact expression) would show every
      connected human as "Away" right after the game ends. Used
      `s.ready ?? s.isBot ?? s.connected ?? false`: honors the flag when the server ever
      sends one (mirrors RoundSummaryOverlay), falls back to `connected` (today's behavior)
      when it doesn't — no regression, and future-proofed if a rematch-ready flag is added.
- [x] (M) SKIPPED: `PlayerPeek.tsx:214` — public standing matched by display NAME;
      duplicate names show the wrong Elo. Needs a stable id on the leaderboard payload —
      a server-side change (LeaderboardRow/roster), out of scope for a surgical client pass.
- [x] (M) SKIPPED: `RoundSummaryOverlay.tsx` — the who-are-we-waiting-on list is
      undifferentiated tiny text. Avatar chips / team colors is a visual redesign of that
      list, not a small surgical fix — deferred.
- [x] (M) SKIPPED: `SeatChip.tsx` — your own "Bot plays in 0:15" pill offers no
      tap-to-dismiss "I'm here". Tap-to-reset is a new interaction (needs a client→server
      message + server handling to actually push the clock back) — deferred.
- [x] (S) `TrickBanner.tsx` / `CoachHint.tsx` — both anchor `bottom-[4%] left-1/2`,
      possibly crowding the bottom-left seat chip on narrow phones. Verify + nudge on max-sm.
      DONE: nudged `TrickBanner` up on phones (`max-sm:bottom-[12%]`) — the trick-won moment
      and the coach's turn hint can plausibly straddle the same instant near the bottom rim.
- [x] (S) `TrickArea.tsx:87` — sweep duration hardcoded 0.56s, not token-driven; verify
      reduced-motion makes it instant and source it from a motion token. DONE: extracted a
      named `SWEEP_DURATION_S = 0.56` constant with a comment tying it to tokens.css's
      `--duration-sweep: 560ms` (framer-motion transitions need a JS number, so it mirrors
      rather than reads the CSS var). Reduced motion already zeroes it via
      `JaffreMotionConfig`'s `reducedMotion="user"` (motion/config.tsx), confirmed upstream.
- [x] (S) `ScoreStrip.tsx:297` — score flash keyed by score VALUE; a repeated value skips
      the flash. Key on a monotonic tick. DONE: `TeamSide` now tracks a `flashTickRef` that
      advances whenever score, trick count, OR round points change — so a round that nets a
      team back to a score it already sat at (a push) still re-triggers the flash.

## Lobby, rooms & social

- [x] (S) `PublicLobby.tsx` — the header "Live" pulse (list auto-updates) and the
      per-card red "LIVE" (game in progress) use the same word for two meanings. Rename the
      header one ("Auto-updating" / "Mise à jour en direct"). DONE: header reads "Live
      list"/"Liste en direct" — kept the per-card "LIVE" badge untouched.
- [x] (S) `SeatPicker.tsx` — `hostSeat` is threaded in but only gates kick; nothing shows
      WHO the host is. Add a small "Host"/"Hôte" tag on that seat. DONE: reuses the
      difficulty-chip chrome (gold outline) next to the host's own seated chip.
- [x] (M) `Lobby.tsx` — public/private is invisible without opening House rules (the
      auto-open effect explicitly excludes `public`). Now that Private table exists, add a
      compact public/private pill near the ShareButton. DONE: reads `roster.public`
      (same field the House-rules toggle drives); display-only pill next to ShareButton.
- [x] (S/M) `Lobby.tsx` — the disabled Start button carries the only instruction
      ("Waiting for players — add bots…"). Keep "Start the game" disabled + a helper line
      below with the live count ("2 seats left" / "2 sièges à remplir"). DONE: button always
      reads "Start the game" (disabled when `!full`); helper line below shows
      `waitingHelper(emptySeats)`. sceneManifest's `lobby-open` probe updated (was keyed on
      the old button name).
- [x] (S) `Lobby.tsx` — a dropped connection shows only muted "Reconnecting…" text while
      the felt gets the red `ConnectionBanner`. Reuse the banner in the lobby. DONE: imports
      the table's `ConnectionBanner` (read-only) into Lobby; the header paragraph now only
      distinguishes "Connecting…" vs the normal share hint.
- [x] (S) `MusicDock.tsx` — dock "Stop"/"Couper" only mutes YOU but reads room-wide.
      Align with the panel's "Stop listening"/"Couper la musique". DONE.
- [x] (M) `MusicQueuePanel.tsx` — paste→Add clears the input with no pending signal until
      oEmbed resolves. Add an "Adding…"/"Ajout…" ghost row until the next music state. DONE:
      pending URL tracked locally, cleared on the next `musicStore` state (new object
      reference each server push) or on an error notice.
- [x] (S/M) `VoiceBar.tsx` (packages/ui) — idle voice is an unlabeled mic icon buried in
      the chat send row. Give it its visible "Join voice"/"Vocal" label. DONE: switched to
      `ARCADE.iconBtnLabeled` and render the (existing) T-key text next to the mic icon.
- [x] (S) `VoiceBar.tsx:134-140` — voice error state removes the join button entirely.
      Add "Try again"/"Réessayer". DONE: `data-testid="voice-retry"` button re-invokes
      `onJoin`.
- [x] (M) `NoticeToast.tsx` + `socket.ts` — server rejections (seat taken, rate limit,
      bad link) render verbatim English. Map the server `code` (already sent) to localized
      client strings for the common cases. DONE: new `net/noticeCodes.ts` —
      `Record<string, Record<Lang, string>>` for SEAT_TAKEN/CHAT_RATE/MUSIC_RATE/
      MUSIC_QUEUE_FULL/MUSIC_BAD_URL/MUSIC_UNAVAILABLE/KICKED/NOT_HOST/ALREADY_STARTED,
      applied in `socket.ts`'s `error` handler; unmapped codes keep the raw English message.
- [x] (M) `PublicLobby.tsx` — full-but-waiting rooms still show an enabled "Join" that
      the server bounces. Render disabled "Full"/"Complète" when `players >= capacity`. DONE.
- [x] (S) `Toast.tsx` (2s) vs `NoticeToast.tsx` (5s) — two dwell times for sibling
      bubbles. One shared constant. DONE: `components/toastTiming.ts` exports
      `TOAST_DWELL_MS = 3500`, used by both.
- [x] (S) `MusicQueuePanel.tsx:137-140` — "Added by" built via `addedBy('')` + glued
      component (trailing-space landmine, FR gender-fixed "Ajoutée"). Make the name a real
      substitution slot. DONE: replaced with a static `addedByLabel` + the styled
      `<AdderName>` component (no more empty-string call); FR keeps "Ajoutée par" (agrees
      with the implicit "chanson").
- [x] (S) `ShareButton.tsx:45-47` — clipboard failure is swallowed silently; fall back to
      opening the ShareSheet (selectable link) instead of doing nothing. DONE.
- [x] (S) `Lobby.tsx` — EN keeps the branded "Hail-Mary 12 sans atout", FR drops the
      brand. Align both languages on one name. DONE: FR now "Hail-Mary 12 sans atout — tout
      ou rien" (brand kept both sides).
- [x] (S) `Visitor.tsx` — an "Away" human seat offers no path and no explanation. One
      hint line: "Away seats free up or pass to a bot shortly." DONE, shown when any seated
      human is disconnected.
- [x] (S) `RoomComms.tsx` — a queued song produces no signal on the Music tab while
      you're on Chat. Mirror chat's unread-dot via the existing `seenRef` pattern. DONE:
      a `musicSeenRef` tracks the queue length seen while the Music tab is active; a gold
      dot appears on the tab when the queue grows while parked on Chat.

## i18n & copy

- [x] (M) **Tutoiement pass** on cosmetics/awards/theme/progression/Leaderboard unlock
      copy (see pick-of-litter; includes the mixed-register `awards.ts:129` and
      `Leaderboard.tsx` empty string).
- [x] (S) `GameRecap.tsx:119` — "Touchez une ronde…" → "Touche une ronde…" (vous leak in
      gameplay).
- [x] (M) Team labels defined in ~7 files with real drift (`l'Équipe Soleil` vs `Équipe
Soleil`). Promote one bilingual `TEAM_LABELS` in `teams.ts` and import everywhere.
- [x] (S) EN oscillates "bid"/"bet" for the one FR "mise" (BidPanel vs BetCards vs
      PlayerPeek vs RoundSummary). Standardize on "bid".
- [x] (S) `SeatPicker.tsx` — imperative tu ("Assis-toi ici") next to bare infinitives
      ("Échanger ici", "Joindre"). Align: "Échange ici", "Joins-toi".
- [x] (S) "Starting hands"/"Mains de départ" defined twice (GameRecap +
      StartingHandsPanel). Consolidate into StartingHandsPanel's table.
- [x] (M) `SeatPicker.tsx` — FR seat buttons ("Déplace-toi ici") are ~2× EN width in a
      horizontal row; verify wrap on narrow phones or shorten FR. DONE: FR shortened
      ("Viens ici", "Ajoute un bot" — also fixes the infinitive-register drift), empty-seat
      Ctas compacted to the occupied rows' height, and the row wraps gracefully. A new
      `lobby-open-fr` scene keeps FR width under gallery watch.
- [x] (S) `RoomComms.tsx` — "Clavardage et musique" is long for the collapsed toggle
      cell; verify truncation, shorten if it clips. VERIFIED no-change: the string is only
      the aria-label/tooltip of the icon-only chat toggle — nothing visible can clip.
- [x] (S) `Stats.tsx:261` — date locale `'en'` → `'en-CA'` (FR already `fr-CA`).
- [x] (S) `ChatPanel.tsx:69-72` — timestamps hand-built `HH:MM`; use
      `toLocaleTimeString(locale)` so EN gets 12h.
- [x] (S) `GameRecap.tsx:88` — personal Elo labelled FR "Classement" (= standings, and
      already the Leaderboard's title). Use "Cote".
- [x] (S) `PlayerPeek.tsx:93` — FR "Taux" is bare; "% victoires" is clearer and matches
      existing cosmetic copy.

## Performance & tech

- [x] (S/M) **`React.lazy` the route screens** (see pick-of-litter; 898 KB index chunk).
- [x] (S/M) Lazy the heavy leaf deps: `qrcode-generator` (rides into the main chunk via
      ShareSheet) → dynamic import inside the component; paint editor covered by lazy routes.
- [x] (S) `GameRoom.ts` `broadcastRoster` — stringify once (see pick-of-litter).
- [x] (S) Home fires TWO concurrent `/api/stats` (LevelBadge + reconcileCosmetics).
      One-line in-flight promise dedupe in `net/history.ts`.
- [x] (M) No JS-layer cache for stats/awards/history: Home→Corner→Journey→Stats→Awards
      re-hits `/api/stats` 5+ times per session (9 fetchStats call sites). Add a ~30s TTL
      cache keyed on identity in `net/history.ts` / `net/awards.ts`. (Also fixes the
      PlayerPeek loading flash.)
- [x] (M) `useTableDerived.ts:205` + `useQueuedPlay.ts:22` — whole-store `useGameStore()`
      subscriptions in the hot table render path; convert to `useShallow` selectors.
- [x] (S) `main.tsx` imports all `@fontsource-variable/rubik` subsets — ~80 KB of
      arabic/cyrillic/hebrew/vietnamese woff2 bundled + SW-precached for an en/fr app.
      Import the latin(-ext) entrypoints only.
- [ ] (S) `index.html` — no font preload; @fontsource faces are discovered after JS
      parses → guaranteed FOUT on cold load. Preload the two primary latin woff2.
      SKIPPED 2026-07-24: fontsource woff2 filenames get a Vite content hash
      (`rubik-latin-wght-normal-<hash>.woff2`) only known after build — index.html
      can't reference a stable path without hardcoding a dist hash that'll rot on
      the next build. Needs a build-time injection step (e.g. a small Vite plugin
      reading the manifest) to do safely; out of scope for this pass.
- [x] (S/M) `Collection.tsx:191` — 48 KB og-card JPG rendered at ~46px with no
      width/height (CLS). Thumbnail variant or at least intrinsic dimensions.
- [ ] (M) `useTableStatuses` — N parallel status fetches per Home visit; candidate for a
      batched `/api/table-status?codes=` endpoint (needs a server route — only if N grows).
- [x] (S) `QrCode.tsx:18-30` — QR re-encoded on every render; `useMemo` on `value`.
- [x] (S) `App.tsx` reconcile effect — gate the unlock-toast fetch behind
      `requestIdleCallback`; it never blocks UI.
- [x] (S) `vite.config.ts` og-cards cache `CacheFirst` 30d can pin stale art if a file is
      ever replaced in place; switch to `StaleWhileRevalidate` (matches api-reads).

---

## Visual audit — screenshot sweep 2026-07-24

307 gallery shots (51 scenes × desktop/small-desktop/tablet/phone, dark + light),
five parallel reviewers, top findings re-verified by eye. ZERO automated
overflow/top-bar warnings — everything below is judgment-call layout quality.

### High

- [x] (M) **Hub screens waste 40-60% of tall viewports** — DONE (revised): a
      first attempt centered the content column (`justify-center`), but the
      2nd sweep's reviewers unanimously read it as WORSE — the header jumped
      between short tabs (centered) and tall tabs (top-anchored), and short
      empty states "started 40% down, looks broken". Final form: all seven meta
      screens top-anchor with one consistent generous offset
      (`pt-[min(11vh,7rem)]`), so headers align across every tab and the void
      splits less glaringly.
- [x] (M) **Light theme's quiet states are near-invisible** — DONE: waiting
      screen + Replay loading line moved `--color-ap-muted` → `--color-ap-text`/75,
      identity skeleton fill `panel-hover` → `ink`/15, Help checklist rings
      `ink`/45 → `ink`/60. Spectator felt placeholder re-checked in the next sweep.
- [x] (S) **Reconnecting pill collides with seat rows** — DONE: `ConnectionBanner`
      gained an `inline` mode; the Lobby renders it in-flow as its own row between
      the header and the seat list (table keeps the fixed variant).
- [x] (S/M) **Round-over settings cluster on phone** — VERIFIED already fixed by
      the utility-row token pass: the Options drawer's buttons all sit on the
      shared `clamp(2.5rem,…)` (40px) floor with `gap-2`. Re-measured in the new
      sweep; no further change.

### Medium

- [x] (S) TableCards room names truncate mid-word — DONE: `truncate` →
      `line-clamp-2 break-words leading-tight` (codes wrap at their hyphens).
- [x] (M) Floating panels on the felt with no scrim — DONE (log): GameLogPanel
      gained a soft `bg-black/30` click-to-close scrim under the panel. Chat/
      score-details left as-is pending the new sweep's verdict.
- [x] (S) Customize sheet — PARTIALLY STALE: it already dims (`bg-black/60`).
      Widened `max-w-sm` → `sm:max-w-md` for tablet.
- [x] (S) Spectator's felt tall oval — DONE: Stage takes `capHeight` (spectators
      only, `max-h-[min(77vw,80rem)]`) so the felt keeps a table-like shape when
      no hand dock eats the portrait height.
- [x] (S) `phone-light-stats-veteran` "+430" clipped — DONE: StatPanel's value
      gets `min-w-0` + `max-sm:text-[1.7em]` so 4-char figures fit a third-of-
      phone-width column.
- [x] (S) Round-over modal trick peek-through — DONE: backdrop `bg-black/50` →
      `/70`, fading the trick layer + gold sliver behind the dialog.
- [x] (S) Tablet single-column CREATE/JOIN/PLAY stretch — DONE: Home's
      single-column grid cap `44rem` → `30rem` (matches the lg per-rail width).
- [x] (S) Lobby seat rows rhythm — DONE: empty-seat Ctas compacted
      (`px-[0.85em] py-[0.45em] text-[0.9em]`) to the occupied rows' height,
      with `flex-wrap` for narrow phones.

### Low

- [x] Share sheet URL field truncates with no full-value affordance. VERIFIED
      no-change: it's a read-only input that select-alls on focus — the full
      value is one tap away (and Copy sits beside it).
- [ ] Phone round-history header shows bare "R" vs desktop "ROUND".
- [ ] Practice human avatar is a plain initial circle next to pixel-art bots.
- [ ] `identity-light` scene stages a light modal on a dark page — verify it's a
      scene-staging artifact, not a reachable state.
- [ ] Home chrome bar packs 6 controls at 390px — tight but not colliding; keep
      an eye on it if another entry is ever added.

---

## Visual audit #2 — screenshot sweep 2026-07-24 (evening)

505 gallery shots (63 scenes — 15 NEW: awards ×2, leaderboard ×2, corner-empty,
journey-new, public-lobby-empty, customize, login-sheet, music-open,
visitor-away, home-fr, lobby-open-fr, awards a11y coverage — × 4 viewports,
dark + light), eight parallel reviewers (one per viewport×theme), top findings
re-verified by eye. ZERO automated overflow/top-bar warnings. Fixed in-flight
during this pass: MetaHeader HOME button clipping off 390px on
Collection/Leaderboard (min-w-0 + phone type scale), awards-fresh staged-data
contradiction (full 1/1 bars under "0/9 earned" → true zero record),
WaitingScreen + Replay loading → PixelWave (the lone pulsing line read as a
blank page, worst in light), spectator stage now `my-auto` (the aspect cap had
traded the tall oval for a bottom void), Awards locked tiles' AA contrast
(whole-tile opacity → ground fill + dimmed icon).

### High

- [ ] (M) **Bonhomme value badge clipped in the hand fan** — THE systemic find
      (flagged by 6 of 8 reviewers, visible in nearly every in-game shot): the
      green "+5" pill on the red 0 and the "−2" pill on the brown 0 are
      half-buried under the next overlapping card. It's a rules-meaning element.
      Render the pill above the neighbor (z on the badge layer) or anchor it to
      the card's exposed left edge.
- [ ] (M) **GameRecap clips its tables mid-row behind the sticky footer** — the
      TRICKS WON table (desktop/small-desktop) and "Still at the table" avatar
      row (tablet/phone) are sliced in half behind the Rematch bar with no
      scroll affordance; the panel scrolls but looks broken. Add bottom padding
      ≥ the footer height inside the scroll area + a soft bottom fade.
- [ ] (M) **Replay: stray card-back sprites + iconless transport buttons** —
      opponent card-back fans pierce their own seat plaques and a stray back
      overlaps the "You" pill and hand at every width; in LIGHT theme the
      scrubber's transport buttons render as blank white squares (icon color
      must be ink-based). Two bugs, one screen — worst shot family of the sweep.
- [ ] (S) **Visitor away-caption collides with the score tile** — "TEAM SUN ·
      AWAY" wraps and its second line is clipped by the SCORE box on every
      viewport (new `visitor-away` scene). Give the seat captions their own
      row-gap so the grid can't overlap them.
- [ ] (M) **Floating panels still bury live table state on tablet/phone** —
      chat/music/score-details sit on the played trick and seat chips (log now
      has a scrim, the others don't). Same fix as the log: soft scrim +
      click-to-close, or dock to the bottom edge above the hand.

### Medium

- [ ] (M) **Ghost duplicate of the rightmost hand card** (phone/tablet, many
      states) — a semi-transparent clone of the last card floats over the fan's
      right end, reading as a 9th card / stuck drag-preview; on desktop the same
      card just looks washed out. Likely a deal-in animation leftover on the
      last-dealt card. Investigate `DealIntro`/hand fan enter transition.
- [ ] (S) `lobby-open-fr` — the FR lobby runs just past 900px and "COMMENT
      JOUER" sits cut at the fold (EN fits). Tighten the lobby's vertical gaps
      or let the footer actions sit side-by-side in FR too.
- [ ] (S) `music-open` — meaning-losing truncation: now-playing title AND adder
      both ellipsize ("Un…", "Adde…", "Gin…") even where slack width exists.
      Two-line clamp for the title; drop the adder to its own muted line.
- [ ] (S) `your-tables` — sibling cards misalign: two-line room name pushes one
      RESUME lower, and "TONIGHT: SUN 0 — MOON 0" wraps leaving an orphan "0".
      `whitespace-nowrap` the tally; align card rows with a fixed-height name
      slot (the two-line name itself is fine).
- [ ] (S) `paint-studio` at 1024 — the right rail's 7th tool button clips at the
      panel edge; let the tool row wrap.
- [ ] (S) Journey "LV n" track chips clip the digit's bottom (tablet/desktop,
      both themes) — line-height/padding fix in the rung badge.
- [ ] (S) `auction-*` on phone — the bid panel's edge slices through the right
      seat chip, and Réal's PASS bubble lands on the SANS ATOUT button. Inset
      the panel below the side chips at max-sm.
- [ ] (S) Visitor chat-bubble trigger is ~28px, its "1" badge collides with
      LEAVE's corner (phone) — give it the shared 40px icon-button chrome.
- [ ] (S) Coach tip on phone renders as a ~140px-wide 7-line tower over the felt
      edge — give `CoachHint` a wider max-w at max-sm.
- [ ] (S) `home-create` — the "Bots: Normal" chip floats half off the play
      door's right edge instead of sitting inside the panel.

### Low

- [ ] Share sheet URL truncates right at the room code on phone — the one part
      that matters; shrink the font or ellipsize the middle instead of the end.
- [ ] `auction-wait` (tablet) — bidder rows truncate their status ("Ginette _")
      where auction-you proves there's room for "PASS".
- [ ] `stats-loading` (light) — PixelWave's pale blocks nearly vanish on the
      white sheet; consider the ink-based block colors.
- [ ] Awards grid: the ON FIRE unlock chip wraps to two lines while siblings are
      one — accept or shorten the label.
- [ ] Corner LEVEL tile is mostly empty below its bar while WIN RATE is full —
      consider the level number as the tile's big figure.

## Verified-good (don't "polish" these into regressions)

- Felt layering/theming is coherent post-revert; BidOverlay's `z-[15]` is deliberate.
- Toasts carry `role="status"`/`aria-live`; `:focus-visible` is global; motion is gated
  on `prefers-reduced-motion`; the YouTube API is already lazy-loaded.
- `LISTEN_VOLUME_FLOOR` anti-silence guard and the socket reconnect intent queue are
  sound.
- FR gameplay glossary (levée/mise/brasseur/ronde/siège) is clean everywhere — the drift
  is register (tu/vous) and duplication, not vocabulary.
