import type postgres from 'postgres';

// The little this package needs from a Postgres client. Adapters exist for postgres.js
// (production) and PGlite (tests); another client takes a few lines.
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  // Several statements at once, without parameters. For migrations.
  exec(text: string): Promise<void>;
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
}

export function fromPostgresJs(client: postgres.Sql | postgres.TransactionSql): Sql {
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await client.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[],
    exec: async (text) => {
      await client.unsafe(text);
    },
    transaction: (fn) => {
      if (!('begin' in client)) return fn(fromPostgresJs(client));
      return client.begin((tx) => fn(fromPostgresJs(tx))) as Promise<never>;
    },
  };
}
