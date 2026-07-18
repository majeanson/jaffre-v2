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

## Phase C — In-game chrome ✅ (voice icon TODO)

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

## Phase D — Round summary / scoreboard ⬜

- [ ] **D1. Separate this-round vs total.** The round-over overlay muddles the
      round delta with the running total. Fold the per-round + total into the same
      ruled round-table format (like the scoreboard) so "points this round" and
      "game total" read as distinct rows. Files: `RoundSummaryOverlay.tsx`,
      `ScorePad`/`ScoreStrip.tsx`.
- [ ] **D2. Trump in bets.** Round summary + scoreboard bet column shows the trump
      used; sans-atout marked with `*` (or a no-trump glyph). Needs the trump/
      sans-atout on the round summary (check engine `RoundSummary`). Files: engine
      `RoundSummary` (if missing), `ScorePad`, `RoundSummaryOverlay.tsx`.

## Phase E — Menus / lobby / share ⬜

- [x] **E1. Slim share sheet.** Dropped Texto/Courriel/Plus. Keeps QR + code words + link + Copy; auto-copies on open with a "Link copied — just paste it" note.
      `ShareSheet.tsx`.
- [ ] **E2. Arcade buttons for text links.** Replace bare text links/buttons with
      the arcade kit everywhere: "Retour à l'accueil", "Comment jouer", "Joindre le
      vocal", "Envoyer", lobby "Assis-toi ici" / "Ajouter un bot". Files: lobby, home
      chrome, chat, voice bar.
- [ ] **E3. Bot difficulty color-coding + per-bot in rooms.** Color-code
      Facile/Normal/Difficile chips (practice + lobby). Room "Ajouter un bot" prompts
      difficulty; the seat shows it. Needs `add_bot { difficulty }` in protocol +
      `GameRoom` bot creation + distinct bot names. Files: `protocol`, `GameRoom.ts`,
      `Lobby.tsx`, `PlayMenu.tsx`.

## Phase F — Player info on click ⬜

- [ ] **F1. Expand a seat → player info/stats.** Click/tap a seat chip to open a
      small player panel: name, team, avatar; for humans, their record (reuse the
      stats fetch); for bots, difficulty. Files: `Seat.tsx`, a `PlayerPeek` popover.

## Phase G — Personalized card (bigger) ⬜

- [ ] **G1. Painted card → seat avatar.** Use the player's painted card (already
      stored in the profile) as their seat avatar/pictogram where available.
- [ ] **G2. Painted card → your own 0-cards.** Your red 0 / brown 0 bonhommes
      render your painting (opt-in). Renderer reads the local profile paint; only
      applies to the viewer's own specials. Files: `cardSkin.tsx`, `PlayingCard.tsx`,
      profile plumbing.

---

## Sequencing

A (identity/readability) → B (skin clarity) → E1 (share, self-contained) → C
(chrome) → D (summary) → E2/E3 (buttons + bot difficulty; touches server) → F
(player peek) → G (personalized card). Land each phase as its own commit(s).
Server-touching items (D2 trump if missing, E3 add_bot) get their own careful
commits + tests.

## Resume prompt (for a fresh session)

> Continue the Jaffré "Table & UX pass" backlog in `docs/PLAN-table-ux-pass.md`.
> Decisions are locked at the top. Pick up the first unchecked phase, implement
> it (client-only unless noted), run typecheck/lint/format + the relevant e2e,
> commit to `main`, and check the item off. Verify the live bundle after deploy.
> `DEV_UNLOCK_ALL` stays true. Ask only if a new ambiguity appears.
