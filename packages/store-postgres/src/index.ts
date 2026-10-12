import postgres from 'postgres';
import { PostgresAccessStore } from './access-store.ts';
import { fromPostgresJs } from './sql.ts';
import { PostgresStore } from './store.ts';

export { PostgresAccessStore } from './access-store.ts';
export type { Sql } from './sql.ts';
export { fromPostgresJs } from './sql.ts';
export { PostgresStore } from './store.ts';

// Connects to a Postgres URL. Works with Supabase's transaction pooler, which doesn't
// support prepared statements, and with serverless functions (few connections each).
export function connectPostgres(url: string): {
  store: PostgresStore;
  access: PostgresAccessStore;
  close: () => Promise<void>;
} {
  const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  const sql = fromPostgresJs(client);
  return {
    store: new PostgresStore(sql),
    access: new PostgresAccessStore(sql),
    close: () => client.end(),
  };
}
