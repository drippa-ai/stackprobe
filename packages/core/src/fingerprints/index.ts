import { type CompiledFingerprint, compileFingerprints } from '../fingerprint.ts';
import { FINGERPRINT_DEFINITIONS, FINGERPRINTS_VERSION } from './builtin.generated.ts';

export { FINGERPRINTS_VERSION };

let builtin: CompiledFingerprint[] | undefined;

// Our own fingerprints, compiled once on first use.
export function builtinFingerprints(): CompiledFingerprint[] {
  builtin ??= compileFingerprints(FINGERPRINT_DEFINITIONS);
  return builtin;
}
