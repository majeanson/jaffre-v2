# PLAN — Fresh-eyes UX/product audit (2026-07-27)

> **STATUS: SHIPPED (2026-07-27).** All four waves and every Section C idea are
> implemented and on `main`. Three items were adjusted in flight because the
> plan's original shape would have shipped something untrue — each is called out
> inline below and in its commit message:
>
> - **#17 (Elo by name)** was already fixed by the awards/leaderboard
>   fortification; the audit was misled by a stale `polishing.md` note, now
>   corrected. No code change was needed.
> - **Daily first-win** shipped as a recognition chip with **no XP claim**: the
>   progression constants are frozen, so a "+10 XP" chip would have promised a
>   reward nothing grants.
> - **Recap coach tip** does **not** re-run the Coach over individual card
>   plays — a `RoundSummary` carries no per-trick plays, so that verdict isn't
>   derivable at recap time. It states facts the round record proves
>   (contracts taken/made, per-seat tricks) and stays silent when unclear.
>
> Also fixed along the way: a bug introduced by the new Settings sheet, whose
> "Open Collection" navigated by hash and would have torn down a live room
> mid-game (it now opens the existing modal at the table).

Goal restated: **a beautiful game that anyone can understand rapidly without being
overwhelmed, with best-in-class playability for both first-timers and experts.**

Method: three parallel fresh-eyes sweeps of the codebase (navigation/entry,
in-game table, meta features + backlog), no prior assumptions. This doc is the
synthesis: weaknesses → proposed fixes → new ideas, prioritized into waves.

Honest headline: the craft level is high (coach, tutorial marks, queue-ahead,
recap, i18n, presence handling are all genuinely good). The remaining problems
are **structural, not cosmetic**: too many surfaces, no consistent way out or
around, a first-timer path that only covers practice mode, and zero
expert-speed affordances.

---

## A. The five structural weaknesses

### A1. The app has ~36 interactive surfaces and no spine

14 route-level screens, 9 modals, 13+ overlays/popovers/docks, plus 4 nested
tab/step systems. There is no persistent navigation, no back button, no
browser-history integration beyond the hash, and every screen invents its own
exit:

- Six different "leave" labels/behaviours: "Home" (MetaHeader), "← Back home"
  (Lobby), "Leave" (Visitor), "Back" (PaintStudio), "Close" (Collection-as-
  modal), and **two different leaves at the table** — TopBar sign-out keeps
  your seat, GameRecap "Leave" forgets the table forever. Same word, one is
  irreversible (`App.tsx:284-292`).
- Corner's 4 tiles duplicate 4 of the 6 MetaNav tabs rendered just above them
  (`Corner.tsx:165-216`); leaderboard gets a tab but no tile.
- Collection is reachable 4 ways with 2 different nav models (route with
  MetaNav vs modal with only "Close").
- Music lives in three surfaces at once (MusicDock pill, RoomComms Music tab,
  MusicQueuePanel) and can show all of them simultaneously.
- Unknown hashes silently fall to Home (`App.tsx:104`); `#history` aliases
  `#stats` without rewriting the URL; Visitor "Just watch" state isn't in the
  URL so reload throws spectators back to the gate.

### A2. There is no Settings surface — settings are scattered across 7 places

Language: Home chrome **and** TopBar Options. Sound: TopBar Options only.
Install + push notifications: bottom of the 1425-line HelpSheet. House rules:
collapsed `<details>` in Lobby. Bot difficulty: a cycling chip in PlayMenu
with no menu. Coach toggle: TopBar Options. Auto-play: table UtilityRow.
A user who wants to "turn the sound on" or "get turn notifications" has no
guessable place to look.

### A3. The first-timer path only exists in practice mode

- The tutorial (`TutorialCoach` + 7 marks + intro) mounts **only** on
  `#practice` (`App.tsx:228-236`). A player whose first game is a friend's
  invite link (`#room/<code>`) — arguably the _most common_ real first game —
  gets no intro, no marks, and the Coach **off by default**.
- The auction panel never explains its own numbers. Nothing on screen says
  "bids are _points_ (7–12), 11 points exist per round, defenders keep
  theirs". This is the single most confusing ramp in the game and it's taught
  by exactly one one-shot coach-mark, practice-only.
- Trump-set-by-first-lead — the game's most counter-intuitive rule — is
  taught by one one-shot mark and a glossary entry.
- No name/avatar step ever: identity is minted silently, name defaults to
  `'Player'` (`socket.ts:58`). New players show up online as "Player".
- Solo play is framed as multiplayer: "Play vs bots" is nested under
  PLAY → **CREATE** — a newcomer wanting a solo game must first answer a
  create-vs-join question that doesn't apply to them.
