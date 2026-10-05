import type { Browser, BrowserCapture, CaptureOptions } from '@drippa/stackprobe-core';
import { USER_AGENT } from '@drippa/stackprobe-core/node';
import { Sandbox } from '@vercel/sandbox';
import { CAPTURE_CLI_TS, CAPTURE_TS } from './source.generated.ts';

// Where the snapshot keeps Node's playwright-core and Chromium (see scripts/create-snapshot.ts).
export const WORKDIR = '/opt/stackprobe';
export const BROWSERS_PATH = `${WORKDIR}/browsers`;

export interface SandboxBrowserOptions {
  // The snapshot with Chromium installed, from scripts/create-snapshot.ts.
  snapshotId: string;
  region?: string;
  vcpus?: number;
  // Replaceable in tests.
  create?: (params: Parameters<typeof Sandbox.create>[0]) => Promise<SandboxLike>;
}

// The little of a Sandbox this needs.
export interface SandboxLike {
  writeFiles(files: { path: string; content: string }[]): Promise<void>;
  runCommand(params: {
    cmd: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
  }): Promise<{ exitCode: number | null; stdout(): Promise<string>; stderr(): Promise<string> }>;
  stop(): Promise<unknown>;
}

export type Captures = Record<string, BrowserCapture | { error: string }>;

// Runs the browser layer in a Vercel Sandbox, for where Chromium can't run (Vercel Functions).
// One sandbox per batch of pages, stopped as soon as they're captured. Self-hosted setups use
// browser-playwright directly instead.
export class SandboxBrowser implements Browser {
  private readonly options: Required<Omit<SandboxBrowserOptions, 'create'>> & {
    create: NonNullable<SandboxBrowserOptions['create']>;
  };

  constructor(options: SandboxBrowserOptions) {
    this.options = {
      region: 'fra1',
      vcpus: 2,
      create: (params) => Sandbox.create(params) as Promise<SandboxLike>,
      ...options,
    };
  }

  async capture(url: string, options: CaptureOptions): Promise<BrowserCapture> {
    const result = (await this.captureMany([url], options))[url];
    if (!result || 'error' in result) throw new Error(result?.error ?? `No capture of ${url}`);
    return result;
  }

  // All of a scan's pages in one sandbox: one boot, one bill.
  async captureMany(
    urls: string[],
    { timeoutMs }: Pick<CaptureOptions, 'timeoutMs'>,
  ): Promise<Captures> {
    const sandbox = await this.options.create({
      source: { type: 'snapshot', snapshotId: this.options.snapshotId },
      region: this.options.region,
      resources: { vcpus: this.options.vcpus },
      // Booting, then the pages in parallel, plus a margin. It stops itself if we never return.
      timeout: timeoutMs + 60_000,
      persistent: false,
    } as Parameters<typeof Sandbox.create>[0]);
    try {
      // .mts: ES modules whatever the snapshot's package.json says.
      await sandbox.writeFiles([
        { path: `${WORKDIR}/capture.mts`, content: CAPTURE_TS },
        {
          path: `${WORKDIR}/capture-cli.mts`,
          content: CAPTURE_CLI_TS.replace("from './capture.ts'", "from './capture.mts'"),
        },
      ]);
      const command = await sandbox.runCommand({
        cmd: 'node',
        args: [
          '--experimental-strip-types',
          'capture-cli.mts',
          JSON.stringify({ urls, timeoutMs, userAgent: USER_AGENT }),
        ],
        cwd: WORKDIR,
        env: { PLAYWRIGHT_BROWSERS_PATH: BROWSERS_PATH },
      });
      if (command.exitCode !== 0) {
        const stderr = (await command.stderr()).trim().split('\n').slice(0, 8).join(' | ');
        throw new Error(`Capture in sandbox failed (exit ${command.exitCode}): ${stderr}`);
      }
      return JSON.parse(await command.stdout()) as Captures;
    } finally {
      await sandbox.stop().catch(() => {});
    }
  }
}

// A sandbox browser when running on Vercel with a snapshot configured, or none.
export function sandboxBrowserFromEnv(
  env: Record<string, string | undefined> = process.env,
): SandboxBrowser | undefined {
  return env.VERCEL && env.STACKPROBE_SANDBOX_SNAPSHOT
    ? new SandboxBrowser({ snapshotId: env.STACKPROBE_SANDBOX_SNAPSHOT })
    : undefined;
}
