import type { Layer } from '../layer.ts';
import { httpLayer } from './http.ts';

export { distillHtml, httpLayer } from './http.ts';

// Every layer a scan runs, in no particular order: the runner starts them together.
export const DEFAULT_LAYERS: Layer[] = [httpLayer];
