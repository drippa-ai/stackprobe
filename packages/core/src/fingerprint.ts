import { z } from 'zod';
import { SIGNAL_KINDS } from './layer.ts';
import { LayerId } from './report.ts';

// A fingerprint is the list of clues that identify one technology. Each rule watches one kind of
// signal and says how strongly a match points to the technology.
// String matchers ignore case; regex matchers do not, unless the pattern says so.

const MAX_REGEX_LENGTH = 300;
const IPV4_CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

const Matcher = z.union([
  z.strictObject({ exists: z.literal(true) }),
  z.strictObject({ equals: z.string().min(1) }),
  z.strictObject({ prefix: z.string().min(1) }),
  z.strictObject({ suffix: z.string().min(1) }),
  z.strictObject({ contains: z.string().min(1) }),
  z.strictObject({ regex: z.string().min(1).max(MAX_REGEX_LENGTH) }),
  // IPv4 only for now.
  z.strictObject({ cidr: z.array(z.string().regex(IPV4_CIDR)).min(1) }),
]);
export type Matcher = z.infer<typeof Matcher>;

const Rule = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  layer: LayerId,
  signal: z.enum(SIGNAL_KINDS),
  // For signals with a name, such as headers and meta tags. Compared case-insensitively.
  key: z.string().min(1).optional(),
  match: Matcher,
  weight: z.number().gt(0).max(1),
  detail: z.string().optional(),
  // Built from regex capture groups, e.g. "$1".
  version: z.string().optional(),
});
export type Rule = z.infer<typeof Rule>;

export const Fingerprint = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  category: z.string().min(1),
  website: z.url().optional(),
  rules: z.array(Rule).min(1),
});
export type Fingerprint = z.infer<typeof Fingerprint>;

export interface CompiledRule extends Rule {
  test(value: string): RegExpExecArray | boolean;
}

export interface CompiledFingerprint extends Omit<Fingerprint, 'rules'> {
  rules: CompiledRule[];
}

export class FingerprintError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid fingerprints:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'FingerprintError';
    this.problems = problems;
  }
}

// Validates fingerprint definitions and prepares their matchers. Throws a FingerprintError
// listing every problem, so a bad file fails loudly at load time rather than mid-scan.
export function compileFingerprints(definitions: unknown[]): CompiledFingerprint[] {
  const problems: string[] = [];
  const compiled: CompiledFingerprint[] = [];
  const ids = new Set<string>();

  definitions.forEach((definition, index) => {
    const parsed = Fingerprint.safeParse(definition);
    if (!parsed.success) {
      const label = (definition as { id?: unknown })?.id ?? `#${index}`;
      for (const issue of parsed.error.issues) {
        problems.push(`${label}: ${issue.path.join('.')}: ${issue.message}`);
      }
      return;
    }
    const fingerprint = parsed.data;
    if (ids.has(fingerprint.id)) problems.push(`${fingerprint.id}: duplicate fingerprint id`);
    ids.add(fingerprint.id);

    const ruleIds = new Set<string>();
    const rules: CompiledRule[] = [];
    for (const rule of fingerprint.rules) {
      const where = `${fingerprint.id}/${rule.id}`;
      if (ruleIds.has(rule.id)) problems.push(`${where}: duplicate rule id`);
      ruleIds.add(rule.id);
      if (rule.version && !('regex' in rule.match)) {
        problems.push(`${where}: version needs a regex matcher`);
      }
      try {
        rules.push({ ...rule, test: compileMatcher(rule.match) });
      } catch (error) {
        problems.push(`${where}: ${(error as Error).message}`);
      }
    }
    compiled.push({ ...fingerprint, rules });
  });

  if (problems.length > 0) throw new FingerprintError(problems);
  return compiled;
}

function compileMatcher(match: Matcher): CompiledRule['test'] {
  if ('exists' in match) return () => true;
  if ('equals' in match) {
    const expected = match.equals.toLowerCase();
    return (value) => value.toLowerCase() === expected;
  }
  if ('prefix' in match) {
    const expected = match.prefix.toLowerCase();
    return (value) => value.toLowerCase().startsWith(expected);
  }
  if ('suffix' in match) {
    const expected = match.suffix.toLowerCase();
    return (value) => value.toLowerCase().endsWith(expected);
  }
  if ('contains' in match) {
    const expected = match.contains.toLowerCase();
    return (value) => value.toLowerCase().includes(expected);
  }
  if ('regex' in match) {
    let regex: RegExp;
    try {
      regex = new RegExp(match.regex);
    } catch {
      throw new Error(`regex does not compile: ${match.regex}`);
    }
    return (value) => regex.exec(value) ?? false;
  }
  const ranges = match.cidr.map(parseCidr);
  return (value) => {
    const ip = parseIpv4(value);
    return ip !== null && ranges.some(([base, mask]) => (ip & mask) >>> 0 === base);
  };
}

function parseIpv4(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  let ip = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    ip = ip * 256 + Number(part);
  }
  return ip >>> 0;
}

function parseCidr(cidr: string): [base: number, mask: number] {
  const [address = '', bits = ''] = cidr.split('/');
  const ip = parseIpv4(address);
  const prefix = Number(bits);
  if (ip === null || prefix > 32) throw new Error(`invalid CIDR range: ${cidr}`);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return [(ip & mask) >>> 0, mask];
}
