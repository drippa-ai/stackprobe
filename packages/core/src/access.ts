// API keys and the daily allowance of new scans. One allowance mechanism for every caller: an
// API key, or an anonymous website visitor (known only by a keyed hash of their IP). Reading
// reports is never limited, and returning a recent scan doesn't spend anything.
// Local tools (CLI, MCP over stdio) are never gated and don't use this.

const DAY_MS = 24 * 60 * 60 * 1000;

export const KEY_PREFIX = 'sp_';
// How many characters of a key are kept in clear, to tell keys apart in logs and lists.
export const KEY_PREFIX_LENGTH = 10;
export const KEY_SCANS_PER_DAY = 10;
export const VISITOR_SCANS_PER_DAY = 3;
export const KEYS_PER_IP_PER_DAY = 3;
export const USAGE_KEPT_DAYS = 30;

export interface ApiKeyRecord {
  id: string;
  // The first characters of the key, e.g. "sp_k3J9x2a". The rest is only ever stored hashed.
  prefix: string;
  scansPerDay: number;
  createdAt: string;
  revokedAt: string | null;
}

// Who is spending the allowance: an API key, or an anonymous visitor's hashed IP.
export type Subject = `key:${string}` | `visitor:${string}`;

export interface UsageEvent {
  subject: Subject;
  endpoint: string;
  // True when the request started a new scan (and so spent the allowance).
  newScan: boolean;
}

// Where keys and usage are kept. Implementations: MemoryAccessStore here, Postgres in its own
// package. Times are ISO strings; `since`/`before` are inclusive/exclusive bounds.
export interface AccessStore {
  createKey(input: {
    hash: string;
    prefix: string;
    ipHash: string;
    scansPerDay: number;
  }): Promise<ApiKeyRecord>;
  // The key with this hash, revoked or not; null when there's none.
  findKey(hash: string): Promise<ApiKeyRecord | null>;
  revokeKey(id: string): Promise<void>;
  countKeysCreated(ipHash: string, since: string): Promise<number>;
  recordUsage(event: UsageEvent): Promise<void>;
  countNewScans(subject: Subject, since: string): Promise<number>;
  // Deletes usage older than `before`; returns how many rows went.
  pruneUsage(before: string): Promise<number>;
}

// A limit was reached. `resetAt` is when the caller may try again.
export class LimitError extends Error {
  readonly resetAt: string;

  constructor(message: string, resetAt: string) {
    super(message);
    this.name = 'LimitError';
    this.resetAt = resetAt;
  }
}

export interface AccessDeps {
  store: AccessStore;
  now?: () => Date;
}

// Days run on UTC: an allowance resets at the next UTC midnight, the same moment for everyone.
export function dayWindow(now: Date): { start: string; resetAt: string } {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { start: new Date(start).toISOString(), resetAt: new Date(start + DAY_MS).toISOString() };
}

// Creates a key for a caller, at most KEYS_PER_IP_PER_DAY a day per IP. Returns the key itself:
// the only time it exists outside the caller's hands.
export async function createApiKey(
  ipHash: string,
  deps: AccessDeps,
): Promise<{ key: string; record: ApiKeyRecord }> {
  const now = deps.now?.() ?? new Date();
  const { start, resetAt } = dayWindow(now);
  if ((await deps.store.countKeysCreated(ipHash, start)) >= KEYS_PER_IP_PER_DAY) {
    throw new LimitError(
      `At most ${KEYS_PER_IP_PER_DAY} new keys a day from one address. Try again after ${resetAt}.`,
      resetAt,
    );
  }
  const key = KEY_PREFIX + base64url(crypto.getRandomValues(new Uint8Array(32)));
  const record = await deps.store.createKey({
    hash: await hashKey(key),
    prefix: key.slice(0, KEY_PREFIX_LENGTH),
    ipHash,
    scansPerDay: KEY_SCANS_PER_DAY,
  });
  // Old usage goes when keys are made: often enough, and nothing else to schedule.
  await deps.store.pruneUsage(new Date(now.getTime() - USAGE_KEPT_DAYS * DAY_MS).toISOString());
  return { key, record };
}

