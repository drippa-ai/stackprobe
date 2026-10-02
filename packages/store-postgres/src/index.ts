import postgres from 'postgres';
import { fromPostgresJs } from './sql.ts';
import { PostgresStore } from './store.ts';

export type { Sql } from './sql.ts';
export { fromPostgresJs } from './sql.ts';
export { PostgresStore } from './store.ts';

// Connects to a Postgres URL. Works with Supabase's transaction pooler, which doesn't
// support prepared statements, and with serverless functions (few connections each).
export function connectPostgres(url: string): { store: PostgresStore; close: () => Promise<void> } {
  const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  return { store: new PostgresStore(fromPostgresJs(client)), close: () => client.end() };
}
