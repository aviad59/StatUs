# @status/backend

NestJS API in TypeScript (Express adapter). Calls external APIs and runs logic driven by AI model output.

## Commands

From this directory: `pnpm dev` (watch mode), `pnpm build`, `pnpm start` (runs `dist/`), `pnpm lint` (oxlint), `pnpm typecheck`.
From the repo root: `pnpm --filter @status/backend <script>`, or `pnpm dev:backend`.

## Structure

- `src/main.ts` — bootstrap; sets the global `/api` prefix and CORS
- `src/app.module.ts` — root module; register feature modules in `imports`
- `src/<feature>/` — one folder per feature: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`
- `src/health/` — `GET /api/health` liveness check

## Conventions

- Config comes from environment variables via `@nestjs/config` (`ConfigService`), loaded from `services/backend/.env`. Document every new variable in `.env.example`; never commit `.env` or API keys.
- Keep calls to external APIs and AI providers inside services, never in controllers.
- `experimentalDecorators` and `emitDecoratorMetadata` must stay on in `tsconfig.json`; Nest's dependency injection relies on them.
- Output is CommonJS (no `"type": "module"`), which is what the Nest CLI expects.
