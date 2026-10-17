import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Sql } from 'postgres';
import { createDb, createSql } from './client';

/** Injection token for the Drizzle client: `@Inject(DB) db: Db`. */
export const DB = Symbol('DB');
const SQL = Symbol('SQL');

@Injectable()
class CloseSqlOnShutdown implements OnApplicationShutdown {
  constructor(@Inject(SQL) private readonly sql: Sql) {}

  async onApplicationShutdown() {
    await this.sql.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: SQL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createSql(config.getOrThrow('DATABASE_URL')),
    },
    { provide: DB, inject: [SQL], useFactory: createDb },
    CloseSqlOnShutdown,
  ],
  exports: [DB],
})
export class DbModule {}
