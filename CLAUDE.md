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
- Every change starts from a GitHub issue: find or create one first, and reference it in commits and the PR (`Closes #n`) so Drippa's product review can run. See the ticket-first skill.
- Small PRs, one concern each. Drippa reviews every PR.
- TypeScript, pnpm workspaces, Node 22.13+ (for the built-in node:sqlite).
## UI
- Theme "Probe": tokens in apps/web/src/app/tokens.css, never raw values in components.
- Load the ui-theme skill before any visual change, ui-shaders before any shader or animation, and run ui-review before opening a UI PR.
