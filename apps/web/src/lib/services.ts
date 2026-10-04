import type { Net, Store } from '@drippa/stackprobe-core';
import { NodeNet } from '@drippa/stackprobe-core/node';
import { connectPostgres } from '@drippa/stackprobe-store-postgres';

// The one place the app picks its store and network. Tests replace this module.
let store: Store | undefined;

export function getStore(): Store {
  if (!store) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. See .env.example.');
    store = connectPostgres(url).store;
  }
  return store;
}

export function getNet(): Net {
  return new NodeNet();
}
