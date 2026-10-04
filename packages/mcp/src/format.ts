import {
  type Detection,
  type ReportDiff,
  type ScanRecord,
  type Surface,
  surfacesByRole,
} from '@drippa/stackprobe-core';

const SURFACE_KINDS: Record<Surface['kind'], string> = {
  unclassified: 'not sure what this is',
  marketing: 'marketing site',
  app: 'product app',
  api: 'API',
  docs: 'docs',
  status: 'status page',
  auth: 'sign-in',
  other: 'other',
};

function foundBy(surface: Surface): string {
  if (!surface.foundBy) return '';
  if (surface.foundBy.kind === 'subdomain') return '; found as a subdomain';
  return surface.foundBy.text
    ? `; found via the "${surface.foundBy.text}" link`
    : '; found via a link';
}

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
  // Product first: marketing findings never stand in for the product's stack.
  const { product, marketing, other } = surfacesByRole(scan.report);
  if (product.length === 0) {
    lines.push(
      marketing.length > 0
        ? 'No product app found; showing the marketing site only.'
        : 'Could not tell which surface is the product app, so none is presented as the product.',
    );
  }
  for (const surface of [...product, ...marketing, ...other]) {
    const sure =
      surface.kindConfidence !== null ? ` ${Math.round(surface.kindConfidence * 100)}%` : '';
    const why = surface.kindReasons?.length ? ` because: ${surface.kindReasons.join(', ')}` : '';
    lines.push(
      '',
      `Surface ${surface.url} (${SURFACE_KINDS[surface.kind]}${sure}${why}${foundBy(surface)})`,
    );
    lines.push(
      ...(surface.detections.length
        ? surface.detections.map(detectionLine)
        : ['- nothing detected']),
    );
  }
  const runs = scan.report.layersRun;
  const failed = runs.filter((run) => run.status === 'failed' || run.status === 'timeout');
  lines.push(
    '',
    failed.length === 0
      ? `All ${runs.length} checks ran.`
      : `Checks that did not finish: ${failed
          .map((run) => `${run.layer} on ${run.surfaceId} (${run.error?.message ?? run.status})`)
          .join('; ')}`,
  );
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
