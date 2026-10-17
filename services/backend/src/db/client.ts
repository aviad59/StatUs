import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

// prepare: false is required by Supabase's transaction-mode pooler (port 6543).
export const createSql = (url: string) => postgres(url, { prepare: false });

export const createDb = (sql: Sql) => drizzle(sql, { schema });

export type Db = ReturnType<typeof createDb>;
