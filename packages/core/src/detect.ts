import type { CompiledFingerprint, CompiledRule } from './fingerprint.ts';
import type { Signal } from './layer.ts';
import type { Detection, Evidence, LayerId } from './report.ts';

// Nothing is certain from the outside.
export const MAX_CONFIDENCE = 0.99;
export const DEFAULT_MIN_CONFIDENCE = 0.3;
const MAX_DETAIL_LENGTH = 200;

export interface DetectOptions {
  minConfidence?: number;
}

interface Hit {
  rule: CompiledRule;
  signal: Signal;
  version: string | null;
}

// Turns the signals from one surface into detections.
//
// Confidence: a rule that fires many times counts once. Within a layer the strongest rule wins,
// because clues from the same layer usually come from the same response and are not independent.
// Across layers the clues are combined as independent: 1 - (1 - a)(1 - b)...
export function detect(
  signals: Signal[],
  fingerprints: CompiledFingerprint[],
  options: DetectOptions = {},
): Detection[] {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const detections: Detection[] = [];

  for (const fingerprint of fingerprints) {
    const hitsByRule = new Map<string, Hit[]>();
    for (const rule of fingerprint.rules) {
      for (const signal of signals) {
        const hit = matchRule(rule, signal);
        if (!hit) continue;
        const hits = hitsByRule.get(rule.id) ?? [];
        hits.push(hit);
        hitsByRule.set(rule.id, hits);
      }
    }
    if (hitsByRule.size === 0) continue;

    const evidence: Evidence[] = [];
    const strongestPerLayer = new Map<LayerId, number>();
    let version: { value: string; weight: number } | null = null;

    for (const hits of hitsByRule.values()) {
      const [first] = hits as [Hit, ...Hit[]];
      const { rule } = first;
      evidence.push({
        type: 'observed',
        layer: rule.layer,
        ruleId: `${fingerprint.id}/${rule.id}`,
        detail: describe(first, hits.length),
        weight: rule.weight,
      });
      strongestPerLayer.set(
        rule.layer,
        Math.max(strongestPerLayer.get(rule.layer) ?? 0, rule.weight),
      );
      const withVersion = hits.find((hit) => hit.version);
      if (withVersion?.version && (!version || rule.weight > version.weight)) {
        version = { value: withVersion.version, weight: rule.weight };
      }
    }

    let doubt = 1;
    for (const weight of strongestPerLayer.values()) doubt *= 1 - weight;
    const confidence = round(Math.min(1 - doubt, MAX_CONFIDENCE));
    if (confidence < minConfidence) continue;

    evidence.sort((a, b) => b.weight - a.weight || a.ruleId.localeCompare(b.ruleId));
    detections.push({
      tech: fingerprint.id,
      category: fingerprint.category,
      version: version?.value ?? null,
      confidence,
      evidence,
    });
  }

  return detections.sort((a, b) => b.confidence - a.confidence || a.tech.localeCompare(b.tech));
}

function matchRule(rule: CompiledRule, signal: Signal): Hit | null {
  if (signal.layer !== rule.layer || signal.kind !== rule.signal) return null;
  if (rule.key !== undefined && signal.key?.toLowerCase() !== rule.key.toLowerCase()) return null;
  const result = rule.test(signal.value);
  if (!result) return null;
  const version =
    rule.version && typeof result !== 'boolean'
      ? rule.version.replace(/\$(\d)/g, (_, group: string) => result[Number(group)] ?? '')
      : null;
  return { rule, signal, version: version || null };
}

function describe(hit: Hit, count: number): string {
  const { rule, signal } = hit;
  const seen = signal.key
    ? `${signal.kind} ${signal.key}: ${signal.value}`
    : `${signal.kind}: ${signal.value}`;
  let detail = rule.detail ? `${rule.detail} (${seen})` : seen;
  if (detail.length > MAX_DETAIL_LENGTH) detail = `${detail.slice(0, MAX_DETAIL_LENGTH - 1)}…`;
  return count > 1 ? `${detail} (+${count - 1} more)` : detail;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
