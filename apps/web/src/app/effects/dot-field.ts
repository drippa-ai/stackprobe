/// <reference types="@webgpu/types" />
// A dot grid drawn with WebGPU, with dots turning signal-coloured inside a soft lens (following
// the cursor) or a band (sweeping across). One full-screen fragment shader, no dependencies.
// Rules for where and how it's used: .claude/skills/ui-shaders/SKILL.md.

export interface DotFieldColors {
  ground: string; // what's behind the dots, so the canvas can be opaque
  dot: string;
  signal: string;
}

export interface DotFieldShape {
  kind: 'lens' | 'band';
  spacing: number; // CSS px between dots, matching the CSS version
  dotRadius: number; // CSS px
  signalRadius: number; // CSS px, for dots inside the lens or band
  radius: number; // lens radius, or band half-width, in CSS px
  softness: number; // 0–1: how much of the radius is a fade
  rest: { x: number; y: number }; // where the lens sits before the cursor moves, 0–1 of the box
}

export interface DotField {
  setColors(colors: DotFieldColors): void;
  destroy(): void;
}

// The band eases from one end to the other and back, this long each way.
export const SWEEP_MS = 2400;
// The lens closes this fraction of the gap to the cursor every 1/60 s.
const FOLLOW = 0.12;
// Drawing buffer cap, in device pixels per CSS pixel.
const MAX_DPR = 2;

const SHADER = /* wgsl */ `
struct U {
  dpr: f32, spacing: f32, dotR: f32, sigR: f32,
  mode: f32, radius: f32, softness: f32, _pad: f32,
  center: vec2f, _pad2: vec2f,
  ground: vec4f, dot: vec4f, signal: vec4f,
}
@group(0) @binding(0) var<uniform> u: U;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let css = pos.xy / u.dpr;
  let cell = css - u.spacing * floor(css / u.spacing) - vec2f(u.spacing * 0.5);
  var dist: f32;
  if (u.mode < 0.5) { dist = length(css - u.center); } else { dist = abs(css.x - u.center.x); }
  let w = 1.0 - smoothstep(u.radius * (1.0 - u.softness), u.radius, dist);
  let r = mix(u.dotR, u.sigR, w);
  let edge = 0.6 / u.dpr + 0.3;
  let a = 1.0 - smoothstep(r - edge, r + edge, length(cell));
  let c = mix(u.dot.rgb, u.signal.rgb, w);
  return vec4f(mix(u.ground.rgb, c, a), 1.0);
}
`;

// '#1fa836' → [r, g, b] in 0–1. Shader output is written as-is, so colours match the CSS ones.
export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// The band's centre at time t: from fully off the left edge to fully off the right and back,
// easing in and out like cubic-bezier(0.65, 0, 0.35, 1) does.
export function bandCenter(t: number, width: number, halfWidth: number): number {
  const phase = (t / SWEEP_MS) % 2;
  const leg = phase < 1 ? phase : 2 - phase;
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * leg);
  return -halfWidth + eased * (width + 2 * halfWidth);
}

// One step of the lens towards its target, the same at any frame rate.
export function follow(current: number, target: number, ms: number): number {
  return target + (current - target) * (1 - FOLLOW) ** (ms / (1000 / 60));
}

// Starts drawing into the canvas. Resolves null when WebGPU can't be used; onLost is called if
// the GPU goes away later, and the caller should fall back to the CSS version.
export async function startDotField(
  canvas: HTMLCanvasElement,
  shape: DotFieldShape,
  initial: DotFieldColors,
  onLost: () => void,
): Promise<DotField | null> {
  const gpu = 'gpu' in navigator ? navigator.gpu : undefined;
  const adapter = await gpu?.requestAdapter().catch(() => null);
  const device = await adapter?.requestDevice().catch(() => null);
  const context = canvas.getContext('webgpu');
  if (!gpu || !device || !context) return null;

  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: device.createShaderModule({ code: SHADER }), entryPoint: 'vs' },
    fragment: {
      module: device.createShaderModule({ code: SHADER }),
      entryPoint: 'fs',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });
  const uniforms = new Float32Array(24);
  const buffer = device.createBuffer({
    size: uniforms.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer } }],
  });

  let colors = initial;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let visible = true;
  let destroyed = false;
  let frame = 0;
  let last = performance.now();
  const start = last;
  const lens = { x: 0, y: 0, tx: 0, ty: 0, placed: false };

  const draw = () => {
    if (width === 0 || height === 0) return;
    uniforms.set([dpr, shape.spacing, shape.dotRadius, shape.signalRadius]);
    uniforms.set([shape.kind === 'lens' ? 0 : 1, shape.radius, shape.softness, 0], 4);
    uniforms.set([lens.x, lens.y, 0, 0], 8);
    uniforms.set([...hexToRgb(colors.ground), 1], 12);
    uniforms.set([...hexToRgb(colors.dot), 1], 16);
    uniforms.set([...hexToRgb(colors.signal), 1], 20);
    device.queue.writeBuffer(buffer, 0, uniforms);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  // The band always moves; the lens only draws while it's catching up with the cursor.
  const tick = (now: number) => {
    frame = 0;
    if (destroyed || !visible) return;
    const ms = Math.min(now - last, 100);
    last = now;
    let moving = shape.kind === 'band';
    if (shape.kind === 'band') {
      lens.x = bandCenter(now - start, width, shape.radius);
    } else {
      lens.x = follow(lens.x, lens.tx, ms);
      lens.y = follow(lens.y, lens.ty, ms);
      moving = Math.abs(lens.x - lens.tx) + Math.abs(lens.y - lens.ty) > 0.25;
    }
    draw();
    if (moving) schedule();
  };
  const schedule = () => {
    if (!frame && !destroyed && visible) frame = requestAnimationFrame(tick);
  };

  const rest = () => {
    lens.tx = shape.rest.x * width;
    lens.ty = shape.rest.y * height;
    if (!lens.placed) {
      lens.x = lens.tx;
      lens.y = lens.ty;
      lens.placed = true;
    }
  };
  const resize = new ResizeObserver(([entry]) => {
    width = entry?.contentRect.width ?? 0;
    height = entry?.contentRect.height ?? 0;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    rest();
    draw();
    schedule();
  });
  resize.observe(canvas);
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    last = performance.now();
    schedule();
  });
  seen.observe(canvas);

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const box = canvas.getBoundingClientRect();
    lens.tx = e.clientX - box.left;
    lens.ty = e.clientY - box.top;
    schedule();
  };
  const onLeave = () => {
    rest();
    schedule();
  };
  if (shape.kind === 'lens') {
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
  }

  device.lost.then(() => {
    if (!destroyed) onLost();
  });

  return {
    setColors(next) {
      colors = next;
      draw();
    },
    destroy() {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      seen.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      buffer.destroy();
      device.destroy();
    },
  };
}
