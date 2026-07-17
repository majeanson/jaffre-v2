# Phase 4 — "Refined Arcade Violet" design restyle

> **Status (2026-07-16): SHIPPED to main + prod.** All seven workstreams built
> from the written handoff and merged (`89b5e6a`); live on jaffre.marcportal.com.
> Built from the written spec (no pixel mockups were on disk), so W5–W7 — which
> this plan first marked "blocked on design" — are faithful interpretations the
> design pass may still refine. The **home/identity** surface got a follow-up
> polish pass (`d00e48d`): Silkscreen display font, condensed layout with a
> `Customize` disclosure, and reusable `Panel`/`Collapsible` kit primitives.
> **Turn 6 shipped (W5–W7, this pass):** the design tool's 6a–6k mockups landed
> and Stats / Invite+Share / Standing-table are now built to them — including the
> share-sheet **QR** (bundled `qrcode-generator`) and the **nemesis** + net-points
> `/api/stats` fields. See W5–W7 below for what's done and what's deferred
> (per-game scorepad grid, SWAP SEATS, the multi-table "Your tables" row — each
> needs a deeper data model).
>
> Remaining follow-ups: swap the licensed **Visitor** TTF in for the
> **Silkscreen** stand-in (`--font-arcade-display`); "name taken" is a
> visual-only scene (guests aren't name-unique server-side); the arcade shell is
> one look that only flips light↔dark (juicy == dark on these surfaces — make it
> skin-aware if that's wanted).

Bring the claude.ai/design pass into the app: a juicy violet product skin
(Balatro-style card juice on a Sentry-style violet shell) applied across the
identity + social surfaces built in Phases 1–3.

Design source of truth: `~/Downloads/JAFFRE_HANDOFF.md` and the
`Jaffre - Player Identity.dc.html` design file (turn 4 = mobile flow, turn 5 =
desktop / light skin / spec). This plan translates that handoff into
implementation workstreams against the current code.

## Grounding (verified 2026-07-16)

- **Skins are tokens-only.** A skin is a `[data-theme=…]` block in
  `packages/ui/src/tokens.css`, registered in `apps/web/src/theme.ts` `THEMES`.
  Today: `dark` (default), `light`, `juicy`. "A reskin is a `[data-theme]`
  block, never a component edit" — the existing rule; the restyle honors it.
- **A `juicy` arcade skin already exists** (purple/pink, `#14082e` felt, hard +
  glow shadows, 14px card radius). The handoff's "Refined Arcade Violet" is a
  more disciplined version of this direction — treat it as either a refinement
  of `juicy` or a new `arcade` skin (see open questions).
- **Token-name mismatch to reconcile.** The handoff names tokens `--ground /
--panel / --ink-hard / --violet / --gold / --text / --muted`, but the codebase
  is semantic: `--color-felt-*` (surfaces), `--color-ivory` (foreground),
  `--color-lamplight` (accent), `--color-card-face`, `--color-suit-*`,
  `--color-team-*`. Map the handoff hexes onto the existing semantic tokens and
  add only the genuinely new ones (`--ink-hard` border/shadow color + a
  hard-shadow scale). Don't fork the token vocabulary.
- **Per-user color already has a column.** `users.color` exists
  (`migrations/0002_identity.sql`) but nothing reads/writes it yet. The
  handoff's `player-card` paint feature (a paintable `<canvas>`, brush = chosen
  color) is what fills it — a real feature, not just a restyle.
- **Fonts differ.** Current: Fraunces + Instrument Sans (`--font-display` /
  `--font-ui`). Handoff wants **Visitor** (display/numerals/caps — currently
  from cdnfonts, **must self-host the TTF**) + **Rubik** (UI/body), numbers
  tabular. Self-hosting is required (offline + no external CDN).
- **Surface → file map:**
  - Identity / recovery first-run: `apps/web/src/home/RecoveryCard.tsx`,
    `NameField.tsx`, `PlayMenu.tsx`, `screens/Home.tsx`.
  - Stats "Your record": `apps/web/src/screens/Stats.tsx`.
  - Invite / join landing: `apps/web/src/screens/Visitor.tsx`,
    `components/ShareButton.tsx`.
  - Standing table / rematch tally: `apps/web/src/table/GameRecap.tsx`,
    `PlayMenu.tsx` ("Resume last room" strip).

## Design-readiness gate (what unblocks which workstream)

Per the handoff, only some surfaces have a finished design; the rest are
**paused on quota** in the design tool. Sequence around that:

- **Delivered design** (build now): the juicy skin system + primitives, and the
  **identity / recovery** first-run (empty / loading / error / light + desktop).
- **NOT yet designed** (blocked on the design pass resuming): **Stats**,
  **Invite & join**, **Standing table / rematch**. Build their _structure_ now
  if useful, but hold the visual pass until the design tool delivers each in the
  same 4a language.

## Workstreams

### W1 — Skin foundation (tokens + system primitives) — do first

Make the skin exist and be toggleable before touching any surface.

- Add the arcade palette as a `[data-theme]` block in `tokens.css`, expressed in
  the existing semantic token names (felt/ivory/lamplight/card-face/suit/team),
  plus new `--ink-hard` and a hard-shadow scale (offset x=y, **zero blur**,
  `--ink-hard`: 3px small · 4px controls · 6px cards · 8px hero). Radii: 8 inner
  · 10 controls · 12 panels · 14 cards · 16 hero. Register in `theme.ts`.
- Light-skin flip block (handoff provides the values): `--ground #f4f1fa`,
  `--panel #fff`, `--text #181225`, `--gold #d99a00` (darkened for AA);
  `--ink-hard` stays. Card face stays ivory `#f6efdf` in both.
- Self-host **Visitor** (TTF) + **Rubik** via `@font-face`; wire `--font-display`
  / `--font-ui`; tabular numerals. Confirm licensing to bundle.
- Motion: `wobble` (~4.4s rotate ±2°) + `foil` sweep (~4.6s), both disabled
  under `prefers-reduced-motion`.
- Verify: existing scenes render + stay axe-clean under the new skin in **both**
  skins; no surface markup changed yet.

### W2 — Shared components (the reusable kit)

Build the handoff primitives in `packages/ui/src/components` with stories +
scenes, so every surface composes them verbatim:

- `avatar-chip` (square rounded, initial in Visitor, 2px ink border + hard
  shadow), `word-plate` (ivory recovery-word pill), `stat-panel` (big Visitor
  number + uppercase muted label), `cta` (violet caps + hard shadow),
  `icon-rail` (one grouped panel, 2px ink divider bars, violet dots).
- `player-card` (ivory, corner initials + center avatar + name; foil + wobble;
  **paintable `<canvas>`** layer — brush = chosen color, ink toggle, eraser via
  `destination-out`, clear). Canvas is the substance of W4.
- Selected-chip rule: 3px ring in `--text` (light: `--ground`) and **drop** the
  offset shadow (avoids stacked shadows).

### W3 — Identity / recovery restyle (design is finished — highest fidelity)

Apply W1+W2 to the first-run identity flow — the one surface with a complete
spec. States: empty (new player) · loading (shimmer) · error (name taken / code
not found) · light skin · desktop first-run.

- `RecoveryCard.tsx` → `word-plate` trio (LAMPE / TRICOT / HIBOU) + `cta`.
- `NameField.tsx` / `PlayMenu.tsx` / `Home.tsx` → arcade panels, `avatar-chip`,
  `player-card` preview. Keep the `data-testid`s the e2e suite relies on
  (`recovery-code`, etc.) — restyle is markup/class only.
- New/updated scenes for each state; axe both skins.

### W4 — Color / paint persistence (backend + client)

Make the chosen color/paint durable and shared across screens.

- Server: read/write `users.color` — `/api/auth/guest` + `/api/auth/me` return
  it; a small `POST` to set it (or fold into an existing profile call). Persist
  the paint as the color value (and/or a compact canvas blob if we keep freehand
  paint — decide in open questions).
- Client: `player-card` paint saves; name/color/paint shared across identity,
  seat chips, and stats, matching the handoff's "shared across screens" preview.
- Tests: server vitest for the color round-trip; e2e for persistence across a
  fresh context (mirrors the recovery-flow test).

### W5 — Stats "Your record" restyle — SHIPPED (Turn 6 · 6a)

Built to the delivered 6a mockup: ivory ruled record-book hero (gold win rate +
form `Sparkline`), a 3-up headline row (Games / **Net points** / Best streak),
one bid-accuracy % over a striped fill bar, **Best partner + Nemesis** side by
side, a ruled scorepad of recent games, and a `PixelWave` ("Dealing…") loading
state (new `stats-loading` scene). Two **safe additive `/api/stats` fields** now
back this: `netPoints` (your team's summed final margin) and `nemesis` (the
opponent, min 2 games, who's beaten you most) — server + vitest in
`apps/server/test/stats.test.ts`. The player's own `users.color` fills the
header avatar chip.

### W6 — Invite & join restyle — SHIPPED (Turn 6 · 6c/6d)

Join landing (`Visitor.tsx`): "{host} wants you" header, the takeable seat
**previews you** (name + saved colour) with a violet `ap-glow` pulse, and a hero
"Sit down" over the mini 4-seat diagram. Share sheet (`ShareSheet.tsx`): the
"Pull up a chair" bottom sheet with a **real scan-to-join QR** (bundled
`qrcode-generator`, offline / CSP-safe — no CDN), the room code as ivory
`WordPlate`s, the link with one-tap copy, and Text / Email / More hand-off
targets (`sms:` / `mailto:` / Web Share).

### W7 — Standing table / rematch restyle — SHIPPED (Turn 6 · 6e, partial)

`GameRecap.tsx` now shows the "Still at the table" roster as per-seat status
chips (Ready / Away / Left) ahead of the hero Rematch. **Deferred (need a deeper
data model, per the fidelity-scope decision):** the per-game scorepad grid
(6e/6i — only the aggregate `seriesWins` tally is tracked, not per-game series
scores), the **SWAP SEATS** action (no seat-swap protocol / handler exists), and
the multi-table home **"Your tables"** row (6f — the app tracks a single
`lastRoom`, not multiple live tables).

## Cross-cutting rules (unchanged)

- Tokens-only reskin; all skins; **light-skin contrast rule**: on permanently
  dark surfaces use `text-white`, never `--color-ivory` (it flips dark in the
  light skin). Themed felt panels keep ivory.
- Every new visual state → a scene in `sceneManifest.ts` + `scenes.ts` with a
  probe (axe-checked by `scenes.spec.ts`); keep existing testids for e2e.
- No emoji; no account vocabulary; team = color + dot, suit = color + shape;
  touch targets ≥40px; WCAG AA in both skins.
- Verify per change: `npm run format && npm run lint && npm run typecheck &&
npm test`, plus `npm run e2e:scenes` / targeted e2e and `npm run shots` (eye
  the light-skin PNGs). Migrations forward-only additive.

## Order

W1 (skin foundation) → W2 (component kit) → W3 (identity — fully specced) → W4
(paint persistence). W5–W7 wait for the design tool to deliver those surfaces;
their behavior already exists, so they're pure restyles when the design lands.

## Open questions for next session

- **New skin `arcade`, or refine `juicy`?** (Recommend a new `arcade` skin;
  decide whether to retire `juicy`.)
- **Default skin** stays `dark`, or does `arcade` become default?
- **Token reconciliation**: confirm mapping the handoff names onto the existing
  semantic tokens + adding only `--ink-hard` and the hard-shadow scale (vs.
  introducing the handoff's literal token names).
- **Paint scope**: ship the full paintable `<canvas>` now, or start with
  color-pick only and add freehand paint later? (Affects whether `users.color`
  stores a hex or a small blob.)
- **Visitor font**: confirm the TTF is licensed to self-host/bundle.
- **`nemesis` stat** (worst partner) — the handoff's Stats wants it; Phase 1's
  `/api/stats` computes `bestPartner` only. Add `worstPartner` when W5 lands.
