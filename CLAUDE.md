# CLAUDE.md

Read `STATUS.md` first — it is the checkpoint ledger of what is done and
verified, so don't re-audit shipped areas. Completed plans and the retired
polishing backlog live in `docs/archive/`.

Hard rules:

- UX simplicity first — refinements and cuts beat additions.
- The felt table changes surgically, in small shot-verified steps (a full
  rewrite was tried and reverted).
- Violet backgrounds pair with `text-(--color-ap-ink)`, never white
  (`apps/web/test/violetInk.test.ts` enforces it).
- Copy lives in colocated `T` tables (en / fr-QC tutoiement); check
  e2e-pinned strings before rewording.
- Comments encode invariants — move them WITH their code, never drop them.
- All animation timing goes through `paced()`; reduced motion = instant.
- No PR gate: land on `main`, CI's e2e + deploy-verify gate the prod deploy.
