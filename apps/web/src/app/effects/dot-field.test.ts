import { describe, expect, test } from 'vitest';
import { bandCenter, follow, hexToRgb, SWEEP_MS } from './dot-field.ts';

test('hexToRgb reads token colours for the shader', () => {
  expect(hexToRgb('#1fa836')).toEqual([31 / 255, 168 / 255, 54 / 255]);
  expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
});

describe('bandCenter', () => {
  const width = 1000;
  const half = 100;

  test('starts fully off the left edge and reaches fully off the right after one sweep', () => {
    expect(bandCenter(0, width, half)).toBe(-half);
    expect(bandCenter(SWEEP_MS, width, half)).toBeCloseTo(width + half);
  });

  test('comes back the same way, and repeats', () => {
    expect(bandCenter(2 * SWEEP_MS, width, half)).toBeCloseTo(-half);
    expect(bandCenter(SWEEP_MS / 2, width, half)).toBeCloseTo(width / 2);
    expect(bandCenter(1.5 * SWEEP_MS, width, half)).toBeCloseTo(width / 2);
    expect(bandCenter(2.25 * SWEEP_MS, width, half)).toBeCloseTo(
      bandCenter(0.25 * SWEEP_MS, width, half),
    );
  });

  test('eases: slow at the ends, fastest in the middle', () => {
    const step = SWEEP_MS / 20;
    const atEnd = bandCenter(step, width, half) - bandCenter(0, width, half);
    const inMiddle =
      bandCenter(SWEEP_MS / 2 + step / 2, width, half) -
      bandCenter(SWEEP_MS / 2 - step / 2, width, half);
    expect(inMiddle).toBeGreaterThan(5 * atEnd);
  });
});

test('follow moves the lens the same distance at any frame rate', () => {
  const at60 = follow(follow(0, 100, 1000 / 60), 100, 1000 / 60);
  const at30 = follow(0, 100, 1000 / 30);
  expect(at30).toBeCloseTo(at60);
  expect(follow(0, 100, 1000 / 60)).toBeCloseTo(12);
  expect(follow(100, 100, 16)).toBe(100);
});
