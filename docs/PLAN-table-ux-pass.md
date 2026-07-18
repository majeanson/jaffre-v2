# Table & UX pass — backlog

A batch of table/skin/lobby/share UX improvements from playtest feedback
(2026-07-17). This doc is the source of truth: decisions are locked, each item
has an approach + target files + status. Work proceeds in phases; commit each
phase to `main` (fast deploy, e2e checked separately). Check items off as they
land.

## Locked decisions

- **Personalized card** → _your seat avatar_ **and** the bonhomme art on **your
  own** 0-cards (red 0 / brown 0). The rest of the deck keeps the chosen skin.
  Prompt for the painting during identity setup; bots keep generated avatars.
- **Room bot difficulty** → "Ajouter un bot" prompts **Facile / Normal /
  Difficile** (color-coded), shown per seat in the lobby (like the mock). Mirrors
  practice-mode adversaires. Needs protocol/server `add_bot { difficulty }`.
- **Fonts**: no Visitor TTF (licensed) — keep Silkscreen.
- **DEV_UNLOCK_ALL** stays `true` for now (everything previewable).

## Conventions

- "A reskin is a `[data-*]` token block / renderer, never a component edit."
- Team colors come from `--color-team-a` (Sun) / `--color-team-b` (Moon); never
  hardcode. Every theme must keep them distinct AND legible.
- Arcade buttons = the shared `Cta` / icon-button kit, not bare text links.

---

## Phase A — Team & seat identity (readability) ✅

- [x] **A1. Sun/Moon icons.** The top-bar team sides + the scorepad header now
      use the ☀/☾ `TeamGlyph` (deep-ink variant on the cream pad) instead of a
      dot+word. Files: `ScoreStrip.tsx`. TODO: round summary + lobby team labels
      still say the words — fold into Phase D / lobby pass.
- [x] **A2. Highlight your team.** The viewer's team gets a violet "YOU" chip in
      the top bar + an underline in the scorepad header (`myTeam` threaded
      Table→TopBar→ScoreStrip). Per-theme contrast audit still TODO.
- [x] **A3. Distinct avatar per player.** Seat avatars now take a stable
      per-name pastel colour (hash → hue) + the initial, with a ☀/☾ team badge
      corner-overlaid. Identical initials (Marc/Marcel) now differ by colour +
      team badge. New shared `TeamGlyph` (SVG sun/moon in team colour). Files:
      `Seat.tsx`, `TeamGlyph.tsx`. (Home `AvatarChip` still uses the chosen colour
      — fine; Phase G swaps the viewer's own to their painted card.)
- [x] **A4. Real name, not always "Toi".** Table seats now show the real name +
      a small "(toi)" marker on the viewer's seat (no more "You"/"Toi" replacing
      the name). Practice names the human seat with `playerName()`. Files:
      `useTableDerived.ts`, `Seat.tsx`, `SeatChip.tsx`, `localGame.ts`. TODO: the
      lobby `SeatPicker` still says "You" — fold into Phase E.

## Phase B — Card skin clarity ✅

- [x] **B1. Noir = desaturated, not near-black.** Suit tokens are now muted hues
      (maroon/taupe/sage/slate), tell-apart by colour. `tokens.css`.
- [x] **B2. Suit symbol on bonhomme cards.** The default bonhomme 0-cards render a
      small `SuitShape` beneath the figure (covers noir + all token skins). OG
      skins keep their coloured emblems/portraits. `PlayingCard.tsx`.

## Phase C — In-game chrome ✅ (voice icon done in E2)

- [x] **C1. Skins as a modal in-game.** New `CollectionSheet` renders the exact
      `Collection` view as a full-screen modal over the table (Escape / "Close"
      to dismiss); the in-game Skins control opens it instead of routing to
      `#collection`. Home keeps the route link. Files: `CollectionSheet.tsx`,
      `TopBar.tsx`, `Collection.tsx` (leaveLabel prop).
- [x] **C2. Icon-only top bar options.** The drawer is now uniform icon squares
      in one row: Skins (IconCards → modal), Language (IconGlobe → toggles), plus
      the existing Sound/Help/Coach/Log. New IconCards/IconGlobe/IconMic. Files:
      `TopBar.tsx`, `icons.tsx`. TODO: the online Voice control still shows
      "Joindre le vocal" text — convert `VoiceBar` join to IconMic (also lobby).

## Phase D — Round summary / scoreboard ✅

- [x] **D1. Separate this-round vs total.** The round-over overlay now splits each
      team card into two labelled ruled rows — "This round" (the signed delta) over
      "Game total" (the running score) — so the delta never reads as the total. The
      contract sub-line + team cards swapped the dot+word for `TeamGlyph` (☀/☾).
      Files: `RoundSummaryOverlay.tsx`.
