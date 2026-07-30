# PLAN — Feature completions (2026-07-30 audit)

Source: the five-agent cut-corners audit (see git history + memory). Everything
here is an improvement to an EXISTING feature — no new features. Executed in
waves; each wave's agents touch disjoint files, gates run between waves.
Waves 1 and 2 are DONE (commits c80d853 and the wave-2 commit that follows).

House rules that bind every item (from CLAUDE.md, restated for executors):

- Copy lives in colocated `T` tables, en + fr-QC tutoiement (locked terms:
  levée, mise, brasseur, ronde, siège). Grep `apps/web/e2e` for a string
  before changing it — EN strings are e2e-pinned.
- Violet backgrounds pair with `text-(--color-ap-ink)`, never white.
- All animation timing through `paced()`; reduced motion = instant.
- The felt changes surgically. Comments encode invariants — move them WITH
  code, never drop them. Match surrounding comment density and idiom.
- Tests: extend the suite that already covers the area. Run the narrow suite
  you touched before declaring done. Never `git stash` — the tree is shared.

---

## WAVE 1 — Bug tier — DONE (c80d853)

1a client: dev-unlock gate, loser confetti, Corner foil rows, Visitor
copy+NamePrompt, engine notice codes localized, Deal Board closed-gate +
submit retry, spectator recap Take-a-seat, recap Add-a-bot. 1b server: private
host join push, add_bot/remove_bot betweenGames, replay-openness decision
comment, applyProfileCosmetics + logOut baseline clearing.

## WAVE 2 — Celebrations, daily loop, record & replay — DONE

2a: reconcile on menu-return, Level-up names payout, foils announced +
Collection badge + scoped sheen CSS, felt/sweep levels in LEVEL_TRACK,
one-announcer awards, practice recap drops XpStrip, Journey copy online-
qualified. 2b: percentile + gap-to-lead, streak {current,best} + browse-screen
flame + best-run line, board rows = AvatarChip + h2h links + pinned you-row,
door self-heal via markDailyPlayed, honest share text, month named, net shown,
?month archive + Last month view, monthly-champion lazy grant. 2c: replay
header/labels/round-jump/keyboard/speed + surfaced Coach toggle + inert replay
hand, history ?before paging + Show more, memorable flags (hailMary/sweep/
comeback) + your-team-first scores, spectated count on Stats.

---

## WAVE 3 — Identity everywhere + table feel

### 3a — Identity visibility

**F1 — The ladder wears paint.** DONE in wave 2b (leaderboard rows carry
paint). Verify only.

