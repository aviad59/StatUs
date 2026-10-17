import { defineConfig } from 'drizzle-kit';

// Migrations are generated into supabase/migrations with Supabase's file naming,
// so the Supabase CLI applies them (`supabase db reset` locally, `supabase db push` to the cloud).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './supabase/migrations',
  migrations: { prefix: 'supabase' },
});
