# Jaffre

Online 4-player trick-taking card game (2v2, 32 cards, bidding with sans-atout, first team to 41).
Ground-up rehaul of [majeanson/Jaffre](https://github.com/majeanson/Jaffre) with a fully tested pure engine.

## Architecture

| Package             | Role                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `packages/engine`   | Pure TS game rules. Zero deps, seeded RNG, Result-style reducer. **100% coverage enforced.** |
| `packages/protocol` | Zod-validated WebSocket message + redacted view types (M5).                                  |
| `packages/bots`     | Bot policies over redacted seat views (M2).                                                  |
| `packages/ui`       | The devkit: design tokens, reusable components, motion primitives, Ladle gallery (M4).       |
| `apps/server`       | Cloudflare Worker + one `GameRoom` Durable Object per room (WebSocket hibernation).          |
| `apps/web`          | React + Vite SPA, served from the Worker's assets binding.                                   |

State is a pure fold over `(seed, actions)` — replays are bit-identical, which powers reconnect,
spectators, golden fixtures, and the replay viewer.

## Commands

```
npm install
npm test              # all workspaces; engine enforces 100% coverage
npm run typecheck
npm run lint
npm run build
npm run dev           # wrangler dev (serves built web app + worker)
```

## Deploy

GitHub Actions deploys `main` to Cloudflare (`jaffre.marcportal.com`) using
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repo secrets.
