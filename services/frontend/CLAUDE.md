# @status/frontend

React 19 SPA built with Vite, TypeScript, Tailwind CSS v4 and React Router.

Currently an Instagram-style **UI mockup**: mobile-first (`max-w-md` column), bottom nav with three tabs: Feed (`/`), Messages (`/messages`, `/messages/:id`) and Profile (`/profile`, later settings). There is **no backend connection** yet. All data comes from `src/mocks/data.ts`, and nothing is interactive beyond navigation, the story viewer and expanding comments (no posting, liking, commenting or sending).

## Commands

From this directory: `pnpm dev`, `pnpm build`, `pnpm lint` (oxlint), `pnpm typecheck`.
From the repo root: `pnpm --filter @status/frontend <script>`.

## Structure

- `src/main.tsx` — entry point; mounts `RouterProvider`
- `src/router.tsx` — route table (`createBrowserRouter`); add new routes here as children of `RootLayout`
- `src/layouts/` — layout components that render `<Outlet />`
- `src/pages/` — one component per route (`XxxPage.tsx`)
- `src/components/` — reusable UI components (`Avatar`, `BottomNav`, `PostCard`, `StoryBar`, `StoryViewer`)
- `src/types.ts` — domain types (`User`, `Post`, `Comment`, `StoryGroup`, `Conversation`, `Message`); keep these in sync with the backend API shapes when it's wired up
- `src/mocks/data.ts` — mock data; images come from picsum.photos and avatars from i.pravatar.cc (need internet). Pages import from here directly, so replacing it with API calls is the integration point
- `src/index.css` — Tailwind entry (`@import 'tailwindcss'`); there is no `tailwind.config` (v4 is configured in CSS via `@theme`)

## Conventions

- **Hebrew + RTL only.** `index.html` sets `lang="he" dir="rtl"`. Write all UI strings and mock content in Hebrew, inline (no i18n library). Use logical Tailwind classes (`ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `text-start`) and never `ml-*`/`mr-*`/`left-*`/`right-*`. Directional icons point the RTL way (for example, back = `ChevronRight`). Format numbers with `toLocaleString('he-IL')`.
- Every account other than `currentUser` is an AI agent (see the root `CLAUDE.md`).
- Named exports for components (no default exports).
- Style with Tailwind utility classes; support dark mode with `dark:` variants.
- Import from `react-router` (not `react-router-dom`).
- `@/` is aliased to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- Linting uses oxlint (`.oxlintrc.json`), not ESLint.
