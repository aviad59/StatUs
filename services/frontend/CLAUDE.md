# @status/frontend

React 19 SPA built with Vite, TypeScript, Tailwind CSS v4 and React Router.

Instagram-style app: mobile-first (`max-w-md` column), bottom nav: Feed (`/`), New post (`/new`: pick a photo, which `src/image.ts` resizes to 1080 px JPEG on the device, add a caption, share; `POST /api/posts` as multipart), Messages (`/messages`, `/messages/:id`) and Profile (`/profile`: your posts in a three-column grid). A new user first lands on `/welcome` (`RootLayout` redirects there while `gender` is null) and picks "אתה" or "את": how the agents address them in Hebrew. It's chosen once (`chooseGenderAction`, `PATCH /api/me`), since the story is written in that gender from then on. All data comes from the backend API. The user can comment on posts, send DMs, and move the world forward by pulling the feed down (pull-to-refresh, touch or mouse drag), which runs one tick: it costs one energy point and lets the agents act. With no energy, the pull only reloads the feed. Agent posts and stories from a tick finish in the background (their photo is drawn after the tick), so `FeedPage` reloads the feed every few seconds until they appear, and `WorldBar` shows them as "מעלה פוסט..." / "מעלה סטורי..." meanwhile. `StoryViewer` shows a story's `text` over the photo, like a text sticker, and has a reply box (pauses the story while typing): the reply is a DM (`storyReplyAction`) and opens that chat, where the message shows a thumbnail of the story. Posts can be text-only (`imageUrl` null): `PostCard` shows the text in place of the photo, the profile grid as a text square, and `/new` lets you share without picking a photo. DMs also cost energy (one point per few messages, set by the backend), and the agent answers right away: in `ConversationPage`, a moment after you send they come online (green dot, "מחובר"), then a typing bubble shows until the reply arrives (`replyAction` waits at least 3 s); 15–45 s after answering they go offline again ("פעילות לפני..."). Opening a conversation marks it read (`readAction`); unread conversations get an orange dot in the list, and the messages icon in `BottomNav` a red count (`useUnreadCount`, from the root loader). Posts can be liked (heart, or double-tap the photo; optimistic via the fetcher's form data), and the comment icon opens `CommentsSheet`, a bottom sheet with all comments. 

`pnpm dev` needs the backend running (`pnpm dev:backend` from the root); Vite proxies `/api` to http://localhost:3000. If the backend is down, the root error page shows.

## Commands

From this directory: `pnpm dev`, `pnpm build`, `pnpm lint` (oxlint), `pnpm typecheck`.
From the repo root: `pnpm --filter @status/frontend <script>`.

## Structure

- `src/main.tsx` — entry point; mounts `RouterProvider`
- `src/router.tsx` — route table (`createBrowserRouter`); add new routes here as children of `RootLayout`, with their loader
- `src/loaders.ts` — route loaders that fetch from the API. Pages read data with `useLoaderData<typeof xxxLoader>()`; the root route (`id: 'root'`) loads the current user, read anywhere with `useCurrentUser()`, and the unread DM count (`useUnreadCount()`); it reloads after profile changes and DM-related actions only (`shouldRevalidate`). API responses are cached in memory for 60 s (`cached()`) so tab switches are instant, and `RootLayout` prefetches the feed and DM list on startup. Every action is wrapped in `fresh()` in `router.tsx`, which clears the cache before React Router reloads; call `clearCache()` before any other manual revalidation
- `src/actions.ts` — route actions for writes (`tickAction`, `commentAction`, `sendMessageAction`, `replyAction`). They return `ActionResult<T>` (`{ ok, data }` or `{ ok: false, error }` with a Hebrew message) instead of throwing, and React Router reloads the loaders afterwards. Submit with `useFetcher()`; tick, comment and DM reply are action-only routes under `/actions/*`.
- `src/api.ts` — `api<T>(path)` / `post<T>(path, body)` fetch wrappers for `/api/*`; throw `ApiError` (with `status` and the body's `code`) on non-2xx
- `src/format.ts` — Hebrew time formatting for API timestamps (`timeAgo`, `timeUntil`, `clockTime`)
- `src/layouts/` — layout components that render `<Outlet />`
- `src/pages/` — one component per route (`XxxPage.tsx`); `ErrorPage` is the root `errorElement`
- `src/components/` — reusable UI components (`Avatar`, `BottomNav`, `PostCard`, `StoryBar`, `StoryViewer`, `PullToRefresh` (Instagram-style pull gesture; `overscroll-behavior: contain` in `index.css` disables the browser's own pull-to-reload and swipe back/forward), `WorldBar` (energy meter + what happened in the last tick), `DmCounter` (DMs left before the next one costs energy, above the chat input), `TextForm` (one-line input that submits `text` to an action))
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
