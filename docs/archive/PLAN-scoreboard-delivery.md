# PLAN-scoreboard-delivery.md — the navbar receives the game (2026-07-29)

Concept (user-chosen scope): every change to the top bar arrives as a visible
delivery from the game event that caused it. The mid-felt toast stack is the
launch pad; the bar's chips are the landing pads. Chosen options: ALL five
deliveries · displayed value WAITS for the flight to land · arc + landing
pulse styling.

## The one mechanism

`apps/web/src/table/flight.tsx` — a single payload-flight system, three parts:

1. **`<FlightLayer />`** — mounted once in Table, REAL PLAY ONLY
   (`{dev && <FlightLayer />}`): a fixed, `pointer-events-none`, z-[49] layer
   that renders in-flight clones. No layer mounted (scenes, replay) → every
   launch is a no-op that lands instantly. This is the whole scenes/replay
   story: no gating sprinkled anywhere else.
2. **`launchFlight({ from, to, payload, key })`** — module function. `from` is
   a DOMRect or source element (measured at launch); `to` is a target id
   resolved via `[data-flight-target="<id>"]` in the DOM. Targets:
   `score-0`, `score-1`, `trump`, `contract`. Flight = WAAPI keyframes,
   translate source→target with a −40px mid-arc and scale 1→0.85, duration
   `paced(600)`, ease-out. Missing target, reduced motion, or hidden document
   → land immediately. Landing resolves the flight's hold (below) and removes
   the clone.
3. **Holds — the wait-for-landing truth model.** Game truth is NEVER touched;
   only the DISPLAYED bar lags. A tiny module store (subscribable, like
   dealPace's idiom):
   - `hold(key)` / `release(key)` where key ∈
     `points-0`, `points-1`, `trump`, `contract`, `score-0`, `score-1`.
   - Every hold auto-releases after a 900 ms hard timeout — a flight can be
     lost (tab hidden mid-animation), the score cannot.
   - `snapAll()` on any discontinuity: roundIndex change, reconnect,
     phase → game_over.
   - `useHeldDisplay(view, trickCounts, contract)` — hook used by Table:
     returns `{ view, trickCounts, contract }` shallow-copies with held
     deltas masked: a held `points-N`/`score-N` shows the previous number, a
     held `trump` shows `trumpDecided: false`, a held `contract` shows null.
     The PREVIOUS values come from refs the hook keeps; when a watched value
     changes while its key is held-pending (registered by the launcher), the
     old value displays until release. Reduced motion → passthrough always.

Because the bar's flash-on-change tick (ScoreStrip `flashTickRef`) fires when
the DISPLAYED value changes, and the displayed value changes exactly at
landing, the landing pulse is free — no new animation in the strip beyond a
`pop-in` on the trump badge's first appearance.

## The five deliveries

1. **Trick points** — when `heldBanner` appears, TrickBanner launches its
   team `+N` chip (source = the chip element itself, payload = a mini copy of
   the strip's tally chip styling) to `score-<team>`, holding `points-<team>`.
   The banner keeps its own chip visible (the clone flies, the banner stays
   whole — it is still the trick's record while held).
2. **Trump set** — TrumpCallout, on mount, launches its `SuitShape` to
   `trump`, holding `trump` so the bar's badge appears (pop-in) only at
   landing. Callout keeps its own shape.
3. **Contract won** — when `view.contract` transitions null→set, Table
   launches a bid-number chip from the winner's seat anchor
   (`[data-deal-target="<relative seat>"]` — the deal-intro anchors, reused)
   to `contract`, holding `contract`.
4. **Specials** — TrickBanner launches the `+5`/`−3` badge as a SECOND
   flight, 200 ms after the points chip, same target, its own hold key not
   needed (points hold already covers the number; the badge flight is the
   emphasis — bigger landing, `special-burst` on the clone).
5. **Round total** — when `view.scores` changes (round scored), Table
   launches `±total` chips from the round-summary overlay's centre (fallback:
   viewport centre — the overlay owns the screen at that moment) to
   `score-0`/`score-1`, holding `score-N`. Longer hold timeout is NOT needed;
   the same 900 ms cap applies.

## Landing pads (packages/ui/ScoreStrip.tsx)

Attribute-only changes: `data-flight-target="score-0|score-1"` on the two
team pills, `"trump"` on the TrumpBadge slot (the slot must exist — and keep
its rect — even while undecided), `"contract"` on the contract chip. No API
changes; Table passes the masked values it already computes.

## Coverage

- motion.spec (chromium-motion): a practice trick → `flight-chip` testid
  appears; the team pill's number updates only AFTER the chip is gone
  (poll ordering); with the trump callout, the bar shows no trump badge while
  the flight is airborne, then shows it.
- chromium (reduced motion): no `flight-chip` ever renders; values update
  instantly — existing truth specs (queue-play, coach-off, a11y) already
  gate correctness on this path.
- Scenes: no FlightLayer → launches no-op; staged shots unchanged.

## Invariants (do not trade away)

- Truth first: holds mask DISPLAY only, auto-snap ≤900 ms, snap on
  discontinuity. A wrong-looking flight is acceptable; a wrong score is not.
- One system: no per-delivery bespoke animation code outside payload styling.
- Real play only, by construction (layer presence, not flags).
- All timings through `paced()`; reduced motion = instant everywhere.
