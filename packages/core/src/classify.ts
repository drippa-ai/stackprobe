import { detect } from './detect.ts';
import { registrableDomain } from './discover.ts';
import type { CompiledFingerprint } from './fingerprint.ts';
import { builtinFingerprints } from './fingerprints/index.ts';
import type { Signal, SurfaceTarget } from './layer.ts';
import type { Detection, Report, Surface, SurfaceKind } from './report.ts';
import type { LayerResult } from './runner.ts';

// The kinds a surface can be classified as. 'unclassified' means we could not tell.
export type ClassifiedKind = Exclude<SurfaceKind, 'unclassified'>;

export const KIND_DESCRIPTIONS: Record<ClassifiedKind, string> = {
  marketing: 'Marketing or landing site: explains and sells the product, pricing, blog, careers',
  app: 'The product itself: the web app users work in, including its log-in and sign-up pages',
  api: 'An API endpoint meant for programs, not people: JSON responses, API gateways',
  docs: 'Documentation: guides, API reference, help center',
  status: 'Status page: uptime and incident reports',
  auth: 'A sign-in page hosted by an identity provider rather than by the product',
  other: 'None of the above',
};

// A small, swappable model that picks one option and says how sure it is. Rules decide first;
// a Decider only settles what they cannot. Implementations live outside core.
export interface Decider {
  choose<T extends string>(question: {
    instructions: string;
    options: Record<T, string>;
    state: unknown;
  }): Promise<{ choice: T; probabilities: Record<T, number>; confidence: number }>;
}

export interface Classification {
  kind: SurfaceKind;
  // Null when unclassified.
  confidence: number | null;
  // Why, for showing the work.
  reasons: string[];
  decidedBy: 'rules' | 'decider' | 'none';
}

interface Vote {
  kind: ClassifiedKind;
  weight: number;
  reason: string;
}

// Rules settle a surface at this confidence or above; below it, a Decider is asked.
export const RULES_SETTLE = 0.75;
// Without a Decider, rules still name a kind from this confidence; below it, unclassified.
export const RULES_MINIMUM = 0.6;
// A Decider's answer counts only this sure. On our ground truth Jev was 0.93 or more on the
// marketing sites it got right, and 0.59 to 0.87 on the product homepages it got wrong: below
// this, not knowing beats being wrong.
export const DECIDER_MINIMUM = 0.9;

const APP_SECTIONS = /^(?:login|log-in|signin|sign-in|auth|dashboard|console|app|account)$/i;
const SIGNUP_SECTIONS = /^(?:signup|sign-up|register|onboarding|get-started)$/i;
const APP_PREFIXES = new Set(['app', 'dashboard', 'console', 'portal', 'my', 'account']);
const APP_LINK =
  /\b(?:log ?in|sign ?in|dashboard|console|open (?:the )?app|go to (?:the )?app|launch app|my account)\b/i;
const SIGNUP_LINK =
  /\b(?:sign ?up|register|get started|start (?:for )?free|try (?:it )?(?:for )?free)\b/i;
const SITE_BUILDERS = new Set(['framer', 'webflow']);

