import {
  builtinFingerprints,
  type Detection,
  detectionsWithFolded,
  type Folded,
  type LayerId,
  type Report,
  type Surface,
  surfacesByRole,
} from '@drippa/stackprobe-core';

// How a report reads on the page: pure, so it is tested without rendering.

const NAMES = new Map(builtinFingerprints().map((f) => [f.id, f.name]));

export function techName(id: string): string {
  return NAMES.get(id) ?? id;
}

export function techLabel(detection: Detection): string {
  return detection.version
    ? `${techName(detection.tech)} ${detection.version}`
    : techName(detection.tech);
}

export const KIND_LABELS: Record<Surface['kind'], string> = {
  app: 'Product app',
  marketing: 'Marketing site',
  docs: 'Docs',
  status: 'Status',
  api: 'API',
  auth: 'Sign-in',
  other: 'Other',
  unclassified: 'Not sure',
};

export interface SurfaceTab {
  surface: Surface;
  folded: Folded[];
  detections: Detection[];
  label: string;
}

// Tabs in reading order: the product app first, then marketing, then the rest. When two tabs
// would share a label, the host tells them apart.
export function surfaceTabs(report: Report): SurfaceTab[] {
  const { product, marketing, other, folded } = surfacesByRole(report);
  const tabs = [...product, ...marketing, ...other].map((surface) => ({
    surface,
    folded: folded[surface.id] ?? [],
    detections: detectionsWithFolded(surface, folded[surface.id]),
    label: KIND_LABELS[surface.kind],
  }));
  const counts = new Map<string, number>();
  for (const tab of tabs) counts.set(tab.label, (counts.get(tab.label) ?? 0) + 1);
  return tabs.map((tab) =>
    (counts.get(tab.label) ?? 0) > 1
      ? { ...tab, label: `${tab.label} · ${new URL(tab.surface.url).hostname}` }
      : tab,
  );
}

// The one factual sentence under the domain.
export function verdict(report: Report): string {
  const [first] = surfaceTabs(report);
  if (first?.surface.kind !== 'app') {
    return first?.surface.kind === 'marketing'
      ? 'No product app found. Showing the marketing site only.'
      : "Couldn't tell which surface is the product app.";
  }
  const names = first.detections.map(techLabel);
  if (names.length === 0) return 'Found the product app, but no technology we recognise.';
  return `Product runs on ${list(names)}.`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const LAYER_NAMES: Record<LayerId, string> = {
  http: 'HTTP',
  dns: 'DNS',
  tls: 'TLS',
  bundle: "the page's own scripts",
  browser: 'a real browser',
};

// "HTTP, DNS, TLS and a real browser": the layers that ran successfully somewhere in the scan.
export function layersThatRan(report: Report): string {
  const ran = new Set(report.layersRun.filter((r) => r.status === 'ok').map((r) => r.layer));
  return list(
    (Object.keys(LAYER_NAMES) as LayerId[]).filter((l) => ran.has(l)).map((l) => LAYER_NAMES[l]),
  );
}

export function foundByText(surface: Surface): string | null {
  if (!surface.foundBy) return null;
  if (surface.foundBy.kind === 'subdomain') return 'found as a subdomain';
  return surface.foundBy.text ? `via the "${surface.foundBy.text}" link` : 'via a link';
}

export function scanDuration(createdAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) return null;
  const seconds = Math.round((Date.parse(finishedAt) - Date.parse(createdAt)) / 1000);
  return seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}