**F2 — Head-to-head shows the person.** `routes/head2head.ts` joins users for
`color`, `paint`, and their showcased award (first id of their `awardOrder`,
if any). Client `HeadToHead.tsx:175`: real color+paint on the chip (kill the
hardcoded brown), a small trophy chip with the award's icon+name when
present (the "shelf" finally has a viewer). Derived stats from the games
array already in hand: "Last played <date>", current vs-streak ("has won the
last 3 against you" / "you've won the last 2"), biggest win margin each way.
One compact line each — the screen stays quiet.

**F3 — Stats tiles wear paint.** `routes/stats.ts` returns color+paint for
bestPartner / nemesis / regulars (join users on their uids server-side).
`Stats.tsx` partner/nemesis tiles + regulars strip pass them; kill the
hardcoded brown.

**F4 — Painted 0s stay painted when played.** The roster already carries every
seat's paint (`useTableDerived.ts` resolves avatars). Thread per-play `paint`
into `TrickArea` plays (the player who PLAYED the card, 0-value cards only —
`PlayingCard` already takes `paint`) and into `LastTrickPeek`. Felt surgery:
smallest diff, scene-verified; the arcade.tsx promise becomes true.

**F5 — Comment truth.** Fix `table/SeatChip.tsx:169-171` (claims paint isn't
carried — it is).

### 3b — Table feel (felt-surgical; every step scene-verified)

**G1 — Queueable cards look queueable.** Add `queueable` to `PlayingCard`
(subtle affordance: slight lift + the existing queue ring at low opacity —
quieter than `recommended`). `Hand` passes it; while `!active`, queueable
cards keep `cursor-pointer` AND the visual.

**G2 — A dropped queue says so.** `useQueuedPlay.ts` silently drops on
invalidity. Fire the felt toast path with "Queued card released." /
"Carte en attente libérée." — only when dropped for INVALIDITY (not when
consumed by actually playing).

**G3 — Hand-sort persists.** Persist `sortMode` (`jaffre:handSort`), re-apply
on each new deal (order itself still recomputed per hand).

**G4 — Keyboard parity for feedback.** `useTableKeys.ts` play/bid/queue paths
call the same `feedback('play'/'select')` the pointer paths use.

**G5 — The coach's why survives a hold.** `Stage.tsx` hides the tip when a
banner is up while the ring stays. Let tip + banner stack in the toast stack;
tip below banner.

**G6 — The connection story covers 'closed'.** `ConnectionBanner` returns null
for every state but 'reconnecting'. Cover 'closed' with "Connection lost —
retrying…" and after N attempts (export a counter from `net/socket.ts`)
append a "Back to menu" link. Localized.

**G7 — Auto-play toggles optimistically.** Mirror `dismissedFor`'s pattern:
flip locally on tap, reconcile from the roster echo.

**G8 — PlayerPeek becomes the door.** Add the `#h2h/<pid>` link-row for other
humans ("Head to head →" en/fr) and a "Cards left: N" StatRow from
`seatInfo.cards` (reviving the dead field). Fix its `useEffect` deps
(`[name]` → keyed on pid).

**G9 — Contract flight zero-rect fallback.** `Table.tsx` falls back only when
the launch node is MISSING; mirror `DealIntro`'s zero-size rect check.

**G10 — Remove the inert NoticeToast** mounted in `Table.tsx` (its own comment
says the App-level instance wins; the mount is a no-op).

**G11 — The specials chip waits for its own delivery.** `TrickBanner` launches
the specials burst with no key while `useHeldDisplay` masks specials under
`points-N` (released ~200ms early). Give the burst its own hold key
(`specials-0/1`), mask specials under it, release on ITS landing. Deepest
flight change in the plan — smallest possible diff; motion e2e must stay
green.

---

## WAVE 4 — The table speaks (system entries + spectators + lobby warmth)

**H1 — System chat entries.** Protocol: `ChatEntry` gains an optional `system`
variant — `{ code: 'sat'|'left'|'dropped'|'botPlaying'|'back'|'started',
name?: string }` (code + name, NEVER prose — the client localizes). Server
writes them from the modules that own the moments: `seats.ts` (sat/left,
started), `presence.ts` (dropped once the disconnect clock starts, botPlaying
at takeover, back on return). Client `ChatPanel` renders system entries as
muted centered lines (en/fr): "Ginette sat down." "Marcel dropped." "A bot is
playing Marcel's hand." "Marcel is back." "Game on." System lines do NOT trip
the unread dot. Respect existing chat truncation.

**Verified mechanics (H1):** `ChatEntry` is
`{ from: string; text: string; at: number; seat?: number }`
(`packages/protocol/src/messages.ts`), carried by `welcome.chatTail` and the
`{t:'chat', entry}` server message. The `seat?` field's own comment already
establishes the convention for optional additions ("absent for spectators and
for entries persisted before this field existed") — the system variant follows
it: add optional `system?: { code: …; name?: string }`, leave `from`/`text` as
a plain-language fallback so an older client still renders something sane
rather than an empty bubble. `Roster.spectators` (a number) is already on
every roster broadcast — H3 needs no protocol change at all.

**H2 — Bot takeover is a felt moment.** Client-side roster-diff detection →
one toast-stack notice at takeover ("A bot is playing Marcel's hand.") and one
on return ("Marcel is back."). Existing NoticeToast/stack path, no new
system.

**H3 — Spectators are visible.** `roster.spectators` renders in the Lobby
header ("N watching" when > 0) and at the table (small eye+count chip where
the layout takes it without crowding; scene-verify). Spectator chat entries
get a subtle "watching" marker in ChatPanel.

**H4 — The waiting room works for the host.** "Fill with bots" button in the
Lobby when ≥1 seat is empty (add_bot per empty seat — the copy at
`Lobby.tsx:60` already promises this path). The Lobby's ShareButton becomes
the `labeled` variant. Non-host unseated arrivals see "<Host> is waiting for
you" (hostSeat name from the roster) instead of "Share this code with your
table".

**H5 — Music: dock controls.** Skip (existing vote action) + "Up next:
<title>" on `MusicDock`. Server: when NO seated humans are connected,
connected spectators' votes count toward `skipThreshold`. Remove dead
`musicStore.playerStatus`/`setPlayerStatus`.

---

## WAVE 5 — Table style (the host-customization option)

**I1 — "Table style: host's" room rule.** User-approved design:
- Rules (protocol `set_rules` payload + room meta) gain
  `tableStyle?: 'own' | 'host'`, default `'own'`. Host-only toggle in the
  Lobby rules row: "Table style — everyone sees the host's felt & sweep."
  en/fr. Pre-game AND between games (set_rules already legal betweenGames).
- The client's join/sit payload adds the sender's equipped `felt` + `sweep`
  ids alongside paint (same pipeline as paint in `socket.ts`); server stores
  the HOST's pair on meta when the host sits/updates; roster broadcast
  carries `tableStyle: { felt, sweep } | null` when the rule is on.
- Clients apply it as a VIEW override while at that table: felt via the
  existing `[data-felt]` attr (set entering the room, restored on leave — do
  not touch the player's own persisted equip), sweep via the
  TrickSweepProvider value for that table. Ownership is NOT required to
  render someone else's style (assets are client-side; ownership gates
  equipping, not seeing).
- Scenes: one lobby scene shows the toggle; an e2e pins: host equips a
  non-default felt, enables the rule, second client's `<html data-felt>`
  reflects the host's felt at the table and restores after leaving.
- Keep it to felt + sweep. Card skins/themes stay personal (readability).

**Verified mechanics (read before implementing — these are the traps):**
- `applyFelt(id)` (`apps/web/src/felt.ts`) **persists to localStorage** and
  sets `<html data-felt>`. A table-style override must NEVER call it — that
  would overwrite the player's own equip. Add a separate non-persisting
  path (e.g. `overrideFelt(id | null)`) that only touches the dataset attr
  and dispatches `FELT_EVENT`; passing null restores `currentFelt()`. The
  default felt (`house`) is the ABSENCE of the attribute, so the override
  must delete the attr for `house`, not set it.
- The sweep is already a pure prop: `App.tsx` holds `sweepId` state from
  `currentSweep()` and feeds `<TrickSweepProvider value={sweep}>`. The
  override is just "use the table's sweep id instead of mine while at a
  table with the rule on" — no persistence involved, nothing to restore.
- `set_rules` (`packages/protocol/src/messages.ts`) is
  `{ hailMary12: boolean, turnTimer?: boolean }` and its comment states the
  convention: optional fields keep older clients parsing, and a client
  toggling one rule sends its current value for the others. `tableStyle`
  follows that exact pattern (optional, echoed in `Roster.rules`).
- `Roster.rules` is the echo channel every seat already reads; the host's
  felt+sweep ride alongside it, NOT inside `RosterSeat`.

---

## WAVE 6 — Platform polish

**J1 — Offline is a state the app admits.** One `online`/`offline` listener
(App-level) driving a small dismissible banner ("You're offline — practice
still works." en/fr). The Lobby's header line must not say "Share this code"
while `connection` is reconnecting/closed. Stats/Corner error copy: when
`!navigator.onLine`, say "You're offline" instead of "play a room game".

**J2 — Install gets its moment.** One-shot `InstallNudge` on Home (chrome-bar
area, NOT the start-here slot), shown when: a finished game exists
(`jaffre:funnel` has 'finish'), install is available (captured
beforeinstallprompt or iOS), not standalone, not latched
(`jaffre:installNudge`). One line + Install button reusing InstallButton's
flow; ✕ latches. Fix the stale docstring at `pwa/InstallButton.tsx:30`.

**J3 — Recovery reachable.** SettingsSheet Account row gains a "Backup code"
entry for guest users opening the LoginSheet at its recovery section. Fix
stale `auth.ts` comment ("shown once on the home screen" — it isn't).

**J4 — Payout notes.** `audio/clicks.ts` gains two synthesized stings: `win`
(short ascending arpeggio from the existing sine/thump toolkit) and `levelUp`
(brighter, shorter). GameRecap plays `win` for the winning viewer only
(sound-pref gated, once per mount); XpStrip plays `levelUp` on the level-up
flash. Everything stays inside the lazy AudioContext + `jaffre-sound` gate;
sound stays off by default.

**J5 — Numbers speak the locale.** Tiny `fmtPercent(lang, n)` helper using
`Intl.NumberFormat` (fr-CA narrow no-break space before %). Swap the call
sites: `Stats.tsx`, `Corner.tsx`, `Leaderboard.tsx` percentages.

**J6 — Small honesty batch.** Push-enable failure (non-denied) gets a toast in
`NotificationsToggle` ("Couldn't turn alerts on — try again." en/fr).
ErrorBoundary shows a short error id (random 6-hex, included in the beacon).
`UpdateToast` clears its update-poll interval on unmount. Sweep any stale
comments not already fixed.

---

## Execution notes (for the orchestrator)

- Waves run sequentially; agents WITHIN a wave touch disjoint files. Agents
  must NEVER `git stash` (a stash already destroyed this file once).
- After each wave: typecheck, both unit suites, targeted e2e. Full e2e +
  scenes after waves 3, 5 and 6. Commit per wave; orchestrator pushes.
- Any copy change: grep `apps/web/e2e` for the EN string first.
- STATUS.md gets one consolidated update at the very end; this plan then
  moves to docs/archive/.
