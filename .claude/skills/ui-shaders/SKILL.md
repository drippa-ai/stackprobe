---
name: ui-shaders
description: When and how stackprobe's web app may use GPU shader effects (the MIT `shaders` package, WebGPU) — the two allowed places, fallbacks, performance and colour rules. Load before adding or changing any shader, canvas animation or animated background in apps/web.
---

# Shaders in stackprobe

Shaders give two moments their character: landing on the home page, and waiting for a scan.
Everywhere else the page stays still, so the data is what you look at. Load `ui-theme` first;
everything here uses its tokens.

## Where shaders are allowed

Only these two. Anything else needs the user's approval first, and an update to this file.

1. **Probe field**, behind the home headline. A still dot grid in `--dot`. Dots near the cursor
   light up in `--signal`, like a lens passing over the page. On touch devices the lens drifts
   slowly by itself. It fades out to the left so the headline stays readable.
2. **Scan band**, on the running-scan page. A strip of `--dot` dots with a `--signal` band
   sweeping across while the scan runs. It disappears when the report replaces the running state.

Never on: the report, tables, evidence, buttons, text, OG images or email. No shader carries
information; it's atmosphere around the information.

## The package

[`shaders`](https://github.com/shader-effects-inc/shaders) (npm `shaders`, MIT). The engine and
components are free; presets, the online editor and `npx shaders install <preset>` are Pro. We
don't use Pro, and we don't run `npx shaders connect` (it signs in and writes a config): compose
by hand from the free components.

- Component API and props: the upstream skill (`npx skills add shader-effects-inc/shaders`, or
  read https://github.com/shader-effects-inc/shaders/blob/main/skills/shaders/SKILL.md) and the
  full prop reference at https://shaders.com/llms-full.txt. Check props there; don't guess.
- React import: `shaders/react`. `<Shader>` renders one `<canvas>`; children are layers, first at
  the bottom. Size it with CSS on `<Shader>`, never on the inner canvas.
- Useful parts for us: `DotGrid` (`color`, `density`, `dotSize`, `speed`), `Circle` with
  `center={{ type: 'mouse-position', smoothing, momentum }}` as a mask (`id` + `visible={false}`
  on the mask, `maskSource` on the masked layer), and `auto-animate` props for the band.
- Colour props take hex strings, but our tokens are oklch CSS variables. Resolve the token at
  runtime (read `getComputedStyle` of an element that uses it and convert to hex through a 1×1
  canvas), and re-resolve when `prefers-color-scheme` changes. Never hard-code a colour.

## Rules

1. **Client only, lazy, and only where used.** The component file starts with `'use client'` and
   is loaded with `next/dynamic` (`ssr: false`) from the home and running-scan views only. The
   report page must not ship the `shaders` package; check the build output.
2. **Static first.** The server renders the CSS version (a `radial-gradient` dot grid in `--dot`,
   plus a static `--signal` lens or band). The shader mounts on top of the same box at the same
   size once ready, so nothing shifts. If it never loads, the page looks finished anyway.
3. **Fallbacks.** The package has no built-in fallback. Keep the static version, and don't
   mount the shader, when:
   - `!('gpu' in navigator)`, or `navigator.gpu.requestAdapter()` returns `null`;
   - `prefers-reduced-motion: reduce` matches (listen for changes);
   - the device saves data (`navigator.connection?.saveData`).
4. **Pause when unseen.** Stop rendering when the box is off screen (`IntersectionObserver`) or
   the tab is hidden (`visibilitychange`), and unmount the probe field when a scan starts.
5. **Cheap.** One `<Shader>` per page; three layers at most; no blur, glass, 3D, particles or
   post-processing. Keep the dot density close to the CSS version (one dot every 16 px on home,
   8 px in the band). Cap the drawing buffer at 2× device pixels.
6. **Quiet.** Signal appears only in the lens or band, never as a fill or glow. Movement is slow:
   the lens follows with smoothing ≥ 0.1; the band takes ~2.4 s per sweep with `--ease-in-out`.
   No twinkle, no colour cycling.
7. **Decorative.** The box is `aria-hidden="true"` and never takes focus or pointer events away
   from the content above it (`pointer-events: none` on the overlay; track the cursor on the
   section instead).

## Checking your work

- Run the page in a WebGPU browser and in one without (Firefox on macOS, or Chrome with
  `--disable-features=WebGPU`): both look finished.
- Turn on reduced motion: nothing moves.
- Switch the system between light and dark with the page open: the dots change colour.
- `pnpm build` and confirm the report route's JavaScript didn't grow.
- Then run the `ui-review` skill.
