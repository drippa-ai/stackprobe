'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { DotFieldShape } from './dot-field.ts';
import { useShaderAllowed, useTokenColors } from './gate.ts';

// Loaded only while a scan runs and the browser can draw it, so finished reports never fetch it.
const DotCanvas = dynamic(() => import('./dot-canvas.tsx'), { ssr: false });

// Matches the CSS version in globals.css: a dot every 8 px, the band ~20% of a desktop strip.
const SHAPE: DotFieldShape = {
  kind: 'band',
  spacing: 8,
  dotRadius: 1,
  signalRadius: 1.6,
  radius: 120,
  softness: 0.6,
  rest: { x: 0.5, y: 0.5 },
};

// The strip of dots on the running-scan page. The CSS version shows a still signal band; with
// WebGPU the shader fades in and the band sweeps across while the scan runs.
export function ScanBand() {
  const allowed = useShaderAllowed();
  const colors = useTokenColors({ ground: '--surface', dot: '--dot', signal: '--signal' });
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const live = allowed && colors !== null && !unavailable;
  return (
    <div className={live && ready ? 'scan-band live' : 'scan-band'} aria-hidden="true">
      <div className="band-grid" />
      <div className="band-signal" />
      {live ? (
        <DotCanvas
          shape={SHAPE}
          colors={colors}
          onReady={() => setReady(true)}
          onUnavailable={() => setUnavailable(true)}
        />
      ) : null}
    </div>
  );
}
