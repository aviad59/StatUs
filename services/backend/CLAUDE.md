# @status/backend

NestJS API in TypeScript (Express adapter). Serves the app's data from Supabase Postgres; will run the AI agents.

## Commands

From this directory: `pnpm dev` (watch mode), `pnpm build`, `pnpm start` (runs `dist/`), `pnpm lint` (oxlint), `pnpm typecheck`.
From the repo root: `pnpm --filter @status/backend <script>`, or `pnpm dev:backend`.

Database:

- `pnpm db:start` / `pnpm db:stop` — local Supabase stack in Docker (needs Docker Desktop running). Studio UI at http://127.0.0.1:55323.
- `pnpm db:generate --name <change>` — after editing `src/db/schema.ts`, generate a SQL migration into `supabase/migrations/`. For SQL drizzle can't express (extensions, functions), `pnpm exec drizzle-kit generate --custom --name <change>` creates an empty migration to fill in.
- `pnpm db:reset` — recreate the local DB from all migrations (deletes local data)
- `pnpm db:seed` — wipe all worlds and insert one demo world (refuses non-local DBs unless `SEED_ALLOW_REMOTE=1`)
- Cloud (project ref `rvudxcehbndngcoagasc`, Frankfurt `eu-central-1`; pick a region near Israel, since every query is a round trip): with the Session pooler string in `.env` as `DATABASE_URL`, apply migrations with `pnpm exec supabase db push --db-url "$DATABASE_URL"`

First-time local setup: `cp .env.example .env`, `pnpm db:start`, `pnpm db:seed`, `pnpm dev`.

AI: `pnpm ai:try` builds and runs `src/ai/try.ts`, one `generate()` and one of each `decide()` question type against the configured providers.

## Structure

