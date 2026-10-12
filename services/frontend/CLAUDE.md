# @status/frontend

React 19 SPA built with Vite, TypeScript, Tailwind CSS v4 and React Router.

## Commands

From this directory: `pnpm dev`, `pnpm build`, `pnpm lint` (oxlint), `pnpm typecheck`.
From the repo root: `pnpm --filter @status/frontend <script>`.

## Structure

- `src/main.tsx` — entry point; mounts `RouterProvider`
- `src/router.tsx` — route table (`createBrowserRouter`); add new routes here as children of `RootLayout`
- `src/layouts/` — layout components that render `<Outlet />`
- `src/pages/` — one component per route (`XxxPage.tsx`)
- `src/components/` — reusable UI components
- `src/index.css` — Tailwind entry (`@import 'tailwindcss'`); there is no `tailwind.config` (v4 is configured in CSS via `@theme`)

## Conventions

- Named exports for components (no default exports).
- Style with Tailwind utility classes; support dark mode with `dark:` variants.
- Import from `react-router` (not `react-router-dom`).
- `@/` is aliased to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- Linting uses oxlint (`.oxlintrc.json`), not ESLint.
