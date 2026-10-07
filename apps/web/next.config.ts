import { existsSync } from 'node:fs';
import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

// Locally, the app reads the repo's one .env.local. On Vercel, env vars come from the project.
const rootEnv = new URL('../../.env.local', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Every report page has a JSON twin at the same address plus .json. Domains have dots, so it
  // can't be its own [domain] segment: it's rewritten to a route handler instead.
  async rewrites() {
    return [{ source: '/s/:domain(.+)\\.json', destination: '/api/reports/:domain' }];
  },
  // The workspace packages ship TypeScript source, so Next compiles them like app code.
  // Only loaded when self-hosted with Chromium installed; never bundled.
  serverExternalPackages: ['playwright-core'],
  transpilePackages: [
    '@drippa/stackprobe-browser-playwright',
    '@drippa/stackprobe-browser-vercel-sandbox',
    '@drippa/stackprobe-core',
    '@drippa/stackprobe-decider-typesafe',
    '@drippa/stackprobe-store-postgres',
  ],
};

export default withWorkflow(nextConfig);
