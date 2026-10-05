# @drippa/stackprobe-browser-vercel-sandbox

Runs stackprobe's browser layer in a [Vercel Sandbox](https://vercel.com/docs/sandbox), for the
hosted app: Vercel Functions can't run Chromium. Each scan starts one short-lived sandbox (in
`fra1`, 2 vCPUs, not persistent) from a snapshot with Chromium installed, uploads the capture
code from `browser-playwright`, captures the scan's pages and stops the sandbox.

Not on Vercel? Use `@drippa/stackprobe-browser-playwright` with a local Chromium instead.

## One-time setup

1. Link the repo to the Vercel project. This writes a development token (valid 12 hours) as
   `VERCEL_OIDC_TOKEN` to `.env.local`; `vercel env pull` refreshes it later:

   ```sh
   vercel link --scope <team> --project <project>
   ```

2. Create the snapshot (Node 24, playwright-core and Chromium; it never expires):

   ```sh
   pnpm --filter @drippa/stackprobe-browser-vercel-sandbox create-snapshot
   ```

3. Set the printed id as `STACKPROBE_SANDBOX_SNAPSHOT` on the Vercel project (Production and
   Preview). The web app uses the sandbox when that variable is set and it runs on Vercel.

Re-create the snapshot only when `playwright-core` is upgraded. The capture code itself is
uploaded on every run, so it always matches the deployed version.
