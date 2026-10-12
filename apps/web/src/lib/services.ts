import { sandboxBrowserFromEnv } from '@drippa/stackprobe-browser-vercel-sandbox';
import type { AccessStore, Browser, Decider, Net, Store } from '@drippa/stackprobe-core';
import { NodeNet } from '@drippa/stackprobe-core/node';
import { deciderFromEnv } from '@drippa/stackprobe-decider-typesafe';
import { connectPostgres } from '@drippa/stackprobe-store-postgres';
import { checkBotId } from 'botid/server';
import type { BotCheck } from './start-scan.ts';

// The one place the app picks its stores and network. Tests replace this module.
let database: ReturnType<typeof connectPostgres> | undefined;

function connect(): ReturnType<typeof connectPostgres> {
  if (!database) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. See .env.example.');
    database = connectPostgres(url);
  }
  return database;
}

export function getStore(): Store {
  return connect().store;
}

// API keys and the daily allowance, in the same database.
export function getAccess(): AccessStore {
  return connect().access;
}

// The secret IPs are hashed with, so visitors can be counted without keeping their address.
// Required in production; a fixed value stands in during development.
export function getIpHashSecret(): string {
  const secret = process.env.STACKPROBE_IP_HASH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('STACKPROBE_IP_HASH_SECRET is not set. See .env.example.');
  }
  return 'development-only-ip-hash-secret';
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

// Vercel BotID on Vercel production. Previews are behind Vercel's login already, and Drippa's
// product review drives a headless browser there that BotID would turn away. Self-hosted, there's
// no BotID service to ask. In both, every request counts as a person and only the daily
// allowance applies.
export function getBotCheck(): BotCheck {
  if (process.env.VERCEL_ENV !== 'production') return { isBot: async () => false };
  return { isBot: async () => (await checkBotId()).isBot };
}
