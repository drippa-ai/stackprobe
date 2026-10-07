'use client';

import { useEffect, useState } from 'react';

// Shader helpers shared by the probe field and the scan band. Rules: the ui-shaders skill.

type GpuNavigator = Navigator & {
  gpu?: { requestAdapter(): Promise<unknown> };
  connection?: { saveData?: boolean };
};

// Whether a shader may run here: WebGPU with an adapter, no reduced motion, no data saving, and
// for effects that follow the cursor, a mouse. Starts false, so the server render and first paint
// are always the static version.
export function useShaderAllowed({ needsHover = false } = {}): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const nav = navigator as GpuNavigator;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const hover = matchMedia('(hover: hover) and (pointer: fine)');
    let gpu = false;
    let cancelled = false;
    const update = () =>
      setAllowed(
        gpu &&
          !reduced.matches &&
          nav.connection?.saveData !== true &&
          (!needsHover || hover.matches),
      );
    nav.gpu?.requestAdapter().then(
      (adapter) => {
        if (cancelled) return;
        gpu = adapter != null;
        update();
      },
      () => {},
    );
    reduced.addEventListener('change', update);
    hover.addEventListener('change', update);
    return () => {
      cancelled = true;
      reduced.removeEventListener('change', update);
      hover.removeEventListener('change', update);
    };
  }, [needsHover]);
  return allowed;
}

// The theme's colours as hex, which shader props need; tokens.css defines them in oklch.
// Resolved again when the system switches between light and dark.
export function useTokenColors<K extends string>(
  tokens: Record<K, string>,
): Record<K, string> | null {
  const [colors, setColors] = useState<Record<K, string> | null>(null);
  const key = JSON.stringify(tokens);
  useEffect(() => {
    const names = JSON.parse(key) as Record<K, string>;
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    const resolve = () => setColors(resolveTokens(names));
    resolve();
    scheme.addEventListener('change', resolve);
    return () => scheme.removeEventListener('change', resolve);
  }, [key]);
  return colors;
}

function resolveTokens<K extends string>(tokens: Record<K, string>): Record<K, string> | null {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.append(probe);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  try {
    if (!context) return null;
    const out = {} as Record<K, string>;
    for (const [name, token] of Object.entries(tokens) as [K, string][]) {
      probe.style.color = `var(${token})`;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(probe).color;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
      out[name] = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
    return out;
  } finally {
    probe.remove();
  }
}