- Quick Play — the fastest online path — is the _bottom_ button of
  PublicLobby, itself buried at PLAY → JOIN → "Join a public game".

### A4. Experts have no speed controls and no keyboard

- Zero gameplay keyboard shortcuts (only Escape-to-close exists).
- All pacing is hard constants: trick hold 1600ms + sweep 600ms + queue-fire
  400ms, deal intro ~1s, practice bot think 750–2600ms. No fast mode, no
  skip, no way to tighten a practice grind session. After the last trick of a
  round there is a fixed ~2.2s dead beat before the recap opens
  (`Overlays.tsx:37-45`).
- Queue-ahead, sort/drag, last-trick peek, starting-hands reveal, auto-play
  are all good — the ceiling is pacing and input, not information.

### A5. Real half-wired items still shipping

- **PlayerPeek matches Elo by display name** (`PlayerPeek.tsx:214`) —
  duplicate names show the wrong rating. Known, skipped; needs a stable id on
  the leaderboard payload.
- `RosterSeat.ready` never populated at `game_over` — recap "Still at the
  table" is a client-side fallback chain (polishing.md:128-136).
- `RecoveryCard.tsx` (218 lines) is dead code in the prod bundle.
- `#scenes` (67-entry internal gallery) and DevConsole ship ungated by URL.
- `docs/IDEA-tutorial-completion-reward.md` is stale (the feature shipped);
  `PLAN-table-ux-pass.md` still says `DEV_UNLOCK_ALL stays true`.
- Paint Studio (12 source files) has **no labelled entry point** — only the
  hero-card click and a Customize-sheet action.

---

## B. Proposed fixes, in waves

### Wave 1 — First contact (highest leverage on "anyone understands rapidly")

1. **Teach the auction on the auction panel.** Add a permanent one-line
   caption to `BetCards.tsx` / `BidOverlay.tsx`: "Bid the _points_ your team
   will take — 11 in play, defenders keep theirs." Plus a tap-to-expand
   "what do these numbers mean?" micro-sheet. Always on, both modes — a
   caption is not nagging. (S)
