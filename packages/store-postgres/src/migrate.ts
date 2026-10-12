import { readdirSync, readFileSync } from 'node:fs';
import type { Sql } from './sql.ts';

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);

// The migrations in migrations/ not yet applied to this database, in the order they'd run.
export async function pendingMigrations(sql: Sql): Promise<string[]> {
  await ensureMigrationsTable(sql);
  const applied = new Set(
    (await sql.query<{ name: string }>('select name from stackprobe.migrations')).map(
      (row) => row.name,
    ),
  );
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql') && !applied.has(file))
    .sort();
}

// Applies migrations/*.sql in name order, each in its own transaction, skipping those already
// applied. Returns the names it applied.
export async function migrate(sql: Sql): Promise<string[]> {
  const pending = await pendingMigrations(sql);
  for (const name of pending) {
    const text = readFileSync(new URL(name, MIGRATIONS_DIR), 'utf8');
    await sql.transaction(async (tx) => {
      await tx.exec(text);
      await tx.query('insert into stackprobe.migrations (name) values ($1)', [name]);
    });
  }
  return pending;
}

async function ensureMigrationsTable(sql: Sql): Promise<void> {
  await sql.exec(`
    create schema if not exists stackprobe;
    create table if not exists stackprobe.migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
    alter table stackprobe.migrations enable row level security;
  `);
}
