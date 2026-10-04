import type { Detection, Report } from './report.ts';

// Confidence moves smaller than this are noise, not a change in the stack.
export const MIN_CONFIDENCE_CHANGE = 0.05;

export interface DetectionState {
  confidence: number;
  version: string | null;
}

export interface DetectionChange {
  tech: string;
  category: string;
  from: DetectionState;
  to: DetectionState;
}

export interface SurfaceDiff {
  url: string;
  added: Detection[];
  removed: Detection[];
  changed: DetectionChange[];
}

export interface ReportDiff {
  domain: string;
  from: { scannedAt: string; fingerprintsVersion: string };
  to: { scannedAt: string; fingerprintsVersion: string };
  // The scans used different fingerprints, so a change may come from us, not from the site.
  fingerprintsChanged: boolean;
  // A layer failed or timed out in one of the scans, so a removed detection may only be missing
  // evidence rather than gone.
  incomplete: boolean;
  // Only surfaces with changes. Surfaces are matched by URL.
  surfaces: SurfaceDiff[];
}

// What changed between two scans of the same domain, from the older (`from`) to the newer (`to`).
export function diffReports(from: Report, to: Report): ReportDiff {
  const fromSurfaces = new Map(from.surfaces.map((surface) => [surface.url, surface]));
  const toSurfaces = new Map(to.surfaces.map((surface) => [surface.url, surface]));
  const urls = [...new Set([...fromSurfaces.keys(), ...toSurfaces.keys()])];

  const surfaces = urls
    .map((url) =>
      diffDetections(
        url,
        fromSurfaces.get(url)?.detections ?? [],
        toSurfaces.get(url)?.detections ?? [],
      ),
    )
    .filter((diff) => diff.added.length + diff.removed.length + diff.changed.length > 0);

  return {
    domain: to.domain,
    from: { scannedAt: from.scannedAt, fingerprintsVersion: from.fingerprintsVersion },
    to: { scannedAt: to.scannedAt, fingerprintsVersion: to.fingerprintsVersion },
    fingerprintsChanged: from.fingerprintsVersion !== to.fingerprintsVersion,
    incomplete: [from, to].some((report) =>
      report.layersRun.some((run) => run.status === 'failed' || run.status === 'timeout'),
    ),
    surfaces,
  };
}

function diffDetections(url: string, before: Detection[], after: Detection[]): SurfaceDiff {
  const beforeByTech = new Map(before.map((detection) => [detection.tech, detection]));
  const afterByTech = new Map(after.map((detection) => [detection.tech, detection]));
  const changed: DetectionChange[] = [];

  for (const [tech, next] of afterByTech) {
    const prev = beforeByTech.get(tech);
    if (!prev) continue;
    const moved = Math.abs(next.confidence - prev.confidence) >= MIN_CONFIDENCE_CHANGE;
    if (moved || next.version !== prev.version) {
      changed.push({
        tech,
        category: next.category,
        from: { confidence: prev.confidence, version: prev.version },
        to: { confidence: next.confidence, version: next.version },
      });
    }
  }

  return {
    url,
    added: after.filter((detection) => !beforeByTech.has(detection.tech)),
    removed: before.filter((detection) => !afterByTech.has(detection.tech)),
    changed,
  };
}