// What the rules can tell from a surface's URL, how it was found, its headers and detections.
export function ruleVotes(
  surface: SurfaceTarget,
  signals: Signal[],
  detections: Detection[],
): Vote[] {
  const votes: Vote[] = [];
  const url = new URL(surface.url);
  const site = registrableDomain(url.hostname);
  const prefix = url.hostname.endsWith(`.${site}`) ? url.hostname.slice(0, -site.length - 1) : '';
  const section = url.pathname.split('/')[1] ?? '';

  for (const detection of detections) {
    if (SITE_BUILDERS.has(detection.tech)) {
      votes.push({ kind: 'marketing', weight: 0.9, reason: `built with ${detection.tech}` });
    }
  }

  if (APP_SECTIONS.test(section))
    votes.push({ kind: 'app', weight: 0.8, reason: `/${section} page` });
  if (SIGNUP_SECTIONS.test(section))
    votes.push({ kind: 'app', weight: 0.6, reason: `/${section} page` });
  if (/^docs?$/i.test(section)) votes.push({ kind: 'docs', weight: 0.85, reason: '/docs page' });
  if (/^status$/i.test(section))
    votes.push({ kind: 'status', weight: 0.85, reason: '/status page' });

  if (APP_PREFIXES.has(prefix))
    votes.push({ kind: 'app', weight: 0.8, reason: `${prefix}. subdomain` });
  if (prefix === 'docs') votes.push({ kind: 'docs', weight: 0.85, reason: 'docs. subdomain' });
  if (prefix === 'status')
    votes.push({ kind: 'status', weight: 0.85, reason: 'status. subdomain' });
  if (prefix === 'api') votes.push({ kind: 'api', weight: 0.8, reason: 'api. subdomain' });

  const text = surface.foundBy?.kind === 'link' ? (surface.foundBy.text ?? '') : '';
  if (APP_LINK.test(text)) votes.push({ kind: 'app', weight: 0.8, reason: `"${text}" link` });
  else if (SIGNUP_LINK.test(text))
    votes.push({ kind: 'app', weight: 0.6, reason: `"${text}" link` });

  const http = signals.filter((s) => s.layer === 'http');
  const header = (name: string) => http.find((s) => s.kind === 'header' && s.key === name)?.value;
  if (/\bjson\b/i.test(header('content-type') ?? '')) {
    votes.push({ kind: 'api', weight: 0.8, reason: 'answers with JSON' });
  }
  if (header('x-clerk-auth-status')) {
    votes.push({ kind: 'app', weight: 0.6, reason: 'signed-in check by Clerk' });
  }

  // The homepage of a whole domain is usually marketing, but sometimes the product lives there.
  if (!surface.foundBy && url.pathname === '/' && (prefix === '' || prefix === 'www')) {
    votes.push({ kind: 'marketing', weight: 0.5, reason: 'homepage of the domain' });
  }
  return votes;
}

// Votes for the same kind combine like independent clues; a strong rival kind lowers the result.
export function classifyByRules(votes: Vote[]): Classification {
  const byKind = new Map<ClassifiedKind, { score: number; reasons: string[] }>();
  for (const vote of votes) {
    const entry = byKind.get(vote.kind) ?? { score: 0, reasons: [] };
    entry.score = 1 - (1 - entry.score) * (1 - vote.weight);
    entry.reasons.push(vote.reason);
    byKind.set(vote.kind, entry);
  }
  const ranked = [...byKind.entries()].sort((a, b) => b[1].score - a[1].score);
  const [top, second] = ranked;
  if (!top) return { kind: 'unclassified', confidence: null, reasons: [], decidedBy: 'none' };
  const confidence = round(top[1].score * (1 - 0.5 * (second?.[1].score ?? 0)));
  return { kind: top[0], confidence, reasons: top[1].reasons, decidedBy: 'rules' };
}

export interface ClassifyOptions {
  decider?: Decider;
  fingerprints?: CompiledFingerprint[];
}

