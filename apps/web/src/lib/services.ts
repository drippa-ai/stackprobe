import { sandboxBrowserFromEnv } from '@drippa/stackprobe-browser-vercel-sandbox';
import type { Browser, Decider, Net, Store } from '@drippa/stackprobe-core';
import { NodeNet } from '@drippa/stackprobe-core/node';
import { deciderFromEnv } from '@drippa/stackprobe-decider-typesafe';
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

// Jev when TYPESAFE_API_KEY is set; without it, classification runs on rules only.
export function getDecider(): Decider | undefined {
  return deciderFromEnv();
}

// On Vercel: a Vercel Sandbox, once STACKPROBE_SANDBOX_SNAPSHOT is set. Self-hosted: local
// Playwright when Chromium is installed. Otherwise none, and scans skip the browser layer.
export async function getBrowser(): Promise<Browser | undefined> {
  const sandbox = sandboxBrowserFromEnv();
  if (sandbox || process.env.VERCEL) return sandbox;
  const { playwrightIfInstalled } = await import('@drippa/stackprobe-browser-playwright');
  return playwrightIfInstalled();
}

export function getNet(): Net {
  return new NodeNet();
}
