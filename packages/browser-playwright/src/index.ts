import type { Browser, BrowserCapture, CaptureOptions } from '@drippa/stackprobe-core';
import { USER_AGENT } from '@drippa/stackprobe-core/node';
import { capturePage } from './capture.ts';

export type { Capture, CapturePageOptions } from './capture.ts';
export { capturePage, isPrivateTarget } from './capture.ts';

import { type Browser as Chromium, chromium, type LaunchOptions } from 'playwright-core';

export interface PlaywrightBrowserOptions {
  launch?: LaunchOptions;
}

// Loads pages in a local headless Chromium, like one visitor: no logging in, no forms, no
// images, an honest user agent. Install Chromium once: pnpm --filter
// @drippa/stackprobe-browser-playwright install-chromium
export class PlaywrightBrowser implements Browser {
  private chromium: Promise<Chromium> | undefined;
  private readonly options: PlaywrightBrowserOptions;

  constructor(options: PlaywrightBrowserOptions = {}) {
    this.options = options;
  }

  async capture(url: string, { signal, timeoutMs }: CaptureOptions): Promise<BrowserCapture> {
    this.chromium ??= chromium.launch({ headless: true, ...this.options.launch });
    return capturePage(await this.chromium, url, { timeoutMs, userAgent: USER_AGENT, signal });
  }

  async close(): Promise<void> {
    const browser = await this.chromium?.catch(() => undefined);
    this.chromium = undefined;
    await browser?.close();
  }
}

// A browser when Chromium is installed, or none: scans then simply skip the browser layer.
export async function playwrightIfInstalled(): Promise<PlaywrightBrowser | undefined> {
  try {
    const { existsSync } = await import('node:fs');
    return existsSync(chromium.executablePath()) ? new PlaywrightBrowser() : undefined;
  } catch {
    return undefined;
  }
}
