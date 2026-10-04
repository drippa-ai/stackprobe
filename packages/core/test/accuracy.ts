import { existsSync } from 'node:fs';
import { builtinFingerprints, FINGERPRINTS_VERSION } from '../src/fingerprints/index.ts';
import { scan } from '../src/scan.ts';
import { ReplayDecider } from './decisions.ts';
import {
  DOMAINS_DIR,
  loadBrowserRecording,
  loadRecording,
  RECORDINGS_DIR,
  ReplayBrowser,
  ReplayNet,
} from './fixtures.ts';
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

export interface KindScore {
  kind: string;
  correct: string[];
  wrong: { recording: string; as: string }[];
  unclassified: string[];
}

export interface Accuracy {
  techs: TechScore[];
  // By rules only, and with the decision model's recorded answers.
  kinds: KindScore[];
  kindsWithModel: KindScore[];
  // Questions the model would be asked that have no recorded answer: re-record them.
  decisionMisses: string[];
  // Pages the browser layer would load that have no recorded capture.
  browserMisses: string[];
  // Surfaces scored with recorded browser captures.
  withBrowser: number;
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
  // What classification called the surface that matched the app: rules only, and with the model.
  found: { app: string; via: string; kind: string; kindWithModel: string }[];
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

export async function measureDiscovery(
  rows: GroundTruthRow[],
  decider: ReplayDecider,
): Promise<Discovery> {
  const discovery: Discovery = { found: [], missed: [], notRecorded: [] };
  for (const row of rows.filter((r) => r.surfaceKind === 'app')) {
    if (!existsSync(new URL(`${row.domain}/net.json`, DOMAINS_DIR))) {
      discovery.notRecorded.push(row.surfaceUrl);
      continue;
    }
    const recording = loadRecording(row.domain, DOMAINS_DIR);
    const options = { net: new ReplayNet(recording), now: () => new Date(recording.recordedAt) };
    const report = await scan(recording.url, options);
    const withModel = await scan(recording.url, { ...options, decider });
    const match = report.surfaces.find((surface) => sameSurface(row.surfaceUrl, surface.url));
    const matchWithModel = withModel.surfaces.find((s) => s.id === match?.id);
    if (match) {
      const via = !match.foundBy
        ? 'the homepage itself'
        : match.foundBy.kind === 'subdomain'
          ? 'subdomain check'
          : `link "${match.foundBy.text ?? ''}"`;
      discovery.found.push({
        app: row.surfaceUrl,
        via,
        kind: match.kind,
        kindWithModel: matchWithModel?.kind ?? 'unclassified',
      });
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
  const kinds = new Map<string, KindScore>();
  const kindsWithModel = new Map<string, KindScore>();
  const scoreKind = (into: Map<string, KindScore>, row: GroundTruthRow, got: string) => {
    if (row.surfaceKind === 'unclear') return;
    let entry = into.get(row.surfaceKind);
    if (!entry) {
      entry = { kind: row.surfaceKind, correct: [], wrong: [], unclassified: [] };
      into.set(row.surfaceKind, entry);
    }
    if (got === row.surfaceKind) entry.correct.push(row.recording);
    else if (got === 'unclassified') entry.unclassified.push(row.recording);
    else entry.wrong.push({ recording: row.recording, as: got });
  };
  const decider = new ReplayDecider();
  const unverified: Accuracy['unverified'] = [];
  const browserMisses: string[] = [];
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
    // The CSV describes this exact surface, so no discovery here. The browser layer runs where a
    // scan would run it, from recorded captures.
    const captures = loadBrowserRecording(row.recording);
    const browser = captures ? new ReplayBrowser(captures) : undefined;
    const report = await scan(row.surfaceUrl, {
      discover: false,
      net: new ReplayNet(recording),
      now: () => new Date(recording.recordedAt),
      ...(browser ? { browser } : {}),
    });
    browserMisses.push(...(browser?.misses ?? []));
    const http = report.layersRun.find((run) => run.layer === 'http');
    if (http?.status !== 'ok') {
      const reason = http?.error ? `${http.error.code}: ${http.error.message}` : 'no HTTP';
      notScored.push({ recording: row.recording, reason: `page did not load (${reason})` });
      continue;
    }

    scoreKind(kinds, row, report.surfaces[0]?.kind ?? 'unclassified');
    const withModel = await scan(row.surfaceUrl, {
      discover: false,
      decider,
      net: new ReplayNet(recording),
      now: () => new Date(recording.recordedAt),
    });
    scoreKind(kindsWithModel, row, withModel.surfaces[0]?.kind ?? 'unclassified');

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
    kinds: [...kinds.values()].sort((a, b) => a.kind.localeCompare(b.kind)),
    kindsWithModel: [...kindsWithModel.values()].sort((a, b) => a.kind.localeCompare(b.kind)),
    unverified: unverified.sort(
      (a, b) => a.tech.localeCompare(b.tech) || a.recording.localeCompare(b.recording),
    ),
    notScored: notScored.sort((a, b) => a.recording.localeCompare(b.recording)),
    scored: rows.length - notScored.length,
    total: rows.length,
    discovery: await measureDiscovery(rows, decider),
    decisionMisses: [...new Set(decider.misses)].sort(),
    browserMisses: [...new Set(browserMisses)].sort(),
    withBrowser: rows.filter((row) => loadBrowserRecording(row.recording)).length,
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
      `surfaces scored, ${accuracy.withBrowser} of them with recorded browser captures.`,
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

  const totals = (scores: KindScore[]) =>
    scores.reduce(
      (sum, k) => ({
        right: sum.right + k.correct.length,
        all: sum.all + k.correct.length + k.wrong.length + k.unclassified.length,
        wrong: sum.wrong + k.wrong.length,
      }),
      { right: 0, all: 0, wrong: 0 },
    );
  const rules = totals(accuracy.kinds);
  const model = totals(accuracy.kindsWithModel);
  const cells = (k: KindScore | undefined) =>
    k ? `${k.correct.length} | ${k.wrong.length} | ${k.unclassified.length}` : '0 | 0 | 0';
  // Per surface: what each way called it, for every surface either got wrong or left open.
  const got = (scores: KindScore[], recording: string) => {
    for (const k of scores) {
      if (k.correct.includes(recording)) return k.kind;
      const wrong = k.wrong.find((w) => w.recording === recording);
      if (wrong) return wrong.as;
      if (k.unclassified.includes(recording)) return 'unclassified';
    }
    return 'not scored';
  };
  const notRight = accuracy.kinds.flatMap((k) =>
    [...k.wrong.map((w) => w.recording), ...k.unclassified].map((recording) => ({
      kind: k.kind,
      recording,
    })),
  );
  const modelWrong = accuracy.kindsWithModel.flatMap((k) =>
    k.wrong.map((w) => ({ kind: k.kind, recording: w.recording })),
  );
  const openKinds = [...notRight, ...modelWrong]
    .filter((x, i, all) => all.findIndex((y) => y.recording === x.recording) === i)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.recording.localeCompare(b.recording));
  lines.push(
    '',
    '## Surface kinds',
    '',
    `**Rules only: kind right for ${rules.right} of ${rules.all} surfaces ` +
      `(${percent(rules.right, rules.all)}), wrong ${rules.wrong}, the rest left unclassified. ` +
      `With the decision model (Jev, recorded answers): right for ${model.right} of ${model.all} ` +
      `(${percent(model.right, model.all)}), wrong ${model.wrong}.** Each surface scanned on its own.`,
    '',
    '| Kind | Rules: right | wrong | unclassified | With Jev: right | wrong | unclassified |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...accuracy.kinds.map(
      (k) =>
        `| ${k.kind} | ${cells(k)} | ${cells(accuracy.kindsWithModel.find((m) => m.kind === k.kind))} |`,
    ),
    '',
    ...openKinds.map(
      ({ kind, recording }) =>
        `- ${kind} ${recording}: rules ${got(accuracy.kinds, recording)}, with Jev ` +
        `${got(accuracy.kindsWithModel, recording)}`,
    ),
  );
  if (accuracy.decisionMisses.length) {
    lines.push(
      '',
      `**${accuracy.decisionMisses.length} decisions have no recorded answer; run ` +
        '`pnpm record-decisions`:** ' +
        accuracy.decisionMisses.join(', '),
    );
  }
  if (accuracy.browserMisses.length) {
    lines.push(
      '',
      `**${accuracy.browserMisses.length} browser loads have no recorded capture; run ` +
        '`pnpm record-browser`:** ' +
        accuracy.browserMisses.join(', '),
    );
  }

  const { discovery } = accuracy;
  const apps = discovery.found.length + discovery.missed.length;
  const calledApp = discovery.found.filter((f) => f.kind === 'app').length;
  const calledAppWithModel = discovery.found.filter((f) => f.kindWithModel === 'app').length;
  lines.push(
    '',
    '## Finding the app',
    '',
    `**Scanning the company's homepage found ${discovery.found.length} of ${apps} product apps ` +
      `(${percent(discovery.found.length, apps)}). It called ${calledApp} of them the product app ` +
      `by rules only (${percent(calledApp, apps)}), and ${calledAppWithModel} with Jev ` +
      `(${percent(calledAppWithModel, apps)}).** Each app in the ground truth, how the scan ` +
      'reached it, and what it called it:',
    '',
    ...discovery.found.map(
      (f) =>
        `- ${f.app}: ${f.via}; called ${f.kind}` +
        (f.kindWithModel !== f.kind ? `, with Jev ${f.kindWithModel}` : ''),
    ),
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
