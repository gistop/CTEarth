import { describe, expect, it } from 'vitest';
import { planRasterResample, validateRasterResampleParams } from './resampleEngine';

function sourceOf(values: number[], width: number, options: { nodata?: number; geoTransform?: number[] } = {}) {
  return {
    width,
    height: values.length / width,
    geoTransform: options.geoTransform ?? [0, 1, 0, 4, 0, -1],
    nodata: options.nodata,
    pixels: new Float64Array(values),
  };
}

function evaluate(
  values: number[],
  width: number,
  params: Parameters<typeof planRasterResample>[1],
  options?: { nodata?: number; geoTransform?: number[] },
) {
  const planned = planRasterResample(sourceOf(values, width, options), params);
  if (!planned.ok) {
    throw new Error(planned.error);
  }
  return planned.plan;
}

describe('validateRasterResampleParams', () => {
  it('accepts the four methods and an optional positive cell size', () => {
    for (const method of ['nearest', 'bilinear', 'cubic', 'majority']) {
      expect(validateRasterResampleParams({ method })).toEqual({ ok: true, cellSize: null });
      expect(validateRasterResampleParams({ method, cellSize: '2.5' })).toEqual({ ok: true, cellSize: 2.5 });
    }
  });

  it('rejects unknown methods and non-positive cell sizes with actionable messages', () => {
    const method = validateRasterResampleParams({ method: 'lanczos' });
    expect(method.ok).toBe(false);
    expect(method.ok ? '' : method.error).toContain('不支持的重采样方法');
    for (const cellSize of ['0', '-1', 'abc']) {
      expect(validateRasterResampleParams({ method: 'nearest', cellSize }).ok).toBe(false);
    }
    expect(validateRasterResampleParams({ method: 'nearest', cellSize: 0 }).ok).toBe(false);
  });
});

describe('planRasterResample', () => {
  it('keeps the source raster unchanged when the cell size matches', () => {
    for (const method of ['nearest', 'bilinear', 'cubic'] as const) {
      const plan = evaluate([0, 2, 4, 6], 2, { method, cellSize: 1 });
      expect(plan.width).toBe(2);
      expect(plan.height).toBe(2);
      expect(Array.from(plan.evaluate().pixels)).toEqual([0, 2, 4, 6]);
    }
  });

  it('computes the output grid from the target cell size and preserves the origin', () => {
    const plan = evaluate(new Array(9).fill(1), 3, { method: 'nearest', cellSize: 2 });
    expect(plan.width).toBe(2);
    expect(plan.height).toBe(2);
    expect(plan.geoTransform).toEqual([0, 2, 0, 4, 0, -2]);

    const coarse = evaluate(new Array(9).fill(1), 3, { method: 'nearest', cellSize: 4 });
    expect(coarse.width).toBe(1);
    expect(coarse.height).toBe(1);
  });

  it('interpolates bilinear values between the four surrounding cells', () => {
    const plan = evaluate([0, 2, 4, 6], 2, { method: 'bilinear', cellSize: 0.5 });
    expect(plan.width).toBe(4);
    const pixels = plan.evaluate().pixels;
    expect(pixels[0]).toBe(0);
    expect(pixels[5]).toBe(1.5);
    expect(pixels[15]).toBe(6);
  });

  it('returns exact values with nearest and cubic at aligned cell centers', () => {
    const nearest = evaluate([1, 3, 5, 7], 2, { method: 'nearest', cellSize: 0.5 });
    const sampled = [0, 2, 8, 10].map((index) => nearest.evaluate().pixels[index]);
    expect(sampled).toEqual([1, 3, 5, 7]);

    const cubic = evaluate([0, 2, 4, 6], 2, { method: 'cubic', cellSize: 1 });
    expect(Array.from(cubic.evaluate().pixels)).toEqual([0, 2, 4, 6]);
  });

  it('uses the mode of covered input cells for majority downsampling', () => {
    const values = [
      1, 1, 2, 2,
      1, 1, 2, 3,
      5, 5, 6, 6,
      5, 7, 6, 6,
    ];
    const plan = evaluate(values, 4, { method: 'majority', cellSize: 2 });
    expect(plan.width).toBe(2);
    expect(Array.from(plan.evaluate().pixels)).toEqual([1, 2, 5, 6]);
  });

  it('breaks majority ties deterministically towards the smaller value', () => {
    const values = [1, 2, 1, 2];
    const plan = evaluate(values, 2, { method: 'majority', cellSize: 2 });
    expect(plan.evaluate().pixels[0]).toBe(1);
  });

  it('falls back to nearest for majority upsampling', () => {
    const plan = evaluate([9, 8, 7, 6], 2, { method: 'majority', cellSize: 0.5 });
    expect(plan.width).toBe(4);
    const pixels = plan.evaluate().pixels;
    expect(pixels[0]).toBe(9);
    expect(pixels[3]).toBe(8);
    expect(pixels[15]).toBe(6);
  });

  it('propagates nodata and interpolates only over valid neighbours', () => {
    const values = [0, -999, 4, 6];
    const nearest = evaluate(values, 2, { method: 'nearest', cellSize: 1 }, { nodata: -999 });
    expect(nearest.evaluate().pixels[1]).toBe(-999);

    const bilinear = evaluate(values, 2, { method: 'bilinear', cellSize: 1 }, { nodata: -999 });
    const mixed = evaluate(values, 2, { method: 'bilinear', cellSize: 0.5 }, { nodata: -999 });
    expect(bilinear.evaluate().validCount).toBe(3);
    expect(mixed.evaluate().pixels[5]).toBeCloseTo(18 / 13, 10);

    const allInvalid = evaluate([-999, -999, -999, -999], 2, { method: 'bilinear', cellSize: 0.5 }, { nodata: -999 });
    expect(allInvalid.evaluate().validCount).toBe(0);
    expect(allInvalid.evaluate().pixels.every((value) => value === -999 || Number.isNaN(value))).toBe(true);
  });

  it('rejects degenerate sources and oversized outputs', () => {
    expect(planRasterResample(sourceOf([1, 2, 3, 4], 0), { method: 'nearest' }).ok).toBe(false);
    const rotated = { ...sourceOf([1, 2, 3, 4], 2), geoTransform: [0, 1, 0.5, 4, 0, -1] };
    expect(planRasterResample(rotated, { method: 'nearest' }).ok).toBe(false);
    const huge = planRasterResample(sourceOf(new Array(9).fill(1), 3), { method: 'nearest', cellSize: 1e-9 });
    expect(huge.ok).toBe(false);
    expect(huge.ok ? '' : huge.error).toContain('输出像元数量过大');
  });

  it('preserves the y cell size ratio for non-square input cells', () => {
    const plan = evaluate(new Array(6).fill(1), 3, { method: 'nearest', cellSize: 2 }, { geoTransform: [0, 1, 0, 4, 0, -0.5] });
    expect(plan.width).toBe(2);
    expect(plan.height).toBe(1);
    expect(plan.geoTransform).toEqual([0, 2, 0, 4, 0, -1]);
  });
});
