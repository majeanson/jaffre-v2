# Plan — tactile hand, deck deal, sound, and overlay polish

Resume point for the design pass started 2026-07-16.

**Already shipped** (do not redo): score header redesign, reconnect UX,
history/replay, CI/deploy, and — from this plan — **Workstream A** (punchy
disabled cards), **Workstream E** (round summary + specials chips),
**Workstream H** (seat change + lobby voice), and the **chat-triples bug**
(idempotent append). A long-standing Home axe flake was also fixed (the shared
a11y helper now settles finite entrance animations before scanning, and skips
the native-`<select>` contrast false positive).

**Still to build**: D (sound), B (deck deal), F (bet cards), C (drag/colour
sort), G (take-over + visitor page). These are the big creative pieces.

Guiding intent (user's words): make playing cards feel **satisfying — ASMR /
haptic / phone-style**: cards deal in one at a time, you can drag to sort your
hand like a real player, a little button sorts by colour with a satisfying
sound, and the "can't play this" state should be **punchy, not weird/washed
out**. Be creative; tune until it feels good.

## Key files (verified this session)

- `packages/ui/src/components/Hand.tsx` — the fanned hand. `react-aria`
  `ListBox`/`ListBoxItem`, horizontal, `selectionMode="none"`, `onAction` plays
  a card. Fan overlap via `-space-x-6` (`-space-x-[3.4rem]` on phone). Marks
  legal cards with `data-playable`; hover/focus lifts `-translate-y-3`.
- `packages/ui/src/components/PlayingCard.tsx` — one card. **Disabled look is
  `dimmed` → `opacity-45 saturate-50`** (this is the "weird" state to replace).
  Has `faceDown` back (used for the deck), `raised`, `recommended` (gold halo),
  `tilt`. Special cards (red 0 / brown 0) already have haloes + a `+5`/`−2` pip.
- `apps/web/src/table/PlayerHand.tsx` — wraps `Hand`; builds `HandCard[]` from
  `view.hand` (+ `legal`, `disabledReason`, `recommended`). **Hand order today
  is server order** (`view.hand`); reordering must be a _client-only_ concern.
- `apps/web/src/table/Stage.tsx` — the felt / trick area; where dealt cards
  could fly from a deck position.
- `apps/web/src/local/localGame.ts` + `apps/web/src/state/gameStore.ts` —
  `welcome`/`setView` deliver the whole 8-card hand at once when a round
  starts (`phase → 'bidding'`, fresh hand). The deal animation is a **client
  presentation** layer over that.
- Animation deps already present: **`motion/react`** (used in
  `packages/ui/src/components/TrickArea.tsx`) and a CSS **`deal-in`** keyframe
  in `packages/ui/src/tokens.css` (`--deal-i` stagger, used by `HeroBanner`).
  All entrance animations are gated on `prefers-reduced-motion: no-preference`.
- **No audio/haptics infra exists** — greenfield. `navigator.vibrate` for
  haptics; Web Audio for low-latency clicks.
- Scene catalog: `apps/web/src/dev/sceneManifest.ts` + `scenes.ts`. Every new
  visual state gets a scene (auto-covered by `apps/web/e2e/scenes.spec.ts` with
  a probe + axe). Verify visually via `npm run shots` (contact sheet in
  `apps/web/shots-output/index.html`).

## Workstream A — punchy disabled/unplayable cards (smallest, do first)

Replace `opacity-45 saturate-50` in `PlayingCard.tsx`. The washed-out milk is
the problem. Direction to try (pick what feels punchy in shots):

- Keep the card **fully saturated and legible**, but push it _back_: a subtle
  dark scrim overlay (`after:` pseudo or an absolute `bg-(--color-felt-950)/35`
  layer), a slight `scale-[0.97]`, and drop the lift/hover affordances (already
  done via `cursor-not-allowed`).
- Optionally a thin desaturated **ink wash** only, not opacity — e.g.
  `grayscale-[0.35] brightness-90` + a 1px inset border in felt colour so it
  reads "parked", not "broken".
- The **legal** cards should feel the opposite — crisp, slightly forward,
  maybe a faint warm edge glow so the eye jumps to what's playable.
- Test both skins (light flips `--color-ivory`; use felt-toned scrims, not
  ivory). Add/keep a `disabled-hand` scene variant if useful.

Files: `PlayingCard.tsx` (dimmed branch), maybe `Hand.tsx` (playable class).

## Workstream B — deck deal animation (one card at a time)

Goal: at the start of each round the 8 cards **fly in from a deck** one by one
into the fan, with a click per card.

Approach:

1. Detect "a fresh hand arrived": in the hand layer, watch `view.roundIndex` /
   the transition into a new round with a full 8-card hand. Drive a local
   "dealing" state that reveals cards `0..7` on a stagger (~70–110ms each).
2. Two implementation options:
   - **CSS**: reuse the `deal-in` keyframe with `--deal-i` per card (like
     `HeroBanner`). Cheapest; already reduced-motion-safe. Cards start
     translated/rotated from a deck anchor and settle into the fan.
   - **motion/react** (richer): a deck stack rendered at a corner/edge; each
     card `layout`-animates from the deck to its fan slot with spring physics.
     Better "thrown card" feel; more code.
     Recommend starting with CSS `deal-in` per-card stagger, upgrade to motion if
     it doesn't feel good.
3. A small **deck visual** (a `faceDown` `PlayingCard` stack) at the deal
   origin that shrinks as cards leave — sells the "dealing from a deck" read.
4. Fire one **deal click** (Workstream D) per card as it lands; a tiny haptic
   tick on mobile. Respect reduced-motion (no fly, cards just appear; no
   rapid-fire sound).
5. Don't block interaction: bidding/playing should work as soon as dealt (or
   gate the ~800ms deal, since bots pause anyway).

