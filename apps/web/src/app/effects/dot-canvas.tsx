'use client';

import { useEffect, useRef } from 'react';
import {
  type DotField,
  type DotFieldColors,
  type DotFieldShape,
  startDotField,
} from './dot-field.ts';

// The canvas over an effect's CSS version. Calls onReady once the first frame is drawn, and
// onUnavailable if WebGPU can't start or the GPU goes away, so the CSS version stays.
export default function DotCanvas({
  shape,
  colors,
  onReady,
  onUnavailable,
}: {
  shape: DotFieldShape;
  colors: DotFieldColors;
  onReady: () => void;
  onUnavailable: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const field = useRef<DotField | null>(null);
  // The latest values, read by the one-time start below without restarting it.
  const latest = useRef({ shape, colors, onReady, onUnavailable });
  latest.current = { shape, colors, onReady, onUnavailable };

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let cancelled = false;
    const { shape, colors } = latest.current;
    startDotField(element, shape, colors, () => latest.current.onUnavailable()).then(
      (started) => {
        if (cancelled) return started?.destroy();
        if (!started) return latest.current.onUnavailable();
        field.current = started;
        requestAnimationFrame(() => latest.current.onReady());
      },
      () => latest.current.onUnavailable(),
    );
    return () => {
      cancelled = true;
      field.current?.destroy();
      field.current = null;
    };
  }, []);

  useEffect(() => {
    field.current?.setColors(colors);
  }, [colors]);

  return <canvas ref={canvas} className="effect-canvas" />;
}
