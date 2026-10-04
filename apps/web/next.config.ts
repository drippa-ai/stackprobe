import { existsSync } from 'node:fs';
import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

// Locally, the app reads the repo's one .env.local. On Vercel, env vars come from the project.
const rootEnv = new URL('../../.env.local', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // The workspace packages ship TypeScript source, so Next compiles them like app code.
  transpilePackages: ['@drippa/stackprobe-core', '@drippa/stackprobe-store-postgres'],
};

export default withWorkflow(nextConfig);
