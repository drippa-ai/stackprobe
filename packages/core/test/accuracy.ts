import { existsSync } from 'node:fs';
import { builtinFingerprints, FINGERPRINTS_VERSION } from '../src/fingerprints/index.ts';
import { scan } from '../src/scan.ts';
import { DOMAINS_DIR, loadRecording, RECORDINGS_DIR, ReplayNet } from './fixtures.ts';
import type { GroundTruthRow } from './ground-truth.ts';

// How well scans of the recorded ground-truth surfaces match what their sources say.
export const ACCURACY_FILE = new URL('../../../fixtures/accuracy.md', import.meta.url);

export interface TechScore {
  tech: string;
  hasFingerprint: boolean;
  // Listed as present and detected.
  found: string[];
  // Listed as present, not detected.
  missed: string[];
  // Listed as absent, but detected.
  wrong: string[];
}

export interface Accuracy {
  techs: TechScore[];
  // Detected, but the ground truth says nothing either way.
  unverified: { recording: string; tech: string }[];
  // Surfaces left out of the scores, and why.
  notScored: { recording: string; reason: string }[];
  scored: number;
  total: number;
  discovery: Discovery;
}

// Whether scanning a company's homepage finds the product app the ground truth names.
export interface Discovery {
  found: { app: string; via: string }[];
  // With the surfaces the scan did find, to show what it saw instead.
  missed: { app: string; surfaces: string[] }[];
  notRecorded: string[];
}

// A scanned surface is the app when it is on the same host, and, for an app that lives under a
// path of a shared host (acme.com/login), in the same first path segment.
export function sameSurface(app: string, surface: string): boolean {
  const a = new URL(app);
  const b = new URL(surface);
  // acme.com and www.acme.com are the same site; scans start at what was typed and redirect.
  const host = (url: URL) => url.hostname.replace(/^www\./, '');
  if (host(a) !== host(b)) return false;
  const section = (url: URL) => url.pathname.split('/')[1] ?? '';
  return section(a) === '' || section(a) === section(b);
}

export async function measureDiscovery(rows: GroundTruthRow[]): Promise<Discovery> {
  const discovery: Discovery = { found: [], missed: [], notRecorded: [] };
  for (const row of rows.filter((r) => r.surfaceKind === 'app')) {
    if (!existsSync(new URL(`${row.domain}/net.json`, DOMAINS_DIR))) {
      discovery.notRecorded.push(row.surfaceUrl);
      continue;
    }
    const recording = loadRecording(row.domain, DOMAINS_DIR);
    const report = await scan(recording.url, {
      net: new ReplayNet(recording),
      now: () => new Date(recording.recordedAt),
    });
    const match = report.surfaces.find((surface) => sameSurface(row.surfaceUrl, surface.url));
    if (match) {
      const via = !match.foundBy
        ? 'the homepage itself'
        : match.foundBy.kind === 'subdomain'
          ? 'subdomain check'
          : `link "${match.foundBy.text ?? ''}"`;
      discovery.found.push({ app: row.surfaceUrl, via });
    } else {
      discovery.missed.push({ app: row.surfaceUrl, surfaces: report.surfaces.map((s) => s.url) });
    }
  }
  const byApp = (a: { app: string }, b: { app: string }) => a.app.localeCompare(b.app);
  discovery.found.sort(byApp);
  discovery.missed.sort(byApp);
  discovery.notRecorded.sort();
  return discovery;
}

