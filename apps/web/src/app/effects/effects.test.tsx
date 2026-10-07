import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ProbeField } from './probe-field.tsx';
import { ScanBand } from './scan-band.tsx';

// On the server (and before the browser has said it can draw them), both effects are their
// static CSS version: no canvas, nothing that waits on the GPU.
test('the probe field and scan band render their static version first', () => {
  const field = renderToStaticMarkup(<ProbeField />);
  expect(field).toBe(
    '<div class="probe-field" aria-hidden="true"><div class="probe-grid"></div><div class="probe-lens"></div></div>',
  );
  const band = renderToStaticMarkup(<ScanBand />);
  expect(band).toBe(
    '<div class="scan-band" aria-hidden="true"><div class="band-grid"></div><div class="band-signal"></div></div>',
  );
});
