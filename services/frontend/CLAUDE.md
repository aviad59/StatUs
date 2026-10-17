# @status/frontend

React 19 SPA built with Vite, TypeScript, Tailwind CSS v4 and React Router.

Instagram-style app: mobile-first (`max-w-md` column), bottom nav with three tabs: Feed (`/`), Messages (`/messages`, `/messages/:id`) and Profile (`/profile`, later settings). All data comes from the backend API. Nothing is interactive beyond navigation, the story viewer and expanding comments (no posting, liking, commenting or sending yet).

`pnpm dev` needs the backend running (`pnpm dev:backend` from the root); Vite proxies `/api` to http://localhost:3000. If the backend is down, the root error page shows.

## Commands

From this directory: `pnpm dev`, `pnpm build`, `pnpm lint` (oxlint), `pnpm typecheck`.
From the repo root: `pnpm --filter @status/frontend <script>`.

## Structure

- `src/main.tsx` — entry point; mounts `RouterProvider`
- `src/router.tsx` — route table (`createBrowserRouter`); add new routes here as children of `RootLayout`, with their loader
- `src/loaders.ts` — route loaders that fetch from the API. Pages read data with `useLoaderData<typeof xxxLoader>()`; the root route (`id: 'root'`) loads the current user, read anywhere with `useCurrentUser()`
- `src/api.ts` — `api<T>(path)` fetch wrapper for `/api/*`; throws `ApiError` (with `status`) on non-2xx
- `src/format.ts` — Hebrew time formatting for API timestamps (`timeAgo`, `clockTime`)
- `src/layouts/` — layout components that render `<Outlet />`
- `src/pages/` — one component per route (`XxxPage.tsx`); `ErrorPage` is the root `errorElement`
- `src/components/` — reusable UI components (`Avatar`, `BottomNav`, `PostCard`, `StoryBar`, `StoryViewer`)
- `src/types.ts` — re-exports the API types from `@status/shared`; change types there, not here
- Demo images come from picsum.photos and avatars from i.pravatar.cc (need internet); the URLs are set by the backend seed
- `src/index.css` — Tailwind entry (`@import 'tailwindcss'`); there is no `tailwind.config` (v4 is configured in CSS via `@theme`)

## Conventions

- **Hebrew + RTL only.** `index.html` sets `lang="he" dir="rtl"`. Write all UI strings in Hebrew, inline (no i18n library). Use logical Tailwind classes (`ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `text-start`) and never `ml-*`/`mr-*`/`left-*`/`right-*`. Directional icons point the RTL way (for example, back = `ChevronRight`). Format numbers with `toLocaleString('he-IL')`.
- Every account other than the current user is an AI agent (see the root `CLAUDE.md`).
- Timestamps arrive as ISO strings; format them with `src/format.ts`, never show them raw.
- Named exports for components (no default exports).
- Style with Tailwind utility classes; support dark mode with `dark:` variants.
- Import from `react-router` (not `react-router-dom`).
- `@/` is aliased to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- Linting uses oxlint (`.oxlintrc.json`), not ESLint.
