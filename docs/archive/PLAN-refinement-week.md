# PLAN-refinement-week.md — improvements only, no new features (2026-07-29)

Scope rule: everything here refines what already exists — sequencing, structure,
copy, coverage, caching. Nothing adds a surface. Ordered by leverage; each item
names its files, its exact change, and how it is verified.

---

## 1 · Settle the round-start deal sequence (yesterday's ship, made whole)

What shipped yesterday works but has two visible incoherences and zero tests.

**1a. The auction runs behind the deal.** In practice games the bots bid on
their own timers, so `Marcel PASS` can sit on the felt while cards are still in
the air — you are "dealt in" to a hand two bots already passed on.

- Fix: `dealPace.ts` exports a module-level `dealActiveUntil()` timestamp, set
  when `useDealRun` starts a deal. `localGame.ts#scheduleBots` stretches its
  bidding-phase delay to `max(paced(750), dealActiveUntil − now + 200)`.
  Reduced motion → timestamp never set → e2e timing untouched. Online rooms:
  server bots are out of reach; a bubble during the deal is acceptable there.

**1b. The two halves of one animation disagree.** The fly-out sends 3
card-backs per seat; your fan takes 8. And seats are dealt in blocks
(seat 0's three, then seat 1's three…) — a real deal goes around the table.

- Fix: one `dealSchedule()` in `dealPace.ts` owns every delay. Round-robin
  order `[1, 2, 3, you]` × 3 rounds for the rim (opponents keep 3 — visual
  shorthand, not a count), then your remaining 5 continue on the same cadence.
  Your fan card _i_ appears at flight-_i_'s arrival time (`delay + ~465ms`,
  the 62% keyframe). `DEAL_TOTAL_MS` derives from the same constants and is
  what `useDealRun` (auction gate), `DealIntro` (fade), and 1a (bot gate) all
  read. Target: last fan card lands 1.4–1.7 s at normal pace.

**1c. Coverage.** New `motion.spec.ts` case (chromium-motion): `#practice` →
deal-intro visible → "Play a bid" absent while it runs → fan grows to 8 →
panel appears. Plus one scene assertion that staged tables never deal
(`noDealIntro` / no-fresh-round gate holds).

Files: `table/dealPace.ts`, `table/DealIntro.tsx`, `table/PlayerHand.tsx`,
`local/localGame.ts`, `e2e/motion.spec.ts`. Verify: typecheck, lint, motion
project run, eyeball a capture at ~0.5 s and ~1.8 s.

---

## 2 · HelpSheet: one content tree, taught in the right order

### Why

`HelpSheet.tsx` is 1,411 lines — the largest client file — and its content
lives as FOUR parallel JSX trees (`RulesEn`/`RulesFr`, `TipsEn`/`TipsFr`).
Moving one card yesterday meant the same structural edit twice, by hand.
Structure drift between EN and FR is this app's recurring bug class; the fix
is to make structure exist exactly once. And with fresh eyes on the content:
the rules are currently ordered by _play chronology_ (bidding before you know
what a trick is), not by _learning order_, and the game's goal (41 points) is
buried in the second-to-last card.

### 2a. Architecture — three files, one structure

- **`help/concepts.ts`** — the `CONCEPTS` glossary data + `ConceptId` type,
  moved as-is (already the right shape: one entry, `{en, fr}` fields).
- **`help/helpPrimitives.tsx`** — `GlossOpenCtx`, `G`, `Strong`, `Rule`,
  `Tip`, `TipSection`, `TipExample`, `termColor`. No content.
