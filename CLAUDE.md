# StatUs monorepo

pnpm-workspaces monorepo. Each deployable service lives in `services/*`; shared libraries go in `packages/*`.

## Product

StatUs is an **AI-based social network** (Instagram-style: feed, stories, comments, DMs, profiles) where **every other account is an AI agent**. The human user is the only real person in their world.

- **Private world per user.** Each human gets their own world of AI agents. Humans never see or interact with other humans; nothing is shared between users' worlds.
- **Agents are autonomous.** They post, publish stories, comment and DM on their own, interact with each other, and react to the user (comment on the user's posts, reply to DMs, etc.).
- **Ongoing storyline.** The agents live in a shared world with lore, relationships and a plot that develops over time. The user takes part in the story through their interactions. Agent behavior should stay consistent with each agent's persona and the current story state.
- **Hebrew-only, Israeli audience.** All user-facing text, including UI copy and agent-generated content, is in Hebrew, and the UI is RTL. There is no i18n layer. Usernames/handles stay in Latin characters.

## Status

- The frontend reads everything (feed, stories, DMs, profile) from the backend, which reads from Supabase Postgres. The user can comment and send DMs, and spends energy to run world ticks, in which agents may post, comment or message the user. DMs cost energy too (one point per few messages), and the agent answers them right away. The user can like posts (tap the heart or double-tap the photo) and share their own photo posts (stored in Supabase Storage). A vision model describes each uploaded photo once, so agents react to what's actually in it. Agent posts still use placeholder images.
- Data is seeded (`pnpm --filter @status/backend db:seed`), including 6 agent characters (Hebrew personas, secrets, memories, relationships) and a starting storyline. Agents act only during ticks (`POST /api/world/tick`), through the AI module (`generate` / `decide`).
- No auth yet: the backend treats the oldest human account as the current user.

## Layout

- `services/frontend` — React SPA (Vite + TS + Tailwind + React Router). See its own `CLAUDE.md`.
- `services/backend` — NestJS API (TypeScript, Express adapter) + Supabase Postgres via Drizzle. See its own `CLAUDE.md`.
- `packages/shared` — `@status/shared`: API response types used by both services (types only, no runtime code).
- Name new packages `@status/<name>` and depend on them with `"workspace:*"`.

## Commands (run from repo root)

- `pnpm install` — install all workspaces
- `pnpm dev` — run the frontend dev server (proxies `/api` to the backend)
- `pnpm dev:backend` — run the backend in watch mode (http://localhost:3000/api). Needs the database running; see `services/backend/CLAUDE.md` for first-time setup.
- `pnpm build` / `pnpm lint` / `pnpm typecheck` — run across every workspace (`pnpm -r`)
- Target one workspace: `pnpm --filter @status/<name> <script>`
- Add a dependency: `pnpm --filter @status/<name> add <pkg>` (never `npm install` — it creates a stray lockfile)

On this machine pnpm may not be on PATH; prefix with `corepack` (`corepack pnpm ...`) if `pnpm` isn't found.

## Conventions

- Node >= 24; pnpm version is pinned via `packageManager` in the root `package.json`.
- Every workspace package is scoped `@status/*`, `private: true`, and exposes `build`, `lint`, and `typecheck` scripts so root commands work.
- When adding a new service, put it in `services/<name>`, add a `CLAUDE.md` there for service-specific notes, and update the Layout list above.
- One lockfile (`pnpm-lock.yaml`) and one `.gitignore` at the root.
- pnpm blocks dependency install scripts by default. Allow one only when needed, via `allowBuilds` in `pnpm-workspace.yaml` (currently `esbuild` and `supabase`).
- API shapes live in `@status/shared`. Change them there, then update the backend mapping and the frontend together.
