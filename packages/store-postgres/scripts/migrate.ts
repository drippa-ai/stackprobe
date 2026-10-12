// Applies database migrations: pnpm db:migrate [--status] [--yes]
// Reads DATABASE_URL from the environment or from .env.local at the repo root. Shows which
// database that is and what it would apply, and asks before changing anything.
//   --status  show the target and pending migrations, change nothing
//   --yes     apply without asking (scripts, CI)
import { createInterface } from 'node:readline/promises';
import postgres from 'postgres';
import { migrate, pendingMigrations } from '../src/migrate.ts';
import { fromPostgresJs } from '../src/sql.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Add it to .env.local at the repo root.');
  process.exit(1);
}
const args = new Set(process.argv.slice(2));

console.log(`Database: ${describeTarget(url)}`);
const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  const sql = fromPostgresJs(client);
  const pending = await pendingMigrations(sql);
  if (pending.length === 0) {
    console.log('Already up to date.');
  } else {
    console.log(`Pending: ${pending.join(', ')}`);
    if (!args.has('--status') && (await confirmed())) {
      console.log(`Applied: ${(await migrate(sql)).join(', ')}`);
    }
  }
} finally {
  await client.end();
}

// Host, database and user, never the password. Supabase pooler users are postgres.<project ref>.
function describeTarget(databaseUrl: string): string {
  const u = new URL(databaseUrl);
  const project = u.username.match(/^postgres\.([a-z0-9]+)$/)?.[1];
  return `${u.host}${u.pathname} as ${u.username}${project ? ` (Supabase project ${project})` : ''}`;
}

async function confirmed(): Promise<boolean> {
  if (args.has('--yes')) return true;
  if (!process.stdin.isTTY) {
    console.log('Not applied: no terminal to ask in. Run again with --yes to apply.');
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Apply these to this database? [y/N] ');
  rl.close();
  if (answer.trim().toLowerCase() === 'y') return true;
  console.log('Not applied.');
  return false;
}
