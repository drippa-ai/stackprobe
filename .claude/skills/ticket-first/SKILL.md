---
name: ticket-first
description: Find or create a scoped GitHub issue before starting any code change in stackprobe (feature, fix, refactor, chore), and reference it in every commit and PR so Drippa's product review can check the work against it. Use at the start of any task that will end in a commit or PR.
---

# Ticket first

Drippa's product review reads the linked issue to work out what to test. A PR without one gets
no product review. So every change starts from an issue and points back to it.

## 1. Find an existing issue

```sh
gh issue list --state open --limit 50
gh issue list --state all --search "<keywords>" --limit 20
```

- One issue clearly covers the work: use it. Read it (`gh issue view <n>`) and build to its
  "Done when".
- It covers the work but the scope has moved (new findings, a narrower slice): propose the edit
  to the user, then `gh issue edit <n> --body-file …` once they agree.
- The work is only part of a bigger issue: either make the PR deliver a clear slice and say
  which part with `Refs #n`, or create a smaller issue for the slice and link the parent.

## 2. Otherwise, create one

Write it in the same shape as the existing issues (see #34, #35): plain language, no jargon the
user wouldn't use, and nothing from `.private/SPEC.md` (the repo is public).

```markdown
## Why
What's wrong or missing, and who it affects. For a bug: what happened, where it was seen
(e.g. a preview URL, a log line), and the cause if known.

## What to build
The change, concretely: routes, behaviour, states, packages touched. Say what is out of scope
and which issue it belongs to instead.

## Done when
Outcomes a reviewer can check by using the product or the tests, one per line, e.g.
- A scan whose browser step fails still finishes and shows the report.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
```

Rules:
- One concern per issue, small enough for one PR.
- "Done when" lines are observable outcomes, not implementation steps; the product review turns
  each into a test step.
- Show the user the title and body and wait for approval before `gh issue create`, unless they
  already approved this work's scope in the conversation. Then create it with
  `gh issue create --title "…" --body-file <file>` and tell them the number.

## 3. Reference it everywhere

- **Branch:** include the number, e.g. `fix/browser-batch-failure-49`.
- **Commits:** end the subject or body with the issue, e.g. `Finish the scan when the browser
  batch fails (#49)` or a `Refs #49` line before the trailers.
- **PR body:** first line `Closes #49` (or `Refs #49` when the PR delivers only part of it).
  Restate which "Done when" lines this PR covers, so the review can check them one by one.

## 4. Before opening the PR

Check that the PR body has the `Closes`/`Refs` line and that the work meets the issue's "Done
when". If the scope changed during the work, update the issue first, so the review tests what
was actually built.
