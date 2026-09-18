import { describe, expect, it } from 'vitest';
import { planRasterReclassify, validateRasterReclassifyParams } from './reclassifyEngine';

function pixelsOf(values: number[], nodata?: number) {
  const pixels = new Float64Array(values);
  return { pixels, nodata };
}

function plan(values: number[], params: Parameters<typeof planRasterReclassify>[2], nodata?: number) {
  const { pixels } = pixelsOf(values, nodata);
  return planRasterReclassify(pixels, nodata, params);
}

describe('validateRasterReclassifyParams', () => {
  it('accepts the three automatic methods with an integer class count', () => {
    expect(validateRasterReclassifyParams({ method: 'jenks', classCount: '5' })).toEqual({ ok: true, classCount: 5, customBreaks: null });
    expect(validateRasterReclassifyParams({ method: 'quantile', classCount: 8 })).toEqual({ ok: true, classCount: 8, customBreaks: null });
    expect(validateRasterReclassifyParams({ method: 'equalInterval', classCount: '2' })).toEqual({ ok: true, classCount: 2, customBreaks: null });
  });

  it('rejects unknown methods and invalid class counts with actionable messages', () => {
    const method = validateRasterReclassifyParams({ method: 'natural', classCount: 5 });
    expect(method.ok).toBe(false);
    expect(method.ok ? '' : method.error).toContain('不支持的重分类方法');

    for (const classCount of ['0', '2.5', '65', 'abc']) {
      expect(validateRasterReclassifyParams({ method: 'jenks', classCount }).ok).toBe(false);
    }
    expect(validateRasterReclassifyParams({ method: 'jenks' }).ok).toBe(false);
  });

  it('parses custom breaks and rejects empty, non-numeric or non-increasing lists', () => {
    expect(validateRasterReclassifyParams({ method: 'custom', customBreaks: '100, 200, 500' })).toEqual({
      ok: true,
      classCount: null,
      customBreaks: [100, 200, 500],
    });
    expect(validateRasterReclassifyParams({ method: 'custom', customBreaks: '1，2' })).toEqual({
      ok: true,
      classCount: null,
      customBreaks: [1, 2],
    });
    expect(validateRasterReclassifyParams({ method: 'custom', customBreaks: '' }).ok).toBe(false);
    expect(validateRasterReclassifyParams({ method: 'custom' }).ok).toBe(false);
    expect(validateRasterReclassifyParams({ method: 'custom', customBreaks: '5, 3' }).ok).toBe(false);
    expect(validateRasterReclassifyParams({ method: 'custom', customBreaks: 'a, b' }).ok).toBe(false);
  });
});

describe('planRasterReclassify', () => {
  it('computes equal interval breaks and per-class histogram', () => {
    const result = plan([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { method: 'equalInterval', classCount: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.breaks).toEqual([4, 7]);
    expect(result.plan.classCount).toBe(3);
    const evaluated = result.plan.evaluate();
    expect(evaluated.histogram).toEqual([4, 3, 3]);
    expect(Array.from(evaluated.pixels)).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });

  it('computes quantile breaks from order statistics', () => {
    const result = plan([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { method: 'quantile', classCount: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.breaks).toEqual([3, 5, 8]);
    expect(result.plan.evaluate().histogram).toEqual([3, 2, 3, 2]);
  });

  it('computes Jenks natural breaks that minimize within-class variance', () => {
    const result = plan([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { method: 'jenks', classCount: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.breaks).toEqual([5]);
    expect(result.plan.evaluate().histogram).toEqual([5, 5]);
  });

  it('separates repeated extreme values with Jenks instead of dropping the class', () => {
    const result = plan([1, 1, 1, 1, 10, 10, 10, 10], { method: 'jenks', classCount: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.breaks).toEqual([1]);
    expect(result.plan.classCount).toBe(2);
    expect(result.plan.evaluate().histogram).toEqual([4, 4]);
  });

  it('uses custom breaks directly and drops breaks outside the value range', () => {
    const result = plan([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { method: 'custom', customBreaks: '3, 7' });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.breaks).toEqual([3, 7]);
    expect(result.plan.classCount).toBe(3);
    expect(result.plan.evaluate().histogram).toEqual([3, 4, 3]);

    const outOfRange = plan([1, 2, 3, 4], { method: 'custom', customBreaks: '0.5, 2.5, 100' });
    expect(outOfRange.ok).toBe(true);
    if (outOfRange.ok) {
      expect(outOfRange.plan.breaks).toEqual([2.5]);
      expect(outOfRange.plan.classCount).toBe(2);
    }
  });

  it('assigns values equal to a break to the lower class', () => {
    const result = plan([1, 2, 3, 4], { method: 'custom', customBreaks: '2.5' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.from(result.plan.evaluate().pixels)).toEqual([1, 1, 2, 2]);
    }
  });

  it('propagates nodata cells and keeps source nodata in the output', () => {
    const values = [1, -999, 5, 9, -999, 7];
    const { pixels, nodata } = pixelsOf(values, -999);
    const result = planRasterReclassify(pixels, nodata, { method: 'equalInterval', classCount: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const evaluated = result.plan.evaluate();
    expect(evaluated.pixels[1]).toBe(-999);
    expect(evaluated.pixels[4]).toBe(-999);
    expect(evaluated.validCount).toBe(4);
    expect(evaluated.histogram).toHaveLength(2);
  });

  it('reduces class counts instead of returning empty classes for tied values', () => {
    const result = plan([5, 5, 5, 5, 5, 5, 5, 5, 5, 9], { method: 'quantile', classCount: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.classCount).toBe(2);
    expect(result.plan.evaluate().histogram).toEqual([9, 1]);
  });

  it('rejects degenerate inputs without producing a plan', () => {
    expect(plan([], { method: 'jenks', classCount: 3 }).ok).toBe(false);
    expect(plan([7], { method: 'jenks', classCount: 3 }).ok).toBe(false);
    const same = plan([4, 4, 4], { method: 'equalInterval', classCount: 3 });
    expect(same.ok).toBe(false);
    expect(same.ok ? '' : same.error).toContain('全部相同');
    const customOutside = plan([4, 4, 4, 4], { method: 'custom', customBreaks: '10, 20' });
    expect(customOutside.ok).toBe(false);
    expect(customOutside.ok ? '' : customOutside.error).toContain('无法从当前像元值计算出有效的分类间断点');
  });

  it('keeps the value range of the source raster', () => {
    const result = plan([3, 1, 4, 1, 5], { method: 'equalInterval', classCount: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.min).toBe(1);
      expect(result.plan.max).toBe(5);
      expect(result.plan.breaks).toEqual([3]);
    }
  });
});
