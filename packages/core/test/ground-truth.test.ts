import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { SurfaceKind } from '../src/report.ts';

// fixtures/ground-truth.csv: sites whose stack is documented publicly or known first-hand.
// Accuracy is measured against it, so a malformed row would quietly skew every number.
const COLUMNS = [
  'domain',
  'surface_url',
  'surface_kind',
  'present',
  'absent',
  'source',
  'source_date',
  'strength',
  'notes',
];
const STRENGTHS = ['first-hand', 'first-hand-unconfirmed', 'strong', 'medium'];
const KINDS = [...SurfaceKind.options.filter((kind) => kind !== 'unclassified'), 'unclear'];

const [header, ...lines] = readFileSync(
  new URL('../../../fixtures/ground-truth.csv', import.meta.url),
  'utf8',
)
  .trim()
  .split('\n');

test('has the expected columns', () => {
  expect(header?.split(',')).toEqual(COLUMNS);
});

test.each(lines.map((line, i) => [i + 2, line] as const))('row %i is well formed', (_, line) => {
  // Plain CSV on purpose: no quoting, so no field may contain a comma.
  const fields = line.split(',');
  expect(fields).toHaveLength(COLUMNS.length);
  const row = Object.fromEntries(COLUMNS.map((column, i) => [column, fields[i] ?? '']));

  expect(row.domain).toMatch(/^[a-z0-9.-]+\.[a-z]+$/);
  const url = new URL(row.surface_url ?? '');
  expect(url.protocol).toBe('https:');
  expect(url.hostname === row.domain || url.hostname.endsWith(`.${row.domain}`)).toBe(true);
  expect(KINDS).toContain(row.surface_kind);
  expect(STRENGTHS).toContain(row.strength);
  expect(row.source_date).toMatch(/^\d{4}(-\d{2})?$/);
  expect(row.source === 'first-hand' || row.source?.startsWith('https://')).toBe(true);

  const present = row.present?.split(' ').filter(Boolean) ?? [];
  const absent = row.absent?.split(' ').filter(Boolean) ?? [];
  expect(present.length + absent.length).toBeGreaterThan(0);
  expect(present.filter((tech) => absent.includes(tech))).toEqual([]);
  for (const tech of [...present, ...absent]) expect(tech).toMatch(/^[a-z0-9-]+$/);
});

test('lists each surface once', () => {
  const urls = lines.map((line) => line.split(',')[1]);
  expect(new Set(urls).size).toBe(urls.length);
});
