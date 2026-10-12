# StatUs monorepo

pnpm-workspaces monorepo. Each deployable service lives in `services/*`; shared libraries go in `packages/*`.

## Layout

- `services/frontend` — React SPA (Vite + TS + Tailwind + React Router). See its own `CLAUDE.md`.
- `packages/` — shared code (empty for now). Name packages `@status/<name>` and depend on them with `"workspace:*"`.

## Commands (run from repo root)

- `pnpm install` — install all workspaces
- `pnpm dev` — run the frontend dev server
- `pnpm build` / `pnpm lint` / `pnpm typecheck` — run across every workspace (`pnpm -r`)
- Target one workspace: `pnpm --filter @status/<name> <script>`
- Add a dependency: `pnpm --filter @status/<name> add <pkg>` (never `npm install` — it creates a stray lockfile)

On this machine pnpm may not be on PATH; prefix with `corepack` (`corepack pnpm ...`) if `pnpm` isn't found.

## Conventions

- Node >= 24; pnpm version is pinned via `packageManager` in the root `package.json`.
- Every workspace package is scoped `@status/*`, `private: true`, and exposes `build`, `lint`, and `typecheck` scripts so root commands work.
- When adding a new service, put it in `services/<name>`, add a `CLAUDE.md` there for service-specific notes, and update the Layout list above.
- One lockfile (`pnpm-lock.yaml`) and one `.gitignore` at the root.
