import { promises as dnsPromises } from 'node:dns';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { describe, expect, test } from 'vitest';
import { LayerError } from '../src/layer.ts';
import type { Net } from '../src/net.ts';
import {
  DOMAINS_DIR,
  FIXTURES_DIR,
  FixtureMiss,
  RECORDINGS_DIR,
  RecordingNet,
  ReplayNet,
} from './fixtures.ts';
import { findSecrets, redactHeaders, redactText } from './redact.ts';

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsInJlZiI6InRlc3QifQ.c2lnbmF0dXJlX2hlcmVfMTIz';
const signal = new AbortController().signal;

describe('redaction', () => {
  test('removes credentials from text', () => {
    expect(redactText(`key=${jwt}&x=1`)).toBe('key=<jwt>&x=1');
    expect(redactText('sb_publishable_AbCdEf123456')).toBe('sb_publishable_<redacted>');
    expect(redactText('sk_live_AbCdEf123456')).toBe('sk_live_<redacted>');
    expect(redactText('nothing secret here')).toBe('nothing secret here');
  });

  test('keeps header and cookie names but not their secret values', () => {
    expect(
      redactHeaders([
        ['server', 'Vercel'],
        ['authorization', 'Bearer abc'],
        ['apikey', jwt],
        ['set-cookie', 'sb-abc-auth-token=secret; Path=/; HttpOnly'],
        ['x-debug', `token ${jwt}`],
      ]),
    ).toEqual([
      ['server', 'Vercel'],
      ['authorization', '<redacted>'],
      ['apikey', '<redacted>'],
      ['set-cookie', 'sb-abc-auth-token=<redacted>'],
      ['x-debug', 'token <jwt>'],
    ]);
  });

  test('finds secrets that were not redacted', () => {
    expect(findSecrets(`a ${jwt} b sk_test_AbCdEf123456`)).toEqual([jwt, 'sk_test_AbCdEf123456']);
    expect(findSecrets(redactText(`a ${jwt} b sk_test_AbCdEf123456`))).toEqual([]);
  });
});

describe('record and replay', () => {
  const live: Net = {
    http: async (req) => ({
      url: req.url,
      status: 200,
      headers: [
        ['server', 'Vercel'],
        ['content-type', 'text/html'],
        ['set-cookie', 'session=abc123'],
      ],
      body: `<p>Hello</p><script src="/a.js?key=${jwt}"></script><script>const key = "${jwt}"</script>`,
    }),
    dns: async (name, type) => {
      if (name === 'missing.example') throw new LayerError('DNS_NXDOMAIN', 'no such domain');
      return { name, type, records: ['76.76.21.21'] };
    },
    tls: async () => {
      throw new TypeError('socket hang up');
    },
  };

  test('replays what was recorded, redacted', async () => {
    const recorder = new RecordingNet(
      live,
      'https://example.com/',
      new Date('2026-10-02T00:00:00Z'),
    );
    const original = await recorder.http({ url: 'https://example.com/', method: 'GET' }, signal);
    expect(original.body).toContain(jwt);
    await recorder.dns('Example.com', 'A', signal);
    await expect(recorder.dns('missing.example', 'A', signal)).rejects.toThrow(LayerError);
    await expect(recorder.tls('example.com', 443, signal)).rejects.toThrow('socket hang up');

    const saved = JSON.parse(JSON.stringify(recorder.recording));
    expect(findSecrets(JSON.stringify(saved))).toEqual([]);

    const replay = new ReplayNet(saved);
    const res = await replay.http({ url: 'https://example.com/', method: 'GET' });
    expect(res.headers).toEqual([
      ['server', 'Vercel'],
      ['content-type', 'text/html'],
      ['set-cookie', 'session=<redacted>'],
    ]);
    expect(res.body).toBe('<script src="/a.js?key=<jwt>"></script>');
    expect((await replay.dns('example.com', 'A')).records).toEqual(['76.76.21.21']);
    await expect(replay.dns('missing.example', 'A')).rejects.toMatchObject({
      name: 'LayerError',
      code: 'DNS_NXDOMAIN',
    });
    await expect(replay.tls('example.com', 443)).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  test('fails loudly on a call that was never recorded', async () => {
    const replay = new ReplayNet({
      url: 'https://x.test/',
      recordedAt: '',
      http: {},
      dns: {},
      tls: {},
    });
    await expect(replay.dns('x.test', 'CNAME')).rejects.toThrow(FixtureMiss);
    expect(replay.misses).toEqual(['CNAME x.test']);
  });
});

describe('network is blocked in tests', () => {
  test('fetch', () => {
    expect(() => fetch('https://example.com')).toThrow(/blocked in tests/);
  });

  test('sockets to remote hosts', () => {
    expect(() => net.connect(443, 'example.com')).toThrow(/blocked in tests/);
  });

  test('DNS queries', () => {
    expect(() => dnsPromises.resolve4('example.com')).toThrow(/blocked in tests/);
  });
});

test('committed fixtures are complete and contain no secrets', () => {
  const sites = existsSync(FIXTURES_DIR)
    ? readdirSync(FIXTURES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())
    : [];
  for (const site of sites) {
    for (const file of ['net.json', 'expected.json']) {
      const text = readFileSync(new URL(`${site.name}/${file}`, FIXTURES_DIR), 'utf8');
      expect(findSecrets(text), `${site.name}/${file}`).toEqual([]);
    }
  }
  for (const dir of [RECORDINGS_DIR, DOMAINS_DIR]) {
    const recordings = existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())
      : [];
    for (const recording of recordings) {
      const text = readFileSync(new URL(`${recording.name}/net.json`, dir), 'utf8');
      expect(findSecrets(text), `${dir.pathname} ${recording.name}`).toEqual([]);
    }
  }
});