export async function measureAccuracy(rows: GroundTruthRow[]): Promise<Accuracy> {
  const fingerprinted = new Set(builtinFingerprints().map((fingerprint) => fingerprint.id));
  const scores = new Map<string, TechScore>();
  const score = (tech: string) => {
    let entry = scores.get(tech);
    if (!entry) {
      entry = { tech, hasFingerprint: fingerprinted.has(tech), found: [], missed: [], wrong: [] };
      scores.set(tech, entry);
    }
    return entry;
  };
  const unverified: Accuracy['unverified'] = [];
  const notScored: Accuracy['notScored'] = [];

  for (const row of rows) {
    for (const tech of [...row.present, ...row.absent]) score(tech);
    if (!existsSync(new URL(`${row.recording}/net.json`, RECORDINGS_DIR))) {
      notScored.push({ recording: row.recording, reason: 'not recorded yet' });
      continue;
    }
    const recording = loadRecording(row.recording);
    // Bot protection answers with an error page, not the site: not a fair test of the scanner.
    const blocked = Object.values(recording.http).find(
      (entry) => 'result' in entry && entry.result.status >= 400,
    );
    if (blocked && 'result' in blocked) {
      notScored.push({
        recording: row.recording,
        reason: `blocked (HTTP ${blocked.result.status})`,
      });
      continue;
    }
    // The CSV describes this exact surface, so no discovery here.
    const report = await scan(row.surfaceUrl, {
      discover: false,
      net: new ReplayNet(recording),
      now: () => new Date(recording.recordedAt),
    });
    const http = report.layersRun.find((run) => run.layer === 'http');
    if (http?.status !== 'ok') {
      const reason = http?.error ? `${http.error.code}: ${http.error.message}` : 'no HTTP';
      notScored.push({ recording: row.recording, reason: `page did not load (${reason})` });
      continue;
    }

    const detected = new Set(report.surfaces.flatMap((s) => s.detections.map((d) => d.tech)));
    for (const tech of row.present) {
      (detected.has(tech) ? score(tech).found : score(tech).missed).push(row.recording);
    }
    for (const tech of row.absent) {
      if (detected.has(tech)) score(tech).wrong.push(row.recording);
    }
    for (const tech of detected) {
      if (!row.present.includes(tech) && !row.absent.includes(tech)) {
        unverified.push({ recording: row.recording, tech });
      }
    }
  }

  const techs = [...scores.values()].sort(
    (a, b) => Number(b.hasFingerprint) - Number(a.hasFingerprint) || a.tech.localeCompare(b.tech),
  );
  for (const entry of techs)
    for (const list of [entry.found, entry.missed, entry.wrong]) list.sort();
  return {
    techs,
    unverified: unverified.sort(
      (a, b) => a.tech.localeCompare(b.tech) || a.recording.localeCompare(b.recording),
    ),
    notScored: notScored.sort((a, b) => a.recording.localeCompare(b.recording)),
    scored: rows.length - notScored.length,
    total: rows.length,
    discovery: await measureDiscovery(rows),
  };
}

const percent = (part: number, whole: number) =>
  whole === 0 ? '–' : `${Math.round((part / whole) * 100)}%`;

export function formatAccuracy(accuracy: Accuracy): string {
  const withFingerprint = accuracy.techs.filter((t) => t.hasFingerprint);
  const found = withFingerprint.reduce((sum, t) => sum + t.found.length, 0);
  const missed = withFingerprint.reduce((sum, t) => sum + t.missed.length, 0);
  const wrong = withFingerprint.reduce((sum, t) => sum + t.wrong.length, 0);

  const lines = [
    '# Accuracy',
    '',
    'Generated by `pnpm accuracy` from `ground-truth.csv` and the recordings in `recordings/`.',
    'Do not edit by hand: a test fails when this file is out of date.',
    '',
    `Fingerprints version \`${FINGERPRINTS_VERSION}\`. ${accuracy.scored} of ${accuracy.total} ` +
      'surfaces scored.',
    '',
    `**Technologies we have fingerprints for: found ${found} of ${found + missed} ` +
      `(${percent(found, found + missed)}). Wrong: ${wrong}.**`,
    '',
    '- **Found**: the source says it is used, and the scan detected it.',
    '- **Missed**: the source says it is used, and the scan did not detect it.',
    '- **Wrong**: the source says it is not used (usually a documented migration away), and the',
    '  scan detected it anyway.',
    '',
    '| Technology | Fingerprint | Found | Missed | Wrong | Found rate |',
    '| --- | --- | --- | --- | --- | --- |',
    ...accuracy.techs.map(
      (t) =>
        `| ${t.tech} | ${t.hasFingerprint ? 'yes' : 'not yet'} | ${t.found.length} | ` +
        `${t.missed.length} | ${t.wrong.length} | ` +
        `${percent(t.found.length, t.found.length + t.missed.length)} |`,
    ),
  ];

  const { discovery } = accuracy;
  const apps = discovery.found.length + discovery.missed.length;
  lines.push(
    '',
    '## Finding the app',
    '',
    `**Scanning the company's homepage found ${discovery.found.length} of ${apps} product apps ` +
      `(${percent(discovery.found.length, apps)}).** Each app in the ground truth, and how the ` +
      'scan reached it:',
    '',
    ...discovery.found.map((f) => `- ${f.app}: ${f.via}`),
    ...discovery.missed.map((m) => `- ${m.app}: **missed** (scanned ${m.surfaces.join(', ')})`),
    ...discovery.notRecorded.map((app) => `- ${app}: homepage not recorded yet`),
  );

  const listed = (title: string, items: string[]) => {
    if (items.length === 0) return;
    lines.push('', `## ${title}`, '', ...items);
  };
  listed(
    'Missed',
    withFingerprint
      .filter((t) => t.missed.length)
      .map((t) => `- **${t.tech}**: ${t.missed.join(', ')}`),
  );
  listed(
    'Wrong',
    accuracy.techs
      .filter((t) => t.wrong.length)
      .map((t) => `- **${t.tech}**: ${t.wrong.join(', ')}`),
  );
  listed(
    'Detected, not in the ground truth',
    accuracy.unverified.map((u) => `- ${u.tech}: ${u.recording}`),
  );
  listed(
    'Not scored',
    accuracy.notScored.map((n) => `- ${n.recording}: ${n.reason}`),
  );
  return `${lines.join('\n')}\n`;
}
