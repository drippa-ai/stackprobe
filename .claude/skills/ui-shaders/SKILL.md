---
name: ui-shaders
description: When and how stackprobe's web app may use GPU effects (our own small WebGPU dot-field renderer) — the two allowed places, fallbacks, performance, colour rules and how to check them. Load before adding or changing any shader, canvas animation or animated background in apps/web.
---

# Shaders in stackprobe

Shaders give two moments their character: landing on the home page, and waiting for a scan.
Everywhere else the page stays still, so the data is what you look at. Load `ui-theme` first;
everything here uses its tokens.

## Where shaders are allowed

Only these two. Anything else needs the user's approval first, and an update to this file.

1. **Probe field**, behind the home headline. A still dot grid in `--dot`. Dots near the cursor
   light up in `--signal`, like a lens passing over the page. Only with a mouse: on touch
   devices the static version shows. It fades out to the left so the headline stays readable.
2. **Scan band**, on the running-scan page. A strip of `--dot` dots with a `--signal` band
   sweeping across while the scan runs. It disappears when the report replaces the running state.

Never on: the report, tables, evidence, buttons, text, OG images or email. No shader carries
information; it's atmosphere around the information.

## The renderer

Both effects use our own renderer in `apps/web/src/app/effects/`, not a library:

- `dot-field.ts`: one WGSL fragment shader (dot grid + lens or band) and the loop around it.
  ~2 KB gzipped. Motion maths (`bandCenter`, `follow`) are pure and unit-tested.
- `dot-canvas.tsx`: the canvas component; starts the renderer, reports ready or unavailable.
- `gate.ts`: `useShaderAllowed` (may it run here?) and `useTokenColors` (theme colours as hex).
- `probe-field.tsx`, `scan-band.tsx`: the effects. Each renders its CSS version, and lazily
  loads `dot-canvas.tsx` over it once allowed. Their `SHAPE` constants match the CSS version.

We tried the `shaders` package (shader-effects-inc, MIT) first. Its engine imports all ~200 of
its effects, so any use adds ~720 KB gzipped, and it sends visitors' user agents to its
servers unless told not to. Don't bring it, or any other effect library, back without asking.

To add an effect, extend `dot-field.ts` (a new `kind`), not a new renderer. Keep the shader
one pass, no textures, no extra buffers.

## Rules

1. **Client only, lazy, and only where used.** Effects are client components; the renderer is
   loaded with `next/dynamic` (`ssr: false`) only after the gate passes. A finished report must
   not load it (check in a production build: the dev server preloads lazy chunks).
2. **Static first.** The server renders the CSS version (a `radial-gradient` dot grid in `--dot`,
   plus a static `--signal` lens or band). The canvas sits on top of the same box, transparent
   until its first frame, then fades in over `--dur-considered`. If it never loads, the page
   looks finished anyway.
3. **Fallbacks.** `useShaderAllowed` keeps the static version, and the canvas unmounted, when:
   - there's no `navigator.gpu`, or `requestAdapter()` returns `null`;
   - `prefers-reduced-motion: reduce` matches (it listens for changes);
   - the device saves data (`navigator.connection?.saveData`);
   - for the probe field, there's no mouse (`(hover: hover) and (pointer: fine)`).
   If the renderer can't start or the GPU device is lost, `onUnavailable` removes the canvas.
4. **Pause when unseen.** The renderer stops its frame loop off screen (IntersectionObserver);
   browsers stop animation frames in hidden tabs. The lens only draws while catching up with
   the cursor.
5. **Cheap.** One canvas per page, one draw call per frame. Drawing buffer capped at 2× device
   pixels. Dot spacing matches the CSS version: 16 px on home, 8 px in the band.
6. **Colours from tokens.** `useTokenColors` resolves the oklch tokens to hex and follows
   light/dark changes; the shader writes them as-is, so they match the CSS. The canvas is opaque,
   drawn in the colour behind it (`ground`: `--page` on home, `--surface` in the band).
7. **Quiet.** Signal appears only in the lens or band, never as a fill or glow. The lens follows
   with lag; the band takes `SWEEP_MS` (2.4 s) each way, easing in and out. No twinkle, no
   colour cycling.
8. **Decorative.** The box is `aria-hidden="true"`; the canvas has `pointer-events: none` and the
   renderer reads the cursor from `window`.

## Checking your work

Headless Chromium can draw WebGPU on macOS: launch with `--enable-unsafe-webgpu
--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, against a page on `localhost` (WebGPU
needs a secure context). Plain headless has no adapter, which tests the fallback; SwiftShader
(`--use-webgpu-adapter=swiftshader`) loses the device, which tests `onUnavailable`.

- Screenshot each effect with WebGPU, in light and dark: both look like the CSS version, with
  the lens or band in clear signal green. Move the mouse in steps for the lens; take two
  frames a second apart for the band.
- Without WebGPU and with reduced motion: the static version, nothing moves.
- In a production build (`next build && next start`): a finished report doesn't fetch the
  renderer chunk; the home and running pages do, and nothing goes to another host.
- Then run the `ui-review` skill.
