---
name: ui-theme
description: stackprobe's visual theme, "Probe" — tokens, type, spacing, colour rules, component recipes and the list of generic-UI tells to avoid. Load before writing or changing anything visual in apps/web (pages, components, CSS, OG images, emails), and before reviewing UI.
---

# Probe: stackprobe's theme

stackprobe is an instrument, not a landing page. A report should feel like reading a measurement:
quiet greys, one signal colour, thin lines, monospace for anything the scan measured, motion only
where data changes. If a choice makes the page look more like a template or a marketing site,
it's the wrong choice.

The tokens are in `apps/web/src/app/tokens.css`. That file is the only place colours, sizes and
timings are defined. The design canvas with every page and state is linked from issue #52
(private to the Drippa team).

Before you open a UI PR, run the `ui-review` skill. For anything animated or GPU-drawn, load
`ui-shaders` first.

## Rules that never break

1. **No raw values in components.** Every colour, font, size, radius, shadow, duration and easing
   comes from a `var(--…)` in `tokens.css`. Need a new one? Add it to `tokens.css` (light *and*
   dark) in the same PR and say why in the PR description.
2. **Light and dark follow the system** (`prefers-color-scheme`). There's no toggle. Every new
   token gets both values; check both before shipping.
3. **One accent.** `--signal` (green) is for data and state only: confidence bars at 60 % and up,
   the running scan, focus rings, the probe field. Never on decoration, headings, icons, links
   or buttons.
4. **Data is monospace.** Domains, hosts, versions, numbers, percentages, durations, timestamps,
   header names, URLs and evidence use `--font-mono` with tabular figures. Words are in the sans.
5. **Hairlines, not shadows.** Separate things with `--line-soft` / `--line` / `--line-strong`
   and the `--inset` fill. `--shadow-menu` is only for menus and popovers that float over content.
6. **Accessible as built.** Text contrast ≥ 4.5:1 (`--ink-3` on `--page` is the lowest allowed);
   real `<a>`, `<button>`, `<input>` + `<label>`, `<details>`; focus is always `--focus-ring`;
   touch targets ≥ 44 px on phones.

## Colour

| Token | Use for |
|---|---|
| `--page` | Page ground |
| `--surface` | Panels and tables that sit on the page |
| `--inset` | Inputs, an open technology row, evidence blocks |
| `--line-soft` | Dividers between rows |
| `--line` | Panel borders, header and footer rules, tab baseline |
| `--line-strong` | Control borders (inputs, secondary buttons) |
| `--ink` | Body text, headings, the primary button's fill |
| `--ink-2` | Secondary text: verdict sentence, categories, inactive tabs |
| `--ink-3` | Labels, meta, column heads, timestamps. Lowest contrast allowed |
| `--signal` | Bars ≥ 60 %, status dots, focus ring, active tab underline, probe field |
| `--signal-ink` | Signal colour used as text (the "Running" chip) |
| `--signal-tint` | Background of the "Running" chip |
| `--warn-ink` / `--warn-tint` | A partial scan (some checks failed) |
| `--fail-ink` / `--fail-tint` | A failed check or scan |
| `--dot` | Dots in the probe field and scan band |

- Confidence under 60 % draws its bar in `--ink-3`, so weak guesses don't look like findings.
- Status is never told by colour alone: a chip always has a word ("Running", "Partial", "Failed").
- Links are `--ink` with an underline in `--line-strong`; on hover the underline goes `--ink`.

## Type

Instrument Sans (`--font-sans`) for words; JetBrains Mono (`--font-mono`) for data. Both load via
`next/font/google` in `layout.tsx`, exposing `--font-instrument` and `--font-jetbrains`. Two weights:
`--weight-regular` (400) and `--weight-strong` (600). No italics, no 700+.

| Role | Size | Face | Notes |
|---|---|---|---|
| Display (home headline only) | `--text-display` | sans 600 | `--leading-tight`, `--tracking-display`, `font-stretch: var(--stretch-display)`, max ~11ch |
| Title (domain on a report) | `--text-title` | mono 500 | `--tracking-title` |
| Heading | `--text-heading` | sans 600 | `--tracking-heading` |
| Subheading | `--text-subheading` | sans 600 | |
| Lead (verdict, home intro) | `--text-lead` | sans 400 | `--ink-2`, tech names in `--ink` 600 |
| Body | `--text-body` | sans 400 | `--leading-body` |
| Label | `--text-label` | sans 400 | `--ink-3` |
| Data | `--text-data` | mono 400 | tabular figures |

- Sentence case everywhere. No uppercase labels, no letter-spaced eyebrows.
- Headings say what's there ("Recently scanned"), never sell ("Powerful insights").
- Numbers carry units: `28 s`, `95%`, `4 surfaces`. Dates: `7 Oct, 14:02` (day first, 24 h).

## Space and layout

- Everything sits on the 4 px grid: `--space-1` … `--space-24`. No odd values like 10 px or 18 px.
- Content width `--content` (1200 px), side gutter `--gutter` (24 px), `--gutter-phone` (16 px)
  under 600 px.
