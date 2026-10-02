# stackprobe

Open-source tech stack detector by Drippa. Full spec: .private/SPEC.md (gitignored; never commit, copy or quote it).
Read the relevant spec section before starting any task. Keep the spec private.

## Rules that never break
- packages/core has no Vercel, Workflow or Supabase imports. It runs anywhere.
- Every detection belongs to a surface. Never report landing page findings as the product stack.
- Every detection has evidence and a confidence score.
- Keys and secrets only in env vars. Never commit them.
- The GPL fingerprint pack is downloaded at runtime, never committed.
- Tests use recorded fixtures, never live sites.

## Working style
- Plan first, wait for approval, then build.
- Small PRs, one concern each. Drippa reviews every PR.
- TypeScript, pnpm workspaces, Node 20+.