import { readFileSync } from 'node:fs';

// fixtures/ground-truth.csv, parsed. See fixtures/README.md for what each column means.
export const GROUND_TRUTH_FILE = new URL('../../../fixtures/ground-truth.csv', import.meta.url);

export const COLUMNS = [
  'domain',
  'surface_url',
  'surface_kind',
  'present',
  'absent',
  'source',
  'source_date',
  'strength',
  'notes',
] as const;

export interface GroundTruthRow {
  domain: string;
  surfaceUrl: string;
  surfaceKind: string;
  present: string[];
  absent: string[];
  source: string;
  sourceDate: string;
  strength: string;
  notes: string;
  // Folder name under fixtures/recordings/.
  recording: string;
}

export function readGroundTruthLines(): { header: string; lines: string[] } {
  const [header = '', ...lines] = readFileSync(GROUND_TRUTH_FILE, 'utf8').trim().split('\n');
  return { header, lines };
}

export function loadGroundTruth(): GroundTruthRow[] {
  return readGroundTruthLines().lines.map((line) => {
    const [domain, surfaceUrl, surfaceKind, present, absent, source, sourceDate, strength, notes] =
      line.split(',').map((field) => field ?? '');
    const words = (value = '') => value.split(' ').filter(Boolean);
    return {
      domain: domain ?? '',
      surfaceUrl: surfaceUrl ?? '',
      surfaceKind: surfaceKind ?? '',
      present: words(present),
      absent: words(absent),
      source: source ?? '',
      sourceDate: sourceDate ?? '',
      strength: strength ?? '',
      notes: notes ?? '',
      recording: recordingName(surfaceUrl ?? ''),
    };
  });
}

// "https://www.bydagny.com/sign-in" -> "www-bydagny-com-sign-in"
export function recordingName(surfaceUrl: string): string {
  const url = new URL(surfaceUrl);
  return `${url.hostname}${url.pathname}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
