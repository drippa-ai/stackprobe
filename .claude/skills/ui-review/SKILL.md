---
name: ui-review
description: Checks to run on any change to stackprobe's web UI before opening or approving a PR — light and dark, phone width, contrast, keyboard, reduced motion, every scan state, theme rules and the "Never" list. Use after building UI and before `gh pr create`, or when asked to review UI.
---

# UI review

Run this after building and before opening the PR. It checks the work against the `ui-theme`
skill (load it if you haven't) and the design canvas linked from issue #52. Fix what fails; put what you
checked in the PR description.

## 1. Look at it

Start the app (`pnpm --filter @drippa/stackprobe-web dev`; stop it before switching branches, as it
rewrites files in apps/web), then take screenshots of every page you touched:

```sh
node .claude/skills/ui-review/screens.ts http://localhost:3000 / /s/<a-scanned-domain> /s/never-scanned.test
```

That writes light and dark at 390 px and 1280 px, plus reduced motion, to `.ui-review/`, and
fails if any page scrolls sideways. (The round "N" badge in a corner is Next's dev indicator; ignore it.) Read the screenshots. Compare them with the design canvas
and each other:

- [ ] Light and dark both look intended. No unreadable text, no lines that vanish in one mode.
- [ ] At 390 px: nothing scrolls sideways, technology rows stack, tabs scroll in their own strip,
      buttons are ≥ 44 px tall.
- [ ] Alignment holds on the 4 px grid; columns line up from row to row; numbers right-aligned.

## 2. Every state

A page isn't done until each state is. For the report flow, check all of these:

- [ ] Not scanned yet (`/s/never-scanned.test`): says so plainly and offers a scan.
- [ ] Running: "Running" chip, what it's doing now, the checks list; refreshes into the report.
- [ ] Finished with a product app found.
- [ ] Finished with no product app found: says so plainly.
- [ ] Partial (a check failed): marked as partial, the failed check named.
- [ ] Failed scan: says what happened and offers to scan again.
- [ ] Long values: a very long domain, a 40-character version, a long evidence URL. They wrap
      or truncate inside their box, never off the page.

## 3. Theme rules

Search the diff:

```sh
git diff main -- apps/web | grep -nE '^\+.*(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|[0-9]+px)' | grep -v tokens.css
```

- [ ] No colours outside `tokens.css`; sizes come from tokens (1 px borders are fine).
- [ ] `--signal` only on data and state (bars ≥ 60 %, running, focus, active tab, shader).
- [ ] Data (domains, versions, numbers, evidence) is in mono with tabular figures.
- [ ] Sentence case, no uppercase labels; headings describe, not sell.
- [ ] Nothing from the "Never" list in `ui-theme`.

## 4. Access

- [ ] Tab through the page: every link, tab, row and button is reachable in a sensible order,
      and each shows the green focus ring.
- [ ] Rows open with Enter/Space (`<details>`); tabs are links with `aria-current`.
- [ ] Inputs have labels (visible or visually hidden); icon-only buttons have `aria-label`.
- [ ] Contrast ≥ 4.5:1 for text in both modes. `--ink-3` is the floor: 5.1:1 on `--page`, 4.8:1
      on `--inset` (light mode). Never put `--ink-3` on a tint.
- [ ] Reduced motion: nothing moves (check the `-reduced` screenshot and the shaders).
- [ ] Status isn't told by colour alone.

## 5. Weight and tests

- [ ] `pnpm build`: the report route's JavaScript didn't grow unless the PR says why.
- [ ] Rendering tests for new sections or states (see `apps/web/src/app/s/[domain]/report-sections.test.tsx`).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass.

## In the PR

Add a short "UI review" section: pages and states checked, light/dark/phone checked, anything
not checked and why. Attach screenshots only if the user asks; they live in `.ui-review/`, which
is gitignored.
