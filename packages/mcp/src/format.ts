import type { Detection, ReportDiff, ScanRecord, Surface } from '@drippa/stackprobe-core';

const SURFACE_KINDS: Record<Surface['kind'], string> = {
  unclassified: 'not yet known whether this is the product app or its marketing site',
  marketing: 'marketing site',
  app: 'product app',
  api: 'API',
  docs: 'docs',
  status: 'status page',
  auth: 'sign-in',
  other: 'other',
};

const percent = (confidence: number) => `${Math.round(confidence * 100)}%`;

function detectionLine(detection: Detection): string {
  const version = detection.version ? ` ${detection.version}` : '';
  return `- ${detection.tech}${version} (${detection.category}) ${percent(detection.confidence)}`;
}

// A short plain-text report for the agent. The full report is in the structured result.
export function formatScan(scan: ScanRecord): string {
  const lines = [`${scan.domain}: scan ${scan.id}, ${scan.status}, started ${scan.createdAt}`];
  if (!scan.report) {
    lines.push('The scan is still running. Call get_scan again in a few seconds.');
    return lines.join('\n');
  }
  for (const surface of scan.report.surfaces) {
    lines.push('', `Surface ${surface.url} (${SURFACE_KINDS[surface.kind]})`);
    lines.push(
      ...(surface.detections.length
        ? surface.detections.map(detectionLine)
        : ['- nothing detected']),
    );
  }
  const checks = scan.report.layersRun.map((run) =>
    run.error ? `${run.layer} ${run.status} (${run.error.message})` : `${run.layer} ${run.status}`,
  );
  lines.push('', `Checks: ${checks.join(', ')}`);
  if (scan.status === 'partial') {
    lines.push('Some checks failed, so this result may be incomplete.');
  }
  lines.push('Use explain_detection to see the evidence behind a finding.');
  return lines.join('\n');
}

export function formatExplanation(scan: ScanRecord, surface: Surface, detection: Detection) {
  const lines = [
    `${detection.tech} on ${surface.url} (${SURFACE_KINDS[surface.kind]}), scan ${scan.id}`,
    `Category: ${detection.category}. Version: ${detection.version ?? 'unknown'}.`,
    `Confidence: ${percent(detection.confidence)}.`,
    '',
    'Evidence:',
    ...detection.evidence.map(
      (e) => `- ${e.detail} [${e.type} by the ${e.layer} layer, weight ${percent(e.weight)}]`,
    ),
    '',
    'How confidence is computed: within one layer only the strongest clue counts, because clues',
    'from the same response are not independent. Clues from different layers are combined as',
    'independent: 1 - (1 - a)(1 - b)... Confidence never reaches 100%.',
  ];
  return lines.join('\n');
}

export function formatDiff(diff: ReportDiff): string {
  const lines = [`${diff.domain}: changes from ${diff.from.scannedAt} to ${diff.to.scannedAt}`];
  if (diff.fingerprintsChanged) {
    lines.push('Note: the scans used different fingerprints, so some changes may come from us.');
  }
  if (diff.incomplete) {
    lines.push('Note: a check failed in one of the scans, so "removed" may only mean "not seen".');
  }
  if (diff.surfaces.length === 0) {
    lines.push('No changes.');
    return lines.join('\n');
  }
  for (const surface of diff.surfaces) {
    lines.push('', `Surface ${surface.url}`);
    for (const d of surface.added)
      lines.push(`+ ${d.tech} (${d.category}) ${percent(d.confidence)}`);
    for (const d of surface.removed) lines.push(`- ${d.tech} (${d.category})`);
    for (const c of surface.changed) {
      const version =
        c.from.version !== c.to.version
          ? `, version ${c.from.version ?? 'unknown'} → ${c.to.version ?? 'unknown'}`
          : '';
      lines.push(
        `~ ${c.tech} (${c.category}) ${percent(c.from.confidence)} → ${percent(c.to.confidence)}${version}`,
      );
    }
  }
  return lines.join('\n');
}
