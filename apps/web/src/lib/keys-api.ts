import {
  type AccessDeps,
  type ApiKeyRecord,
  createApiKey,
  findApiKey,
  hashIp,
  keySubject,
  LimitError,
} from '@drippa/stackprobe-core';

// The API key endpoints, apart from Next's route handlers so they can be tested directly.
// Keys only ever appear in the response that creates them: never in logs or later responses.

export interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

// Nothing here may be cached by anyone, and any site may call it.
const HEADERS = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };

// The caller's IP as the platform reports it: the first x-forwarded-for entry (Vercel and most
// proxies set it), else x-real-ip. Self-hosted setups must run behind a proxy that sets one.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}

// POST /api/keys: a new key, returned once.
export async function createKeyResponse(
  ip: string,
  secret: string,
  deps: AccessDeps,
): Promise<ApiResponse> {
  try {
    const { key, record } = await createApiKey(await hashIp(ip, secret), deps);
    return {
      status: 201,
      headers: HEADERS,
      body: {
        key,
        prefix: record.prefix,
        limits: { scansPerDay: record.scansPerDay },
        note: 'Store this key now: it is not shown again. Send it as "Authorization: Bearer <key>". Revoke it with DELETE /api/keys/current.',
      },
    };
  } catch (error) {
    if (error instanceof LimitError) return limited(error, deps);
    throw error;
  }
}

// DELETE /api/keys/current: revokes the key the request is made with.
export async function revokeKeyResponse(
  authorization: string | null,
  deps: AccessDeps,
): Promise<ApiResponse> {
  const key = bearer(authorization);
  const record = key ? await findApiKey(key, deps) : null;
  if (!record) return invalidKey();
  await deps.store.revokeKey(record.id);
  await deps.store.recordUsage({
    subject: keySubject(record),
    endpoint: 'DELETE /api/keys/current',
    newScan: false,
  });
  return { status: 200, headers: HEADERS, body: { revoked: record.prefix } };
}

export function invalidKey(): ApiResponse {
  return {
    status: 401,
    headers: { ...HEADERS, 'www-authenticate': 'Bearer' },
    body: {
      error: 'invalid_key',
      message: 'Send a live API key as "Authorization: Bearer <key>". Get one with POST /api/keys.',
    },
  };
}

export function limited(error: LimitError, deps: Pick<AccessDeps, 'now'>): ApiResponse {
  const now = (deps.now?.() ?? new Date()).getTime();
  const seconds = Math.max(1, Math.ceil((Date.parse(error.resetAt) - now) / 1000));
  return {
    status: 429,
    headers: { ...HEADERS, 'retry-after': String(seconds) },
    body: { error: 'rate_limited', message: error.message, resetAt: error.resetAt },
  };
}

function bearer(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

// The live API key an "Authorization: Bearer <key>" header names, or null.
export async function keyFromHeader(
  authorization: string | null,
  deps: AccessDeps,
): Promise<ApiKeyRecord | null> {
  const key = bearer(authorization);
  return key ? findApiKey(key, deps) : null;
}
