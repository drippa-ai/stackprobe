// Creates the sandbox snapshot the hosted app's browser layer starts from: Node 24, the pinned
// playwright-core and Chromium with its system libraries, in fra1, never expiring.
//   pnpm --filter @drippa/stackprobe-browser-vercel-sandbox create-snapshot
// Needs Vercel credentials for the project: VERCEL_OIDC_TOKEN (from `vercel env pull`) or
// VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID. Prints the snapshot id to set as
// STACKPROBE_SANDBOX_SNAPSHOT. Re-run only when playwright-core is upgraded.
import { Sandbox } from '@vercel/sandbox';
import { BROWSERS_PATH, WORKDIR } from '../src/index.ts';
import { PLAYWRIGHT_VERSION } from '../src/source.generated.ts';

const sandbox = await Sandbox.create({
  image: 'vercel/sandbox/node:24',
  region: 'fra1',
  resources: { vcpus: 2 },
  timeout: 15 * 60_000,
});
console.log(`sandbox ${sandbox.name} started; installing playwright-core ${PLAYWRIGHT_VERSION}`);

async function run(cmd: string, args: string[], sudo = false) {
  const result = await sandbox.runCommand({
    cmd,
    args,
    cwd: WORKDIR,
    sudo,
    env: { PLAYWRIGHT_BROWSERS_PATH: BROWSERS_PATH },
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (result.exitCode !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

try {
  await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', WORKDIR], sudo: true });
  await sandbox.runCommand({ cmd: 'chmod', args: ['777', WORKDIR], sudo: true });
  await run('npm', ['init', '-y']);
  await run('npm', ['install', `playwright-core@${PLAYWRIGHT_VERSION}`]);
  await run('npx', ['playwright-core', 'install', '--with-deps', 'chromium'], true);
  await run('chmod', ['-R', 'a+rX', BROWSERS_PATH], true);
  const snapshot = await sandbox.snapshot({ expiration: 0 });
  console.log(`\nSTACKPROBE_SANDBOX_SNAPSHOT=${snapshot.snapshotId}`);
} catch (error) {
  await sandbox.stop().catch(() => {});
  throw error;
}
