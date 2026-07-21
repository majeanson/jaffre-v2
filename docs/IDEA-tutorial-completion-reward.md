# Idea: unlock a cosmetic for completing the how-to-play tutorial

Status: **idea / parked for a proper pass** (2026-07-21). The progression UI
(table pip + Help checklist) and replay ship first; the *reward* is deferred
because it doesn't fit the current unlock model without a small architectural
decision. This doc captures the intent and the wrinkle so the future pass
starts informed.

## Intent

Give the first-play tutorial a payoff: finishing all seven concepts unlocks a
card skin (or a table theme) — with a celebratory "🎉 Unlocked: …" toast and
the item showing freshly lit in the `#collection` gallery. Turns "how to play"
into a tiny reward loop instead of a set of tips that appear and vanish.

## Why it's not a drop-in (the wrinkle)

Cosmetic ownership today is **derived live from server stats**, not stored as a
granted set:

- Catalog: `apps/web/src/cosmetics.ts` (`CARD_SKINS`) and `apps/web/src/theme.ts`
  (`THEMES`). Each unlockable item carries `unlock: (s: Stats) => boolean` and a
  `requirement(s, lang)` for the gallery's "how to unlock" text.
- `owned(catalog, stats, devAll)` (`cosmetics.ts:33-43`) computes the owned Set
  as `catalog.filter(c => devAll || c.free || c.unlock?.(stats))`.
- `Stats` comes from `GET /api/stats` (`net/history.ts:46-57,100-105`):
  games, wins, winRate, netPoints, bids, sansAtout, streak, nemesis, etc.
- **There is no `grant(id)` function and no persisted "unlocked ids" set.**

Tutorial completion, by contrast, is a **client-side localStorage flag**
(`table/tutorialPref.ts`, key `jaffre:practiceTutorial`). So "completed the
tutorial" is not expressible as a server `Stats` predicate today.

Also: `DEV_UNLOCK_ALL = true` (`cosmetics.ts:14`) forces everything owned in
the gallery, so any reward is invisible in dev until that's off (or the gallery
previews with `owned(..., false)`). The reconcile/toast path already uses real
ownership (`cosmeticsBoot.ts:37-46`), so it's honest even with the flag on.

## Options for the proper pass

1. **Add a "granted ids" persistence layer** (cleanest for client-driven
   rewards). A small store of explicitly-granted cosmetic ids, OR-ed into the
   `owned()` filter at `cosmetics.ts:40`. Grant the reward id on tutorial
   completion. Decide local-only vs. synced to the account profile
   (`net/auth.ts` `Profile` already carries `cardSkin`/`theme`) — local-only is
   simplest but doesn't follow the player across devices.
2. **Make it a stat-derived unlock** — e.g. a server-side "completedTutorial"
   flag added to `Stats`, with a new item whose `unlock` reads it. Keeps the
   single-source-of-truth model but needs a server change and a way to report
   completion to the server (practice is currently local-only).
3. **Reuse the existing "freshly unlocked" toast**: `reconcileCosmetics()`
   (`cosmeticsBoot.ts:32-64`) diffs real ownership against the
   `jaffre-cosmetics-seen` localStorage set and returns newly-owned labels;
   `App.tsx:78-106` pops a `Toast` for them (on menu screens, skipping
   `#practice`). Whichever grant mechanism we pick, route the reward through
   this so the celebration is consistent with every other unlock.

## Reward pick (TBD)

Choose one currently-locked item to feel like a "beginner's badge." Candidates
from the catalog: a card skin (`og-deck`, `pixel-parlor`, `newsprint`-adjacent)
or a theme. Should read as friendly/starter, not one of the grind-gated prestige
items (`gilded`, `prismatic`, `bloodmoon`). Confirm with Marc before wiring.

## Open questions

- Local-only grant, or synced to the account so it survives a device switch?
- Does replaying the tutorial re-grant / re-toast? (Should be idempotent — grant
  once, `jaffre-cosmetics-seen` already de-dupes the toast.)
- Flip `DEV_UNLOCK_ALL` off as part of this pass, or keep dev-open and verify the
  reward via the gallery's real-ownership preview?

## Anchors

- Tutorial progress + steps: `table/tutorialPref.ts` (`TUTORIAL_STEPS`,
  `markTutorialStep`, `hasSeenTutorial`, `resetTutorial`), `table/TutorialCoach.tsx`.
- Cosmetics: `cosmetics.ts`, `theme.ts`, `cosmeticsBoot.ts`,
  `screens/Collection.tsx`, `packages/ui/src/components/CosmeticPicker.tsx`.
- Related memory: [[cosmetics-system]] (DEV_UNLOCK_ALL still ON).
