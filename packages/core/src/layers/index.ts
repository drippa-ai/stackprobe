import type { Layer } from '../layer.ts';
import { dnsLayer } from './dns.ts';
import { httpLayer } from './http.ts';
import { tlsLayer } from './tls.ts';

export {
  bundleLayer,
  distillScript,
  extractBundleStrings,
  firstPartyScripts,
  isScript,
  MAX_SCRIPTS,
} from './bundle.ts';
export { dnsLayer } from './dns.ts';
export { distillHtml, httpLayer } from './http.ts';
export { lookupAsn, tlsLayer } from './tls.ts';

// Every layer a scan runs, in no particular order: the runner starts them together.
export const DEFAULT_LAYERS: Layer[] = [httpLayer, dnsLayer, tlsLayer];