// Classifies each surface: rules first, then the Decider for what rules leave open.
export async function classifySurfaces(
  surfaces: { target: SurfaceTarget; results: LayerResult[] }[],
  options: ClassifyOptions = {},
): Promise<Record<string, Classification>> {
  const fingerprints = options.fingerprints ?? builtinFingerprints();
  const out: Record<string, Classification> = {};
  await Promise.all(
    surfaces.map(async ({ target, results }) => {
      const signals = results.flatMap((result) => result.signals);
      const detections = detect(signals, fingerprints);
      const rules = classifyByRules(ruleVotes(target, signals, detections));
      if ((rules.confidence ?? 0) >= RULES_SETTLE || !options.decider) {
        out[target.id] =
          (rules.confidence ?? 0) >= RULES_MINIMUM
            ? rules
            : { kind: 'unclassified', confidence: null, reasons: rules.reasons, decidedBy: 'none' };
        return;
      }
      let decision: {
        choice: ClassifiedKind;
        probabilities: Record<ClassifiedKind, number>;
        confidence: number;
      };
      try {
        decision = await options.decider.choose(kindQuestion(target, signals, detections));
      } catch {
        // A model outage or an empty credit balance must not fail the scan: rules only, then.
        out[target.id] =
          (rules.confidence ?? 0) >= RULES_MINIMUM
            ? { ...rules, reasons: [...rules.reasons, 'decision model unavailable'] }
            : {
                kind: 'unclassified',
                confidence: null,
                reasons: [...rules.reasons, 'decision model unavailable'],
                decidedBy: 'none',
              };
        return;
      }
      const sure = decision.probabilities[decision.choice] ?? decision.confidence;
      if (sure < DECIDER_MINIMUM) {
        const unsure = `decision model unsure (${Math.round(sure * 100)}% ${decision.choice})`;
        out[target.id] =
          (rules.confidence ?? 0) >= RULES_MINIMUM
            ? { ...rules, reasons: [...rules.reasons, unsure] }
            : {
                kind: 'unclassified',
                confidence: null,
                reasons: [...rules.reasons, unsure],
                decidedBy: 'none',
              };
        return;
      }
      out[target.id] = {
        kind: decision.choice,
        confidence: round(sure),
        reasons: [...rules.reasons, 'judged by the decision model'],
        decidedBy: 'decider',
      };
    }),
  );
  return out;
}

// The question a Decider gets about one surface.
export function kindQuestion(target: SurfaceTarget, signals: Signal[], detections: Detection[]) {
  return {
    instructions:
      'What kind of web surface is this? Judge from its address, how the scan reached it, ' +
      'its title and description, the links on it, and the technologies detected on it.',
    options: KIND_DESCRIPTIONS,
    state: surfaceState(target, signals, detections),
  };
}

// Public facts about a surface, for a Decider. Never cookie values or anything private.
export function surfaceState(target: SurfaceTarget, signals: Signal[], detections: Detection[]) {
  const meta = (key: string) =>
    signals.find((s) => s.layer === 'http' && s.kind === 'meta' && s.key === key)?.value;
  const links = signals
    .filter((s) => s.kind === 'anchor' && s.key)
    .map((s) => s.key as string)
    .filter((text, i, all) => all.indexOf(text) === i)
    .slice(0, 40);
  return {
    url: target.url,
    reachedBy:
      target.foundBy?.kind === 'link'
        ? `a link on the homepage saying "${target.foundBy.text ?? ''}"`
        : target.foundBy?.kind === 'subdomain'
          ? 'a common subdomain that exists'
          : 'it is the address that was asked for',
    title: meta('og:title') ?? meta('twitter:title') ?? null,
    description: meta('description') ?? meta('og:description') ?? null,
    contentType:
      signals.find((s) => s.layer === 'http' && s.kind === 'header' && s.key === 'content-type')
        ?.value ?? null,
    linkTexts: links,
    technologies: detections.map((d) => `${d.tech} (${d.category})`),
  };
}

// The report's surfaces grouped for display: the product first, then marketing, then the rest.
export function surfacesByRole(report: Report): {
  product: Surface[];
  marketing: Surface[];
  other: Surface[];
} {
  const byConfidence = (a: Surface, b: Surface) =>
    (b.kindConfidence ?? 0) - (a.kindConfidence ?? 0);
  return {
    product: report.surfaces.filter((s) => s.kind === 'app').sort(byConfidence),
    marketing: report.surfaces.filter((s) => s.kind === 'marketing').sort(byConfidence),
    other: report.surfaces.filter((s) => s.kind !== 'app' && s.kind !== 'marketing'),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