2. **Lite coach for first online game.** New localStorage latch
   (`jaffre:onlineIntro`): first time a player enters an online Table with
   `hasSeenTutorial() === false`, show a single compact intro card ("First
   time? Bids are points · trump = declarer's first card · Coach is
   available in ⚙") with buttons "Turn Coach on" / "Got it". Three of the
   seven existing marks (`bidding`, `trump`, `firstTrick`) become eligible
   online. No frozen bots, no 7-step sequence — one card, three marks. (M)
3. **Name prompt at first seat.** The first time a player sits in an online
   room with the default name, an inline one-field "What should we call
   you?" step in Lobby/SeatPicker (skippable). Stops "Player" from being the
   dominant online identity. (S)
4. **Un-bury solo and Quick Play.** PlayMenu root becomes three peers:
   **Play vs bots** · **Quick play online** · **With friends** (create/join
   inside). Quick Play calls the existing `/api/quickplay`. PracticeNudge
   stays. Bot difficulty becomes a proper 4-option row instead of a blind
   cycling chip. (M)
5. **Persistent `?` on the felt.** A small fixed help button on the table
   (phone: inside UtilityRow) opening HelpSheet directly — currently Help is
   two taps deep behind the score-strip gear. (S)
6. **Trump visibility.** When trump is set, announce it once via the
   existing TrickBanner ("Red is trump — declarer led it") and keep the
   TrumpBadge as the persistent echo. Closes the least-discoverable-rule gap
   for everyone, not just tutorial takers. (S)

### Wave 2 — One spine, fewer surfaces (the "not overwhelmed" wave)

7. **One Settings sheet.** Single surface (chrome-bar gear on Home + entry in
   TopBar Options) consolidating: language, sound, coach, notifications,
   install, theme shortcut, replay-tutorial, recovery/login status. Remove
   the duplicated language toggle from TopBar; slim HelpSheet back to
   help. (M)
8. **Normalize "leave".** One shared exit vocabulary: "Home" everywhere a
   screen exits to Home; the table's two leaves get distinct labels —
   "Back to home (keeps your seat)" vs "Leave table" with a confirm on the
   destructive one. (S)
9. **De-duplicate Corner.** Corner's tiles either replace MetaNav on that
   screen or become _summary_ tiles (level ring, last game result, newest
   unlock, rank) that justify existing next to the tabs. Add the missing
   leaderboard tile or drop tiles entirely. (M)
10. **Collection: one nav model.** The in-table CollectionSheet reuses the
    route screen's chrome minus MetaNav, but gains the same header/close
    affordance; kill the sessionStorage return-hash special case by using
    history back. (M)
11. **History integration.** Push hash changes through
    `history.pushState`-compatible navigation so the browser/Android back
    button works; encode Visitor "watching" in the URL (`#room/CODE/watch`);
    show a small "unknown link — took you home" notice on bad deep links;
    rewrite `#history` → `#stats`. (M)
12. **Music: one surface.** MusicDock stays the only always-on element; the
    RoomComms Music tab becomes the queue editor that the dock's expand
    opens — one component, one mental model, no triple presence. (M)

### Wave 3 — Expert playability

13. **Fast pacing preference.** A "Snappy animations" toggle in the new
    Settings sheet: trick hold 1600→700ms, sweep 600→300ms, deal stagger
    halved, practice bot think 750→250ms. One derived `paceScale` consumed
    by `useTrickHold`, `DealIntro`, `localGame`. (M)
14. **Tap-to-dismiss the dead beat.** Clicking the held trick (or the felt)
    after round end skips straight to the recap instead of waiting the fixed
    ~2.2s. (S)
15. **Keyboard play.** 1–8 selects/plays hand cards (legality-aware),
    arrow keys + Enter as alternative, B opens bid values 7–12 via number
    keys, Enter = Ready on recaps, L = log, C = chat. Desktop-only listener,
    announced once via a subtle hint. (M)
16. **Played-cards awareness.** A compact "seen so far" strip inside the
    expanded score-strip dropdown (per suit: which of 0–7 are gone),
    derived from the existing log data. Off by default, toggle next to the
    coach — keeps purists honest, helps improvers. (M)

### Wave 4 — Hygiene and trust

17. Fix **PlayerPeek Elo-by-name**: add stable public id to the leaderboard
    payload, match on id. (S server + S client)
18. Populate **`RosterSeat.ready` at `game_over`** server-side; delete the
    recap fallback chain. (S)
19. Delete `RecoveryCard.tsx` (or gate it out of the bundle), gate `#scenes`
    behind the same dev flag as DevConsole, delete the stale IDEA doc, fix
    the stale line in `PLAN-table-ux-pass.md`. (S)
20. **Paint Studio entry point**: give it a labelled spot (Customize sheet
    already has one — add a "Paint your avatar" tile on Corner where it
    thematically belongs). (S)
21. Batched `/api/table-status?codes=` (the one open polishing.md item) —
    only if "Your tables" usage grows. (M, deferred)

---

## C. New ideas (beyond fixes)

- **Teaching deals.** Practice currently seeds a random game. Add 3 fixed
  scenario seeds surfaced as optional chips on the practice entry: "Learn
  bidding" (strong hand), "Hunt the Red 0", "Defend a contract". The engine
  is already seedable (`#practice/<seed>`); this is curation + copy, not
  engine work. Ties the tutorial's concepts to felt experience. (M)
- **Quick-phrases/emotes in chat.** Free-text-only chat is a wall for
  console-style players and a moderation surface. Six canned phrases
  ("Nice one!", "Ouch", "Good game", …) + 4 emoji reactions, localized,
  tappable from the chat popover's top row. (M)
- **Post-game "one thing to work on".** The coach brain already evaluates
  every decision; at GameRecap, show a single line ("You led trump into the
  Red 0 in round 3 — replay it?") linking to the existing Replay screen.
  Turns Replay from buried feature into a learning loop. (L)
- **Daily first-win bonus.** XP constants are frozen, but a flat "+10 first
  win of the day" chip on the recap XpStrip gives returners a reason to come
  back without touching the level curve. (S–M)
- **Spectator polish → shareability.** Watch links that survive reload
  (Wave 2 #11) plus a tiny "LIVE" badge on PublicLobby rows makes "watch my
  game" links actually work as a social hook. (S, mostly covered by #11)
- **First-session telemetry.** There is currently no way to measure any of
  this. Add a `kind: 'funnel'` telemetry event at: first Home paint, PLAY
  opened, first game started (mode), first bid placed, tutorial step N,
  first game finished. Cheap, existing pipe (`net/telemetry.ts`), makes
  Wave 1 measurable. (S)

---

## D. Suggested order

1. Wave 1 (#1–6) — one focused branch each, screenshot-verified; these are
   the "anyone understands rapidly" items and are mostly small.
2. Wave 4 (#17–19) — quick trust/hygiene wins, can interleave anytime.
3. Wave 2 (#7, #8, #11 first) — Settings sheet, leave semantics, back
   button: the biggest "not overwhelmed" payoffs.
4. Wave 3 (#13–14 first, then #15–16) — expert pacing.
5. Ideas from section C as appetite allows; teaching deals and telemetry
   first (they compound with Wave 1).

Everything here respects the standing principles: simpler always wins, reuse
surfaces instead of adding them (the plan _removes_ net surfaces), felt table
changed surgically in small shot-verified steps.