- Left-aligned. Nothing centred except single buttons inside their own box.
- Vertical rhythm: 40–56 px between page sections, 12–16 px inside a group.
- Tables: header row in `--text-label` `--ink-3`; rows 14 px top/bottom padding; numbers right
  aligned. A table wider than the screen scrolls inside its own box (`overflow-x: auto`); the page
  never scrolls sideways.
- Phone (≤ 600 px): technology rows stack (name + % on one line, category + clues below, bar
  under); action buttons go full width in a two-column grid.

## Shape

- `--radius-1` (4 px) chips and bars, `--radius-2` (6 px) controls, `--radius-3` (10 px) panels.
  Nothing rounder, except status dots (fully round, 6–8 px).
- Borders are 1 px. The only 2 px line is the active tab's underline in `--signal`.

## Motion

Motion explains a change in data. Nothing loops except the running scan.

| Token | Use for |
|---|---|
| `--dur-instant` + `--ease-out` | Hover, press, focus |
| `--dur-fast` + `--ease-out` | Tab underline, opening a row, "Copied" |
| `--dur-standard` + `--ease-out` | A finished check settling into the list, bars filling |
| `--dur-considered` + `--ease-out` | Confidence counting up, the report replacing the running state |
| `--ease-in` | The rare thing that leaves |

- Animate `opacity` and `transform` only. No bounces, no springs, no blur-in text.
- Lists: stagger at most 20 ms per item and at most 8 items.
- `tokens.css` sets every duration to 0 under `prefers-reduced-motion`, so using the tokens is
  enough. Anything driven by JS must check the media query itself.

## Components

Build these the same way everywhere; reuse the existing component before writing a new one.

- **Header:** 60 px tall, `--line` rule underneath. Left: the probe mark (a 1.5 px ring with a
  `--signal` dot in the middle) and "stackprobe" in sans 600. Right: nav links in `--ink-2`
  (`--ink` on hover), then "powered by Drippa" in `--ink-3`. Only link pages that exist.
- **Footer:** `--line` rule above, `--text-label` `--ink-3`: "Powered by Drippa. Open source,
  Apache-2.0." on the left, Opt out and GitHub on the right.
- **Search:** mono input on `--surface` with a `--line-strong` border, `--radius-2`, height
  `--control-lg` on home and `--control-md` elsewhere; the label is visually hidden but present.
  The Scan button sits beside it.
- **Buttons:** primary = `--ink` fill, `--page` text, 600; secondary = `--surface` fill,
  `--line-strong` border; quiet = text with underline. One primary per view. Heights from
  `--control-*`. Verbs: "Scan", "Scan again", "Copy link".
- **Report head:** the domain as Title (mono), the verdict sentence as Lead, facts on the right as a
  `<dl>`: Scanned / Surfaces / Took, labels `--ink-3`, values mono.
- **Surface tabs:** real links with `aria-current="page"`; each shows the surface kind ("Product
  app") and the host underneath in mono `--ink-3`. Active: `--ink` 600 and the 2 px `--signal`
  underline. The strip scrolls by itself on phones.
- **Technology table:** a `--surface` panel with `--line` border and `--radius-3`. Columns:
  Technology (name 600 + version mono `--ink-3`), Category, Clues (right), Confidence (4 px bar +
  mono %). Each row is a `<details>`; open rows and their evidence use `--inset`.
- **Evidence:** mono `--text-data`, one line per clue: the check name (`http`, `dns`, `tls`,
  `browser`, `bundle`) in `--ink-3` in a fixed-width column, then the detail. Long values wrap
  (`overflow-wrap: anywhere`).
- **State chip:** 26 px tall, `--radius-1`, a 6 px dot and a word. Running = signal tint; Done =
  `--inset` with `--line` border; Partial = warn; Failed = fail.
- **Running scan:** the "Running" chip, one sentence on what it's doing now ("Loading the product app
  in a real browser"), then the list of checks with a dot each (done `--ink-3`, now `--signal`,
  waiting `--line-strong`) and the time each took in mono.
- **Empty and error states:** say plainly what happened and what to do next in one or two
  sentences, with the action as a button. No illustrations.

## Never

These make a page look generated. Don't add them, and remove them when you find them.

- Gradients of any kind on surfaces or text; purple/blue palettes; glows; glass and blur panels.
- A second accent colour, or `--signal` used for decoration.
- Inter, Geist, Roboto, Arial or the system UI font as the face.
- Small uppercase "eyebrow" labels above headings; letter-spaced caps.
- Three- or four-card feature grids; icons in coloured circles; "bento" layouts.
- Emoji, sparkles, "AI-powered" badges, fake testimonials, invented stats or logos.
- Card shadows; radii above 10 px; pill-shaped buttons.
- Spinners where the scan can say what it's doing.
- Centred hero copy, slogans, or headings that sell instead of describing.
- Numbers in proportional figures, or data set in the sans.
- Hover effects that move or scale things.
