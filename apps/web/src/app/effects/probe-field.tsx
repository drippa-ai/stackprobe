'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { DotFieldShape } from './dot-field.ts';
import { useShaderAllowed, useTokenColors } from './gate.ts';

// Loaded only when it may run, so other pages and browsers never fetch the renderer.
const DotCanvas = dynamic(() => import('./dot-canvas.tsx'), { ssr: false });

// Matches the CSS version in globals.css: a dot every 16 px, the lens at 72% / 46% until the
// cursor moves, solid for ~40 px and fading out by ~120 px.
const SHAPE: DotFieldShape = {
  kind: 'lens',
  spacing: 16,
  dotRadius: 1.15,
  signalRadius: 2,
  radius: 120,
  softness: 0.7,
  rest: { x: 0.72, y: 0.46 },
};

// The dot field behind the home headline. The CSS version is always drawn first; on a desktop
// browser with WebGPU the shader fades in over it, and the lens follows the cursor.
export function ProbeField() {
  const allowed = useShaderAllowed({ needsHover: true });
  const colors = useTokenColors({ ground: '--page', dot: '--dot', signal: '--signal' });
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const live = allowed && colors !== null && !unavailable;
  return (
    <div className={live && ready ? 'probe-field live' : 'probe-field'} aria-hidden="true">
      <div className="probe-grid" />
      <div className="probe-lens" />
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
