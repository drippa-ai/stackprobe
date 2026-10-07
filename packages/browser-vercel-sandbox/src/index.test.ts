import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { generate } from '../scripts/build-source.ts';
import {
  errorLine,
  SandboxBrowser,
  type SandboxLike,
  sandboxBrowserFromEnv,
  WORKDIR,
} from './index.ts';

const capture = {
  url: 'https://app.acme.test/login',
  status: 200,
  requests: [],
  websockets: [],
  cookies: [],
  globals: ['__next_f'],
};

function fakeSandbox(output: { exitCode: number; stdout: string; stderr?: string }) {
  const calls: {
    created?: unknown;
    files?: { path: string }[];
    command?: unknown;
    stopped: boolean;
  } = {
    stopped: false,
  };
  const create = async (params: unknown): Promise<SandboxLike> => {
    calls.created = params;
    return {
      async writeFiles(files) {
        calls.files = files;
      },
      async runCommand(params) {
        calls.command = params;
        return {
          exitCode: output.exitCode,
          stdout: async () => output.stdout,
          stderr: async () => output.stderr ?? '',
        };
      },
      async stop() {
        calls.stopped = true;
      },
    };
  };
  return { create, calls };
}

describe('SandboxBrowser', () => {
  test('captures a batch of pages in one sandbox from the snapshot, then stops it', async () => {
    const urls = ['https://app.acme.test/login', 'https://acme.test/'];
    const { create, calls } = fakeSandbox({
      exitCode: 0,
      stdout: JSON.stringify({
        [urls[0] as string]: capture,
        [urls[1] as string]: { error: 'timeout' },
      }),
    });
    const browser = new SandboxBrowser({ snapshotId: 'snap_1', create });
    const captures = await browser.captureMany(urls, { timeoutMs: 25_000 });

    expect(captures[urls[0] as string]).toEqual(capture);
    expect(captures[urls[1] as string]).toEqual({ error: 'timeout' });
    expect(calls.created).toMatchObject({
      source: { type: 'snapshot', snapshotId: 'snap_1' },
      region: 'fra1',
      resources: { vcpus: 2 },
      persistent: false,
    });
    expect(calls.files?.map((f) => f.path)).toEqual([
      `${WORKDIR}/capture.ts`,
      `${WORKDIR}/capture-cli.ts`,
    ]);
    const command = calls.command as { args: string[]; env: Record<string, string> };
    expect(JSON.parse(command.args.at(-1) as string)).toMatchObject({ urls, timeoutMs: 25_000 });
    expect(command.env.PLAYWRIGHT_BROWSERS_PATH).toBe(`${WORKDIR}/browsers`);
    expect(calls.stopped).toBe(true);
  });

  test('a failing capture still stops the sandbox, and says why', async () => {
    const { create, calls } = fakeSandbox({
      exitCode: 1,
      stdout: '',
      stderr: 'file:///opt/stackprobe/capture-cli.ts:3\nError: Chromium missing\n    at main\nNode.js v24.19.0',
    });
    const browser = new SandboxBrowser({ snapshotId: 'snap_1', create });
    await expect(
      browser.capture('https://acme.test/', { signal: AbortSignal.timeout(1000), timeoutMs: 1000 }),
    ).rejects.toThrow(/Chromium missing/);
    expect(calls.stopped).toBe(true);
  });

  test('capture returns one page, or throws its error', async () => {
    const { create } = fakeSandbox({
      exitCode: 0,
      stdout: JSON.stringify({ 'https://acme.test/': { error: 'net::ERR_NAME_NOT_RESOLVED' } }),
    });
    const browser = new SandboxBrowser({ snapshotId: 'snap_1', create });
    await expect(
      browser.capture('https://acme.test/', { signal: AbortSignal.timeout(1000), timeoutMs: 1000 }),
    ).rejects.toThrow(/ERR_NAME_NOT_RESOLVED/);
  });
});

test('a crash is told by its error line, not the end of its stack', () => {
  const stderr = [
    'file:///opt/stackprobe/capture-cli.ts:12',
    '',
    "Error: Executable doesn't exist at /opt/stackprobe/browsers/chromium",
    '    at main (file:///opt/stackprobe/capture-cli.ts:12:9)',
    '    at node:internal/main/run_main_module:33:47',
    '',
    'Node.js v24.19.0',
  ].join('\n');
  expect(errorLine(stderr)).toBe(
    "Error: Executable doesn't exist at /opt/stackprobe/browsers/chromium",
  );
  expect(errorLine('Killed\n')).toBe('Killed');
  expect(errorLine('')).toBe('no error output');
});

test('only on Vercel, and only with a snapshot', () => {
  expect(sandboxBrowserFromEnv({ VERCEL: '1' })).toBeUndefined();
  expect(sandboxBrowserFromEnv({ STACKPROBE_SANDBOX_SNAPSHOT: 'snap_1' })).toBeUndefined();
  expect(
    sandboxBrowserFromEnv({ VERCEL: '1', STACKPROBE_SANDBOX_SNAPSHOT: 'snap_1' }),
  ).toBeInstanceOf(SandboxBrowser);
});

test('the embedded capture code matches browser-playwright (run pnpm build-source)', () => {
  const committed = readFileSync(new URL('./source.generated.ts', import.meta.url), 'utf8');
  expect(committed).toBe(generate());
});