Files: new `apps/web/src/table/useDealAnimation.ts` (or inside `PlayerHand`),
`Hand.tsx` (accept a `dealtCount`/`dealing` prop or per-card `enter` flag),
possibly a `Deck` visual in `Stage.tsx`. New scene: `dealing` (mid-deal).

## Workstream C — drag-to-sort hand + colour-sort button

Two ways to reorder, both **client-only cosmetic** (never touches game state):

1. **Manual drag reorder**: let the player drag cards left/right to reorder the
   fan. `react-aria` has `useDragAndDrop` for `ListBox` reordering (keeps
   keyboard a11y — supports keyboard move). Alternatively a pointer-based
   drag with motion `Reorder` (motion/react has a `Reorder` primitive) — likely
   the more _satisfying/tactile_ option and pairs well with drag physics.
   Trade-off: `react-aria` DnD keeps the accessible listbox semantics; motion
   `Reorder` is smoother but needs manual keyboard support. **Recommend motion
   `Reorder.Group`/`Reorder.Item`** for feel, and keep arrow-key play via the
   existing listbox semantics if compatible, else add explicit keyboard reorder
   (e.g. Alt+←/→) and preserve Enter-to-play.
2. **Colour-sort button**: a small button near the hand ("Sort") that reorders
   the hand by suit (colour) then value, animating every card sliding into
   place with a **cascade of clicks** (one tick per card, ~40ms apart — the
   ASMR moment). Icon: four suit pips or a sort glyph.

State: keep a **local hand order** — an array of card keys — in the hand layer
(or a small zustand slice / `useState` in `PlayerHand`). Derive the displayed
order by mapping `view.hand` through it; when new cards arrive (new round),
reset to server order (or auto-sort). Persisting order across a round only.
Reconcile when `view.hand` changes mid-round (a card was played → drop it from
the local order).

Files: `Hand.tsx` (render in local order; drag/reorder), new sort util
`packages/ui/src/handSort.ts` (suit priority + value), `PlayerHand.tsx` (own
the order + reset logic), a `SortButton` (in `UtilityRow` or beside the hand).
New scenes: `hand-sorted` and maybe a `hand-reordering` mid-drag state (drag is
hard to snapshot — a static probe on the sort button is enough).

## Workstream D — sound + haptics ("ASMR / phone-style")

Greenfield. Aim for **crisp, short, tactile** ticks — not musical.

1. New `apps/web/src/audio/clicks.ts`: a tiny Web Audio engine.
   - Lazy `AudioContext`, **resumed on first user gesture** (autoplay policy) —
     hook into the first tap/keydown.
   - Synthesized ticks (no asset files): short filtered-noise burst or a fast
     decaying square/triangle for a "click/clack". Vary pitch slightly per
     event so a cascade sounds organic, not machine-gun. Expose `playClick(kind)`
     with kinds: `deal`, `play`, `sort`, `select`, `illegal` (a duller thunk).
   - Master gain + a **mute toggle** (persist in localStorage, like the theme).
     Decide default on/off — recommend **off by default** with a speaker toggle
     in the top bar next to Coach/Log, so it's opt-in (avoids surprising audio).