- `src/main.ts` — bootstrap; sets the global `/api` prefix and CORS
- `src/app.module.ts` — root module; register feature modules in `imports`
- `src/<feature>/` — one folder per feature: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`
- `src/db/schema.ts` — Drizzle schema, the source of truth for the database. `client.ts` creates the connection; `db.module.ts` provides it globally (`@Inject(DB) db: Db`); `seed.ts` is the dev seed.
  - Social: `worlds` (also holds tick count, energy and the tick lock), `accounts` (the human + agents), `posts`, `comments`, `stories`, `conversations`, `messages`
  - Agents and story: `characters` (persona + secrets, 1:1 with an agent account), `character_memories` (text + `vector(1024)` embedding, HNSW cosine index; null until embedded), `relationships` (directed score -100..100 from a character to another character or the player), `story_beats` (ordered plot points, `pending`/`active`/`done`), `story_flags` (per-world JSON key/value)
- `src/ai/` — `AiService` (global via `AiModule`): `generate(prompt, { system })` for Hebrew text and `decide(state, question)` for typed decisions. Questions mirror Jev's primitives: `choice` (returns one of its option keys), `score` (0..1 across ordered levels), `yesNo` (probability of yes). Providers are in `src/ai/providers/`, selected by `AI_TEXT_PROVIDER` (ollama | anthropic) and `AI_DECISION_PROVIDER` (ollama | anthropic | jev). `generateImage(prompt)` returns a JPEG from `AI_IMAGE_PROVIDER` (none | cloudflare: Workers AI FLUX.1 schnell), or null for none. Pass `hebrew: false` to `generate()` for text users never see, like English image prompts.
- `src/accounts/` — `GET /api/me`, plus `CurrentUserService` (who is making the request) and `toUser` (DB row → API `User`)
- `src/storage/` — `StorageService` (global): uploads to the public Supabase Storage bucket `media` (created on startup) under `<worldId>/<kind>/<uuid>.<ext>`, returns the public URL. Needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; without them uploads fail and the rest works.
- `src/feed/` — `GET /api/feed` (posts with comments), `GET /api/me/posts` (the user's own posts), `POST /api/posts` (multipart `image` + `caption`: the user shares a photo; it's uploaded, then described in the background by `generate()` with the image attached, into `posts.image_description`), `GET /api/stories` (grouped by author), `POST /api/posts/:id/comments` (the user comments), `PUT /api/posts/:id/like` `{ liked }` (each world has one human, so the like is a `posts.player_liked` flag added on top of the displayed `like_count`)
- `src/conversations/` — `GET /api/conversations`, `GET /api/conversations/:id`, `POST /api/conversations/:id/messages` (the user sends a DM; one energy point buys `DM_MESSAGES_PER_ENERGY` messages, counted down in `worlds.dm_credits`; 409 `NO_ENERGY`), `POST /api/conversations/:id/reply` (the agent answers the last DM right away, via `AgentService.replyInDm`; `{ message: null }` if there's nothing to answer or a reply is already being written)
- `src/world/` — the simulation. `GET /api/world` (tick count + energy), `POST /api/world/tick` (advance one step; 409 `NO_ENERGY` / `TICK_IN_PROGRESS`).
  - `world.service.ts` — runs a tick: takes a per-world lock (`worlds.ticking_since`), then (1) every character plans in parallel, (2) plans run one at a time in random order: replies the player is waiting for (an unanswered DM, or a player comment on the character's own post) always run first and don't count toward `TICK_MAX_ACTIONS`; spontaneous actions fill the rest. Each character acts at most once per tick. Then it checks whether the active story beat is done and spends 1 energy. Energy is only spent if the tick succeeds; if every turn fails (AI provider down), it returns 503.
  - `agent.service.ts` — `plan()` builds the decision state (persona, secrets, memories, relationships, active beat, flags, recent feed, DMs with the player) and `decide()`s post (the option says how many posts others made since the character's last one: time between ticks depends on the player's energy, so posting follows feed activity, not hours) / comment / comment_on_player_post (offered while the player has a post this character hasn't commented on; it also adds a like) / message_player / nothing (no message_player when the last DM is already theirs: no double-texting); `act()` `generate()`s the text and saves it plus a memory.
  - `energy.ts` — pure regeneration math (`ENERGY_MAX`, `ENERGY_REGEN_MINUTES`); energy is stored lazily as value + timestamp on `worlds`.
- `src/common/` — `ZodBodyPipe` (request body validation) and shared zod schemas
- `src/health/` — `GET /api/health` liveness check
- `supabase/` — Supabase CLI project: `config.toml` (local stack) and `migrations/` (generated by drizzle-kit; don't edit by hand)

## Conventions

- Config comes from environment variables via `@nestjs/config` (`ConfigService`), loaded from `services/backend/.env`. Document every new variable in `.env.example`; never commit `.env` or API keys.
- Keep calls to external APIs and AI providers inside services, never in controllers.
- All AI calls go through `AiService`, never a provider directly. `generate()` prepends `HEBREW_RULE` to the system prompt. Keep decision questions and option keys in English (they're code), and Hebrew in what the user sees.
- Generation prompts (system prompt, task instructions, `HEBREW_RULE`) are written in Hebrew, using the infinitive ("לכתוב") so they fit any gender; English instructions made the output read like a translation. Decision questions stay in English.
- Gender: `accounts.gender` (female | male | null). Prompts tell each character to write about themselves in their own gender (`selfGender`) and how to address others (`addressAs`); null (the player, for now) means address them neutrally, e.g. in the plural. Never put slashed forms ("את/ה") in seed data or prompts: models copy them.
- Personas, secrets, memories and beat descriptions are stored in Hebrew. Personas are written as instructions to the character in the second person ("את מאיה...").
- The Jev provider was written from the docs and hasn't been run (no API key yet); verify it, especially the `score` range, before relying on it.
- `EMBEDDING_DIMENSIONS` (1024) must match the embedding model; changing it requires a migration.
- Agents act during ticks, with one exception: a DM reply, which the frontend requests right after the user sends a message. User comments are saved immediately and answered on the next tick (as are DMs whose instant reply failed).
- Agent post photos: the character writes an English image prompt from its caption (`PHOTO_TASK`; people from behind or only hands, since faces aren't consistent yet), the image provider draws it (one retry), and it's uploaded to Storage. The prompt is saved as `image_description`, so other agents know what's in the photo. This runs in the background after the caption is written (`publish`), so a tick doesn't wait for it: the tick event carries the post's pre-generated ID, and the row is inserted only once the photo is ready (a few seconds later; other agents see it from the next tick). If generation fails twice the post is dropped rather than shown with an unrelated photo. With `AI_IMAGE_PROVIDER=none`, posts get a random picsum photo instead. At most `MAX_POSTS_PER_TICK` (2) posts per tick, leaving room for comments. Seed posts and stories still use picsum. Memories are saved without embeddings.
- Agents never see raw images: the user's photos are described once at upload (`posts.image_description`), and prompts and decision state include that text (`postContext`, `photo` in the feed state). `generate()` accepts `images` (base64) for this; both the Anthropic and Ollama (vision models like gemma4) providers support it.
- When testing with curl on Windows, send Hebrew bodies from a UTF-8 file (`--data-binary @body.json`); inline Hebrew arguments arrive as `????`.
- **Scope every query to the current user's world** (`worldId`). Worlds are private; one user must never see another world's rows.
- Every table enables RLS with no policies (`.enableRLS()` in the schema), which keeps Supabase's public REST API closed. The backend connects as `postgres` and bypasses RLS. Keep this on for new tables.
- Responses use the types from `@status/shared` (`import type`). Convert `Date` to ISO strings when mapping rows.
- `CurrentUserService` is a stand-in until Supabase Auth: it returns the oldest human account, cached for 60 s (each DB round trip to the cloud project costs ~300 ms).
- Local Supabase ports are 553xx, not the default 543xx, because Windows reserves 54240–54339 on this machine.
- `experimentalDecorators` and `emitDecoratorMetadata` must stay on in `tsconfig.json`; Nest's dependency injection relies on them.
- Output is CommonJS (no `"type": "module"`), which is what the Nest CLI expects.
