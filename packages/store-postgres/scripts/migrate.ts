// Applies database migrations: pnpm db:migrate
// Reads DATABASE_URL from the environment or from .env.local at the repo root.
import postgres from 'postgres';
import { migrate } from '../src/migrate.ts';
import { fromPostgresJs } from '../src/sql.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Add it to .env.local at the repo root.');
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  const applied = await migrate(fromPostgresJs(client));
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'already up to date');
} finally {
  await client.end();
}