2. Haptics: `navigator.vibrate([ms])` on play/sort/deal (mobile only; it's a
   no-op on desktop). Gate behind the same sound/settings toggle or a separate
   one. Keep patterns tiny (5–15ms) so they feel like clicks, not buzzes.
3. Wire calls: deal (per card, Workstream B), card play (`onPlay`), sort
   cascade (Workstream C), maybe bid buttons and the Ready button. Keep it
   sparse — over-clicking gets annoying.
4. Respect `prefers-reduced-motion`? Sound is separate from motion; gate on the
   explicit sound toggle only. But if reduced-motion is set, skip the _rapid_
   deal cascade sounds.

Files: `apps/web/src/audio/clicks.ts`, a `SoundToggle` (top bar), call sites in
`Hand`/`PlayerHand`/deal hook/`BidOverlay`/`RoundSummaryOverlay`. No new scenes
needed (audio isn't visual) beyond the toggle button appearing in the bar.

## Workstream E — RoundSummaryOverlay: clearer + nicer

`apps/web/src/table/RoundSummaryOverlay.tsx` (screenshot reviewed). Make the
result read at a glance and match the new header language:

- Stronger hierarchy: the **contract result** ("Bro / Team Sun — made / failed
  7") as the headline with a clear ✓/✗ and colour; the two team cards below.
- Reuse the header's **specials chips** (red 0 +5 / brown 0 −2) so where the
  points came from is obvious (currently only a net delta shows).
- Tighten the team cards: team dot + name, trick pts, the delta (already fixed
  to `--color-danger-text` for AA), running score. The winner card already
  rings; make the loser card quieter, not muddy.
- The ✓/… ready row is fine; keep it but align spacing.
- Keep it AA (dark dialog panel is themed felt, so ivory is OK there; only the
  permanently-dark pills need white — see the light-skin rule below).

## Workstream F — card-based bidding ("play a bet card")

Reuse the card mechanic for the auction so bidding feels like the rest of the
game and it's obvious who bet what. Instead of the current bid buttons, the
player **plays a bet card**: a small fan/row of value cards `7 8 9 10 11 12`
plus a `Pass` card. A **sans-atout toggle** adds a star (★) to the chosen card
so the declaration reads at a glance. The played bet card then sits by the
bidder's seat (like the trick cards) so every player sees the standing bids.

- **Same mechanic, VISUALLY DISTINCT** (user requirement — players must never
  confuse a bet card with a playing card): reuse the card interaction (drag-up
  to commit, hover/lift, click sound) but give bet cards a clearly different
  look — e.g. no suit glyph, a different face material/color (a token/chip or
  "bid slip" treatment rather than the ivory card face), a big value + `Pass`
  face, and a ★ badge when sans-atout is on. The auction fan should read as
  "bids", not "your hand". Confirmed gesture: drag-up to bid.
- **Selection UX**: tap a value card to bid it; a persistent SA toggle
  (star button) flips sans-atout before you commit; illegal bids (below the
  current high bid) use the new punchy disabled state (Workstream A). Confirm
  by playing the card (drag-up or tap), mirroring the play gesture.
- **Show the bids on the table**: render each seat's bet card near its seat
  chip during the auction (the bid bubble becomes an actual mini bet card).
  This replaces the text bubble (`bidText` in `SeatChip`) with a `BetCard`.
- Keeps the engine unchanged — still emits `place_bid` with `{value,
sansAtout}` / `pass`. This is purely a presentation swap of `BidOverlay` /
  `BidPanel`.

Files: `apps/web/src/table/BidOverlay.tsx`, `packages/ui/src/components/
BidPanel.tsx` (→ card row), new `packages/ui/src/components/BetCard.tsx` (or a
`PlayingCard` bet variant), `SeatChip.tsx` (bid bubble → mini bet card),
`useTableDerived.ts` (`bidOptions` already carries `{value, sansAtout}`; add a
per-seat "played bet card" view). New scenes: `bet-cards` (auction, your turn
— the bet-card fan + SA toggle) and update `auction-wait` to show seats'
bet cards. Bots' bids render as bet cards too.

## Workstream G — take over a bot mid-game (human replaces a bot)

Let a person joining a room in progress **sit into a bot's seat** and take
control, instead of only spectating. The engine is owner-agnostic — a seat is
just `meta.seats[seat]` — so this is a room-state swap, essentially the inverse
of the existing disconnect bot-swap.

- **Server** (`apps/server/src/GameRoom.ts` `onSit`): today sitting an occupied
  seat returns `SEAT_TAKEN`. Allow sitting a **bot-owned** seat: set
  `meta.seats[seat] = att.userId`, clear any `disconnectedSince` for it,
  persist, broadcast roster, and send the taker a fresh `welcome` (their new
  seat view + hand). The seat's hand/tricks/turn all carry over untouched. On
  that seat's turn the alarm now sees a connected human and waits (no bot move)
  — already handled by `isBotOwner`/`disconnectDeadline` logic.
- **Client**: in the roster, show bot seats as **"Take over"** targets (a button
  on the seat, or via the existing `SeatPicker` in the lobby extended to the
  in-game roster). Reuse the `{t:'sit', seat}` message. Confirm the taker
  immediately sees the bot's hand.
- **Visitor landing page**: when you arrive at a room that's already in progress
  (viewer = spectator), show a clear **"Visitor" screen** first instead of
  dropping you straight onto the felt — the table state at a glance (who's
  playing, scores, which seats are bots) with primary actions: **Replace a bot**
  (per bot seat: "Take Bot 2's seat"), **Watch** (continue as spectator), and
  **Leave**. This is the natural home for the take-over affordance. It's a new
  route/screen shown when `viewer === 'spectator' && roster.started`, sitting
  between the Lobby (not started) and the Table (you're seated). New
  `apps/web/src/screens/Visitor.tsx`; `App.tsx` chooses it for a started room
  when you're not seated. New scene: `visitor`.
- **Edge cases**: only allow while `started` and not `game_over`; disallow
  taking a seat a _connected human_ already holds (keep `SEAT_TAKEN` for those);
  decide whether taking over is open to any spectator or gated (open for now).
  Difficulty label on the seat disappears once a human owns it.
- Symmetric nicety: the reverse ("hand my seat to a bot / leave and let a bot
  finish") already exists via disconnect → bot-swap; optionally add an explicit
  "add bot to my seat" later.

Files: `GameRoom.ts` (`onSit` swap path + a room test: bot seat → human take
over → that seat's next turn is not bot-played), `packages/protocol` (no change
— reuse `sit`), `apps/web/src/room/SeatPicker.tsx` / `SeatChip.tsx` (take-over
affordance), roster rendering. New scene: `takeover` (roster showing a bot seat
with a "Take over" button) or fold into a lobby/roster scene.

## Workstream H — change seat in team selection + voice in the lobby

Two small lobby upgrades. **Both are mostly wired already** (verified this
session):

- **Change seat**: the server `onSit` (`GameRoom.ts`) already supports moving —
  it clears the user's current seat before seating them in the new one, and
  only rejects occupied seats / after `started`. The **only blocker is the
  client**: `apps/web/src/room/SeatPicker.tsx` disables "Sit here" with
  `disabled={seated}`. Fix = allow it while not `started` (disable on `started`
  instead) and relabel to **"Move here"** when already seated. One-line-ish
  change; no protocol/server work. (Optional: also let you swap with another
  human by mutual consent later — out of scope now, only move to empty seats.)
- **Voice in the lobby**: the RTC mesh is global — `rtc.ts` registers the
  handler at import and the server relays `{t:'rtc'}` between **seated**
  players, which lobby sitters are. Voice works pre-game; it's just not
  mounted. `Comms` (table) renders the `VoiceBar` today. Plan:
  1. Extract `useVoicePeers` out of `apps/web/src/table/Comms.tsx` into
     `apps/web/src/voice/useVoicePeers.ts`, and add a small
     `apps/web/src/voice/VoiceControls.tsx` (the `VoiceBar` + join/leave/mute
     wiring, taking `me: number`). Reuse it in `Comms`.
  2. Render `<VoiceControls me={viewer} />` in `Lobby.tsx` when
     `typeof viewer === 'number'` (seated only — spectators have no seat).
  3. **Teardown**: voice is global module state that persists across the
     lobby→table remount (good — talk carries into the game). But leaving the
     room _from the lobby_ never unmounts `Table`, so its `leaveVoice()` never
     runs → mesh leak. Move voice teardown up to the room route: call
     `leaveVoice()` in `App.tsx`'s room-effect cleanup (alongside `disconnect()`
     - `reset()`); `leaveVoice` is idempotent so keeping Table's is harmless.
  4. Scenes: the existing `lobby-full`/`lobby-open` scenes seat viewer 0, so
     the voice bar will now appear there and be axe-checked — spot-check both
     skins. Optionally a `lobby-voice` scene with a joined/peer state.

  Note: the deprecated attempt this session left these reverted — reference
  only. Real teardown + the extract are the substance.

## Known bugs to fix

- **Chat "triples"** — messages render multiple times (each shown ~3×, see the
  chat screenshot). The send/broadcast path looks single-shot
  (`useChatSend` → one `{t:'chat'}`; server `onChat` broadcasts one `{t:'chat',
entry}` to each joined socket; `gameStore.addChat` appends). Leads to check:
  (1) does the same user have **multiple live sockets** (reconnect/keepalive
  leaving stale sockets so the broadcast hits the browser N times)? Check
  `webSocketClose` cleanup + the new 30s keepalive; (2) **welcome `chatTail`
  vs live events** — on join the store sets `chat = chatTail`; if a live `chat`
  event for an already-in-tail message also appends, it double/triples. Add a
  dedupe by (from, at, text) or an id; (3) React re-mount re-subscribing. Repro
  in a room with two browsers, watch the network frames, then fix at the source
  (prefer server single-broadcast + client idempotent append with a msg id).

## Cross-cutting rules (already established — keep following)

- **Light-skin contrast**: on permanently-dark surfaces (`bg-black/50`+) use
  `text-white` / `GHOST_BTN_SM_DARK`, never `--color-ivory` (it flips dark in
  the light skin). Themed felt panels keep ivory. Any new dark pill (deck,
  sound toggle, sort button on a dark bar) follows this.
- **Every new visual state → a scene** in `sceneManifest.ts` + `scenes.ts`
  with a `probe` (auto axe-checked by `scenes.spec.ts`). Deterministic staging
  (fixed timestamps/seed; compute time-based values at load, probe on testids).
- **Verify per change**: `npm run format && npm run lint && npm run typecheck
&& npm test && npm run e2e:scenes`, plus `npm run shots` and eyeball the
  light-skin PNGs for anything visual. Commit per workstream; push; the CI +
  e2e workflows run on `main` (green now). Deploy with `npm run build` then
  `wrangler deploy` in `apps/server` (prod = jaffre.marcportal.com).
- **CI e2e + reduced motion**: `apps/web/playwright.config.ts` sets
  `reducedMotion: 'reduce'`, so entrance animations are OFF under test — make
  sure deal/sort features degrade gracefully to a static final state (axe reads
  the settled DOM). Don't rely on an animation completing for a test to pass.

## Suggested order

A (disabled restyle, quick win) → E (overlay polish) → **chat-triples bug** (fix
before more chat/room work) → D (sound engine + toggle, unlocks the ASMR feel) →
B (deal animation, uses D) → F (bet cards, reuses the card + deal + sound work)
→ C (drag + colour sort, uses D) → G (take-over + visitor page, mostly
independent — can slot in anytime after the bug fix). **H (seat change + lobby
voice) is small and independent — a good quick win any time.** B, C, F are the
big creative pieces; prototype feel early and iterate in `npm run shots` / a
live `#practice` game.

## Open questions for the user

- Sound **default on or off**? (Recommend off + a toggle.)
- Colour-sort order: suit grouping order (red, brown, green, blue?) and within
  a suit ascending or descending?
- Should manual drag order **persist** only for the round, or auto-re-sort each
  new deal?
- Deck deal: deal all four players visually, or only _your_ hand flies in?
- Bet cards: keep the current bid buttons as a fallback, or fully replace them?
  Confirm gesture — tap the card, or drag it up like playing a card?
- Take-over: open to any spectator, or only the room creator / invited? Should a
  taken-over bot's accumulated score/tricks just carry to the human (yes,
  simplest) — confirm.
- Visitor page: always shown to spectators of a started room, or only when there
  are bot seats available to replace?
