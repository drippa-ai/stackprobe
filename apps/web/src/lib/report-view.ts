import {
  builtinFingerprints,
  type Detection,
  detectionsWithFolded,
  type Folded,
  type LayerId,
  type LayerRun,
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

// The technologies the verdict names, so the page can set them apart.
export function verdictNames(report: Report): string[] {
  const [first] = surfaceTabs(report);
  return first?.surface.kind === 'app' ? first.detections.map(techLabel) : [];
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

// Which checks failed, for a partial scan, one entry per host: "HTTP and DNS on docs.acme.test".
export function failedChecks(report: Report): string[] {
  const hosts = new Map(report.surfaces.map((s) => [s.id, new URL(s.url).hostname]));
  const failed = new Map<string, Set<LayerId>>();
  for (const run of report.layersRun) {
    if (run.status === 'ok' || run.status === 'skipped') continue;
    const host = hosts.get(run.surfaceId) ?? run.surfaceId;
    failed.set(host, (failed.get(host) ?? new Set()).add(run.layer));
  }
  const order = Object.keys(LAYER_NAMES) as LayerId[];
  return [...failed].map(
    ([host, layers]) =>
      `${list(order.filter((l) => layers.has(l)).map((l) => LAYER_NAMES[l]))} on ${host}`,
  );
}

export interface ProgressStep {
  layer: LayerId;
  state: 'done' | 'now' | 'waiting';
  text: string;
  failed: number;
  took: string | null;
}

// The checks in the order a scan reaches them. HTTP, DNS and TLS run together.
const STEPS: { layer: LayerId; waiting: string; done: (n: number) => string; now: string }[] = [
  {
    layer: 'http',
    waiting: 'Headers and pages',
    done: (n) => `Read headers and pages on ${plural(n, 'surface')}`,
    now: 'Reading headers, DNS and certificates.',
  },
  {
    layer: 'dns',
    waiting: 'DNS records',
    done: (n) => `Looked up DNS for ${plural(n, 'host')}`,
    now: 'Reading headers, DNS and certificates.',
  },
  {
    layer: 'tls',
    waiting: 'Certificates',
    done: (n) => `Read certificates for ${plural(n, 'host')}`,
    now: 'Reading headers, DNS and certificates.',
  },
  {
    layer: 'browser',
    waiting: 'The product app in a real browser',
    done: (n) => `Loaded ${plural(n, 'page')} in a real browser`,
    now: 'Finding the product app and loading it in a real browser.',
  },
  {
    layer: 'bundle',
    waiting: "The app's own scripts",
    done: (n) => `Read the scripts of ${plural(n, 'page')}`,
    now: "Reading the app's own scripts.",
  },
];

// A running scan's progress from the layers saved so far: what it's doing now, and each check.
export function scanProgress(runs: LayerRun[]): { now: string; steps: ProgressStep[] } {
  let now = 'Writing the report.';
  let found = false;
  const steps = STEPS.map((step): ProgressStep => {
    const mine = runs.filter((r) => r.layer === step.layer);
    if (mine.length > 0) {
      return {
        layer: step.layer,
        state: 'done',
        text: step.done(mine.length),
        failed: mine.filter((r) => r.status === 'failed' || r.status === 'timeout').length,
        took: seconds(Math.max(...mine.map((r) => r.durationMs))),
      };
    }
    const state = found ? 'waiting' : 'now';
    if (!found) now = step.now;
    found = true;
    return { layer: step.layer, state, text: step.waiting, failed: 0, took: null };
  });
  return { now, steps };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}