- [x] **D2. Trump in bets.** Added `trump: Suit | null` to engine `RoundSummary`
      (set from `state.trump` where the round is scored; null == sans-atout), threaded
      into `ScoreboardRound` + the overlay. The scorepad bet column and the overlay
      headline now show the trump suit mark; sans-atout shows a gold `*` (pad) / `SA`
      (overlay). Files: engine `types.ts`/`reducer.ts` (+scoring test), `ScoreStrip.tsx`,
      `RoundSummaryOverlay.tsx`, `useTableDerived.ts`, server round-summary test fixtures.

## Phase E — Menus / lobby / share ⬜

- [x] **E1. Slim share sheet.** Dropped Texto/Courriel/Plus. Keeps QR + code words + link + Copy; auto-copies on open with a "Link copied — just paste it" note.
      `ShareSheet.tsx`.
- [x] **E2. Arcade buttons for text links.** Lobby seat actions (Sit/Move here,
      Add bot) → `Cta`; lobby footer (Retour / Comment jouer) → arcade buttons;
      chat "Envoyer" → arcade button; voice "Joindre le vocal" → **mic icon**
      (finishes C2's voice bit). Files: `SeatPicker.tsx`, `Lobby.tsx`,
      `ChatPanel.tsx`, `VoiceBar.tsx`. TODO: `PlayMenu` practice adversaires + the
      home-nav text links are already arcade; nothing left there.
- [x] **E3. Bot difficulty color-coding + per-bot in rooms.** The lobby already
      had per-bot difficulty (`onAddBot(seat, difficulty)` → protocol/server); now
      the chip is **colour-coded** (green Easy → gold Normal → red Hard) and
      arcade-styled, and the seat labels carry ☀/☾ glyphs. Files: `SeatPicker.tsx`.
      (Add-bot seeds Normal then tap-to-cycle; bots already get distinct
      names/numbers — good enough; a pick-on-add popover can come later if wanted.)

## Phase F — Player info on click ✅

- [x] **F1. Expand a seat → player info/stats.** Tapping any seat chip opens a
      `PlayerPeek` popover: team glyph + name + connection, then a body that respects
      the self-scoped `/api/stats` — your OWN seat shows your record (games/wins/
      win-rate/streak via `fetchStats`), a bot shows its colour-coded difficulty
      (green/gold/red like the lobby), any other human shows name/team/connection
      only (no fetch). A transparent overlay button keeps `Seat` presentational
      (axe-clean); closes on Escape/outside-click and returns focus (mirrors the
      last-trick popover); edge-aware placement keeps left/right/bottom seats
      on-screen. Files: `SeatChip.tsx`, new `PlayerPeek.tsx`, `useTableDerived.ts`
      (seat `difficulty`), `Stage.tsx`/`UtilityRow.tsx` (placement).

## Phase G — Personalized card (bigger) ✅

- [x] **G1. Painted card → seat avatar.** When it's the viewer's own seat and
      `getProfile().paint` exists, `Seat` renders the painting as the avatar (in
      place of the initial+hue), keeping the team badge + connection dot on top.
      `SeatChip` reads the paint (viewer-only — the roster carries no other
      player's paint) and threads it in. Files: `Seat.tsx`, `SeatChip.tsx`.
- [x] **G2. Painted card → your own 0-cards.** `PlayingCard` gains an opt-in
      `paint` prop; it replaces the bonhomme with the painting ONLY for a red-0/
      brown-0, and only the `Hand` passes it (via `PlayerHand` → `getProfile().paint`).
      Since only the viewer's own cards render through the Hand, table-played 0-cards
      never receive paint and keep the normal bonhomme — ownership stays unambiguous.
      New `painted-card` scene (seed 2 deals seat 0 both specials; `paint` seeded via
      `SceneMeta`, restored on exit). Files: `PlayingCard.tsx`, `Hand.tsx`,
      `PlayerHand.tsx`, `sceneManifest.ts`, `scenes.ts`, `Scenes.tsx`.

---

## Sequencing

A (identity/readability) → B (skin clarity) → E1 (share, self-contained) → C
(chrome) → D (summary) → E2/E3 (buttons + bot difficulty; touches server) → F
(player peek) → G (personalized card). Land each phase as its own commit(s).
Server-touching items (D2 trump if missing, E3 add_bot) get their own careful
commits + tests.

## Resume prompt (for a fresh session)

Paste this into a new session:

> **Finish the Jaffré "Table & UX pass" — Phases D, F, G.**
>
> Repo: `C:\Users\marc_\Documents\WebApp\jaffre` (Cloudflare Workers + D1 + Durable
> Objects backend; Vite/React 19/Zustand frontend; npm workspaces `apps/web`,
> `apps/server`, `packages/ui|engine|bots|protocol`). The full backlog + locked
> decisions are in `docs/PLAN-table-ux-pass.md` — Phases A/B/C/E are done (✅);
> **do the three unchecked phases D, F, G**, one at a time, most-requested first (D).
>
> **Workflow (match the existing history):** land each phase as its own commit
> straight to `main` (it auto-deploys to jaffre.marcportal.com; deploy is gated on
> the FAST `ci` job = format:check/lint/typecheck/test/build, NOT e2e — so run
> `npm run typecheck`, `npm run lint`, `npm run format` before every commit, or CI's
> `format:check` fails). Verify with targeted `npx playwright test -c
apps/web/playwright.config.ts <spec>` for the areas you touch, and screenshot via a
> throwaway `apps/web/e2e/_x.spec.ts` (delete it before committing). After deploy,
> curl the live bundle to confirm. `DEV_UNLOCK_ALL` stays `true`. End commit messages
> with the Co-Authored-By trailer.
>
> **Conventions:** a reskin is a `[data-*]` token block / renderer, never a component
> edit; team colours come from `--color-team-a`(Sun)/`--color-team-b`(Moon); use the
> arcade kit (`Cta`, `IconButton`) and the shared `TeamGlyph` (☀/☾) — both already
> exist. Scenes use the roster name `'You'` so they read "You (you)"; real play uses
> `playerName()` — that's expected, don't "fix" scenes.
>
> **Gotchas (learned the hard way):**
>
> - `getGuestToken` dedupes concurrent mints — do NOT add app-mount `fetch`es that
>   race the room socket's own `getGuestToken` (that broke reconnect via a two-identity
>   token clobber).
> - Viewer-relative UI (the "YOU" team chip, "(you)" seat marker) makes two clients'
>   score-strip text differ — `multiplayer.spec` normalises `\bYOU\b` out before
>   comparing; keep any new viewer-relative text out of cross-client equality checks.
> - Windows: the server vitest run ends with a harmless `EBUSY` teardown message —
>   the tests still pass (42).
>
> **Phase D — round summary + trump** (`apps/web/src/table/RoundSummaryOverlay.tsx`,
> `packages/ui/src/components/ScoreStrip.tsx` `ScorePad`, engine `packages/engine`):
>
> - D1: the round-over overlay muddles _this round's_ delta with the _game total_ —
>   restructure so "points this round" and "game total" are clearly distinct (ideally
>   reuse the ruled round-table look from `ScorePad`). Also swap the overlay's "Équipe
>   Soleil/Lune" dot+word for `TeamGlyph`.
> - D2: show the **trump** with the bet in the round summary + the scorepad bet column;
>   mark **sans-atout with `*`** (or a no-trump glyph). NOTE: engine `RoundSummary`
>   (packages/engine/src/types.ts ~L49) has `contract.sansAtout` + `contractMade` but
>   NOT the trump suit — add `trump: Suit | null` to `RoundSummary` where the round is
>   scored, thread it into `ScoreboardRound` (ScoreStrip) + the overlay. `suitName()`
>   from `@jaffre/ui` localises the suit. Add/adjust the server round-summary test if
>   the shape changes.
>
> **Phase F — click a seat → player peek** (`apps/web/src/table/SeatChip.tsx`, a new
> `PlayerPeek` popover): tap a seat to open a small panel — avatar + name + team
> (`TeamGlyph`). CONSTRAINT: `/api/stats` is self-scoped (you can only fetch YOUR OWN
> record), so show the full record only for the viewer's own seat (reuse `fetchStats`);
> for bots show difficulty (`roster.seats[i].difficulty`); for other humans show
> name/team/connection only. Close on outside-click/Escape (mirror the last-trick
> popover). Keep it axe-clean.
>
> **Phase G — personalized painted card** (locked: painted card → the viewer's SEAT
> AVATAR **and** the bonhomme art on the viewer's OWN red-0/brown-0). The paint is a
> data-URL at `getProfile().paint` (`apps/web/src/net/auth.ts`), viewer-only (other
> players' paint isn't in the roster).
>
> - G1: in `Seat.tsx`, when it's the viewer's seat (`isYou`) and paint exists, render
>   the painting as the avatar instead of the initial+hue. Thread the paint in via a
>   prop (SeatChip reads `getProfile().paint`).
> - G2: the viewer's red-0/brown-0 show the painting. HARD PART: `PlayingCard` doesn't
>   know card ownership. Only cards in the viewer's HAND are theirs — so pass a `mine`
>   flag (or a viewer-paint context the `Hand` provides) and have the centre-mark use
>   the paint only for `mine && value===0`; played-to-table 0-cards keep the normal
>   bonhomme (ownership is ambiguous there). Design this explicitly; add a scene.
>
> Update the checkboxes in this doc as you finish each item.
