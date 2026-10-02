import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Core's main entry must run anywhere: no Node built-ins (those live in src/node/) and no
// platform SDKs such as Vercel, Workflow or Supabase.
test('core imports nothing platform-specific', () => {
  const src = new URL('./', import.meta.url);
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
    (file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('node/'),
  );
  const offending = files.flatMap((file) =>
    [...readFileSync(new URL(file, src), 'utf8').matchAll(/from '([^']+)'/g)]
      .map((match) => match[1] ?? '')
      .filter((name) => /^(node:|@vercel\/|workflow|@supabase\/)/.test(name))
      .map((name) => `${file}: ${name}`),
  );
  expect(offending).toEqual([]);
});