- **`help/helpContent.tsx`** — the single source of truth:

  ```tsx
  interface HelpCard {
    title: Record<Lang, string>;
    body: Record<Lang, ReactNode>; // en and fr ADJACENT — one card, one place
  }
  interface TipDef {
    label: Record<Lang, string>;
    body: Record<Lang, ReactNode>;
  }
  interface TipSectionDef {
    title: Record<Lang, string>;
    tips: readonly TipDef[];
  }
  export const RULES: readonly HelpCard[];
  export const TIP_SECTIONS: readonly TipSectionDef[];
  ```

  Shared visuals (the Points card's two `PlayingCard` figures, `TipExample`s)
  are extracted once and referenced from both language bodies.

- **`HelpSheet.tsx`** keeps only machinery: portal, focus trap, scroll region,
  glossary popover, `LearningChecklist`, `Glossary`, and two `.map()`s over
  the content. The four `RulesEn/Fr`, `TipsEn/Fr` components are deleted.
  Expected: HelpSheet ~450 lines, content ~700, net −250 and — the real win —
  a card or tip can never exist in one language and not the other.

### 2b. Rules reorder — 7 cards → 6, core concepts first

Current: Basics → Bidding → Trump → Tricks → Points → Scoring → Table.
Problem: "bid 7 to 12 **trick points**" arrives before tricks or points are
defined; the goal (41) arrives fifth.

Target order and copy (FR mirrors, tutoiement, locked terms — levée, mise,
brasseur, atout, ronde):

1. **The basics** / _Les bases_ — unchanged (teams, 32 cards, suits, 8 each)
   plus a new closing line that states the shape and the goal up front:
   > Each round is one quick auction, then 8 tricks. **First team to 41
   > points wins the game.**
   > _Une ronde, c'est une mise chacun, puis 8 levées. La première équipe à
   > **41 points** gagne la partie._
2. **Tricks & trump** / _Les levées et l'atout_ — MERGE of the old Tricks +
   Trump cards (they were circular in either order; together they're four
   sentences): play one card each, follow the led suit; highest of the led
   suit wins unless trump fell — then highest trump; winner leads next; the
   auction winner's **first card names trump** for the round (sans atout: none).
3. **Points** / _Les points_ — unchanged card (1/trick, red 0 +5, brown 0 −3,
   figures, "always totals 10").
4. **Bidding** / _Les mises_ — now every word is defined. Same facts, the one
   five-clause sentence split in three: bid 7–12 or pass, dealer last · sans
   atout doubles and outbids an equal plain bid · dealer may match to take
   the contract; four passes force the dealer to 7.
5. **Scoring** / _Le pointage_ — ±bid (×2 sans atout), defenders always keep
   their points, then the 41 fine print only (both-cross → higher total;
   contract team on exact tie). The goal itself now lives in card 1.
6. **Reading the table** / _Lire la table_ — unchanged, stays last (UI, not
   rules).

Advanced strategy keeps its section order (bidding → bonhommes → declarer →
defense → 41 → Hail-Mary): it already runs simple→advanced and ends on the
optional gamble. It stays folded in its `<details>` — advanced content out of
a first-timer's path. Learning checklist stays on top (the guided path +
replay); Glossary stays last.

### 2c. Constraints (pinned by e2e — survive verbatim)

- Dialog names: `How to play` / `Comment jouer`.
- `Advanced strategy` / `Stratégie avancée`; the SIX section titles incl.
  `Hail-Mary 12 sans atout` and `Les deux bonshommes (0 rouge et 0 brun)`.
- Tip labels: `Win with the lowest of equals.`, `Garde un petit brun comme
porte de sortie.`
- Glossary: `Glossary`/`Glossaire`, `Trump (atout)`, `Ruff (coupe)`,
  `The red 0 (joffre)` / `Le 0 rouge (joffre)`, `/The \+5 bonhomme/`,
  `/le plus gros lot de la ronde/`.
- Rule-card titles are NOT pinned — the merge/retitle is free.
- FR: reuse existing sentences wherever the fact is unchanged; no
  re-translation churn. Tutoiement throughout.

Verify: typecheck, lint, vitest, e2e `scenes` + `i18n` + `a11y`, then full
suite; screenshot the sheet top-to-bottom in EN and FR and read it once as a
newcomer.

---

## 3 · Encode the violet rule; run the owed sweep

Audit #3 named the pattern after three identical slips in two days: **violet
pairs with ink in this app, never with white.**

- New `apps/web/test/violetInk.test.ts`: scan `src/**/*.tsx` for className
  strings containing `bg-(--color-ap-violet)` and assert each also names an
  ink text colour (or sits on a documented-exception list). Crude, cheap,
  catches the mistake at write-time — axe only catches it once a scene exists.
- Schedule (not run interactively — it starves the machine): the 36
  viewport×skin combos never photographed: `npm run shots` overnight, triage
  findings into polishing.md next morning.

## 4 · Table-status fetches: dedupe and cache

`useTableStatuses` fires N parallel fetches per consumer — and Home mounts
TWO consumers (TableCards + PlayMenu's your-turn badge), so every Home visit
is 2×N. No server route needed: module-level cache in `net/rooms.ts`
(`fetchTableStatus`: in-flight promise dedupe + ~15 s TTL). Focus-refresh
behaviour kept.

## 5 · Stretch (only if 1–4 land clean)

`GameRoom.ts` (2,368 lines) and server `index.ts` (1,906) hold the
presence/alarm/claim invariants behind July's hardening. Carve into named
modules — worth a dedicated session, not a Friday afternoon.

---

Execution: 1+4 and 2 are disjoint file sets → run as parallel workstreams;
3 follows; gates (typecheck · lint · vitest · e2e) run after each lands.