// The live key for a key string, or null when it's unknown, malformed or revoked.
export async function findApiKey(key: string, deps: AccessDeps): Promise<ApiKeyRecord | null> {
  if (!key.startsWith(KEY_PREFIX) || key.length > 100) return null;
  const record = await deps.store.findKey(await hashKey(key));
  return record && !record.revokedAt ? record : null;
}

export interface Allowance {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

// How much of today's allowance a subject has left.
export async function allowance(
  subject: Subject,
  limit: number,
  deps: AccessDeps,
): Promise<Allowance> {
  const { start, resetAt } = dayWindow(deps.now?.() ?? new Date());
  const used = await deps.store.countNewScans(subject, start);
  return { limit, used, remaining: Math.max(0, limit - used), resetAt };
}

// Throws LimitError when the subject has no new scans left today.
export async function assertAllowance(
  subject: Subject,
  limit: number,
  deps: AccessDeps,
): Promise<Allowance> {
  const left = await allowance(subject, limit, deps);
  if (left.remaining === 0) {
    throw new LimitError(
      `Daily limit of ${limit} new scans reached. Recent scans are still free to read. ` +
        `Resets at ${left.resetAt}.`,
      left.resetAt,
    );
  }
  return left;
}

export function keySubject(record: ApiKeyRecord): Subject {
  return `key:${record.id}`;
}

// A visitor is a keyed hash of their IP: enough to count, never the address itself.
export async function visitorSubject(ip: string, secret: string): Promise<Subject> {
  return `visitor:${await hashIp(ip, secret)}`;
}

export async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip)));
}

export async function hashKey(key: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Keeps everything in memory. For tests.
export class MemoryAccessStore implements AccessStore {
  private readonly keys = new Map<string, ApiKeyRecord & { hash: string; ipHash: string }>();
  private usage: (UsageEvent & { at: string })[] = [];
  private readonly now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async createKey(input: {
    hash: string;
    prefix: string;
    ipHash: string;
    scansPerDay: number;
  }): Promise<ApiKeyRecord> {
    const record = {
      id: crypto.randomUUID(),
      prefix: input.prefix,
      scansPerDay: input.scansPerDay,
      createdAt: this.now().toISOString(),
      revokedAt: null,
      hash: input.hash,
      ipHash: input.ipHash,
    };
    this.keys.set(record.id, record);
    return publicKey(record);
  }

  async findKey(hash: string): Promise<ApiKeyRecord | null> {
    const found = [...this.keys.values()].find((k) => k.hash === hash);
    return found ? publicKey(found) : null;
  }

  async revokeKey(id: string): Promise<void> {
    const found = this.keys.get(id);
    if (found && !found.revokedAt) found.revokedAt = this.now().toISOString();
  }

  async countKeysCreated(ipHash: string, since: string): Promise<number> {
    return [...this.keys.values()].filter((k) => k.ipHash === ipHash && k.createdAt >= since)
      .length;
  }

  async recordUsage(event: UsageEvent): Promise<void> {
    this.usage.push({ ...event, at: this.now().toISOString() });
  }

  async countNewScans(subject: Subject, since: string): Promise<number> {
    return this.usage.filter((u) => u.subject === subject && u.newScan && u.at >= since).length;
  }

  async pruneUsage(before: string): Promise<number> {
    const kept = this.usage.filter((u) => u.at >= before);
    const removed = this.usage.length - kept.length;
    this.usage = kept;
    return removed;
  }
}

function publicKey(record: ApiKeyRecord): ApiKeyRecord {
  const { id, prefix, scansPerDay, createdAt, revokedAt } = record;
  return { id, prefix, scansPerDay, createdAt, revokedAt };
}
