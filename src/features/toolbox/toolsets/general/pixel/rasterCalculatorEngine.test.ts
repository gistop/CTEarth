import { describe, expect, it } from 'vitest';
import { planRasterCalculator, validateRasterExpression } from './rasterCalculatorEngine';

function createSource(overrides: Partial<Parameters<typeof createSourceFrom>[0]> & { name?: string; values?: number[] } = {}) {
  return createSourceFrom({
    name: overrides.name ?? 'dem.tif',
    values: overrides.values ?? [1, 2, 3, 4],
    nodata: overrides.nodata,
    epsg: overrides.epsg,
  });
}

function createSourceFrom({
  name,
  values,
  nodata,
  epsg,
}: {
  name: string;
  values: number[];
  nodata?: number;
  epsg?: number;
}) {
  return {
    name,
    width: 2,
    height: 2,
    geoTransform: [120, 0.5, 0, 31, 0, -0.5],
    nodata,
    epsg,
    pixels: new Float64Array(values),
  };
}

function evaluate(expression: string, sources = [createSource()]) {
  const planned = planRasterCalculator(expression, sources);
  if (!planned.ok) {
    throw new Error(planned.error);
  }
  return planned.plan.evaluate().pixels;
}

describe('raster calculator engine', () => {
  it('evaluates arithmetic with operator precedence and parentheses', () => {
    expect(evaluate('"dem.tif" * 2 + 1')).toEqual(new Float64Array([3, 5, 7, 9]));
    expect(evaluate('"dem.tif" * (2 + 1)')).toEqual(new Float64Array([3, 6, 9, 12]));
    expect(evaluate('("dem.tif" - 3) / 2')).toEqual(new Float64Array([-1, -0.5, 0, 0.5]));
    expect(evaluate('-"dem.tif" + 5')).toEqual(new Float64Array([4, 3, 2, 1]));
  });

  it('resolves raster names without extension and reuses repeated references', () => {
    expect(evaluate('"dem" * "dem.tif"')).toEqual(new Float64Array([1, 4, 9, 16]));
  });

  it('supports comparisons, logical operators and con/isnull', () => {
    expect(evaluate('"dem.tif" > 2')).toEqual(new Float64Array([0, 0, 1, 1]));
    expect(evaluate('con("dem.tif" >= 2, "dem.tif", 0)')).toEqual(new Float64Array([0, 2, 3, 4]));
    expect(evaluate('con("dem.tif" < 2, "dem.tif")')).toEqual(new Float64Array([1, Number.NaN, Number.NaN, Number.NaN]));
    expect(evaluate('"dem.tif" > 2 && "dem.tif" < 4')).toEqual(new Float64Array([0, 0, 1, 0]));
    expect(evaluate('!"dem.tif"')).toEqual(new Float64Array([0, 0, 0, 0]));
  });

  it('supports scalar functions', () => {
    expect(evaluate('sqrt("dem.tif") * 2')).toEqual(new Float64Array([2, 2 * Math.SQRT2, 2 * Math.sqrt(3), 4]));
    expect(evaluate('ln(exp("dem.tif"))')).toEqual(new Float64Array([1, 2, 3, 4]));
    expect(evaluate('log("dem.tif", 2)')).toEqual(new Float64Array([0, 1, Math.log2(3), 2]));
    expect(evaluate('log10(10 * "dem.tif")')).toEqual(new Float64Array([1, Math.log10(20), Math.log10(30), Math.log10(40)]));
    expect(evaluate('pow("dem.tif", 2)')).toEqual(new Float64Array([1, 4, 9, 16]));
    expect(evaluate('min("dem.tif", 2, 3)')).toEqual(new Float64Array([1, 2, 2, 2]));
    expect(evaluate('max("dem.tif", 2)')).toEqual(new Float64Array([2, 2, 3, 4]));
    expect(evaluate('abs(0 - "dem.tif")')).toEqual(new Float64Array([1, 2, 3, 4]));
    expect(evaluate('round("dem.tif" / 3 * 10) / 10')).toEqual(new Float64Array([0.3, 0.7, 1, 1.3]));
  });

  it('propagates nodata and division by zero as invalid cells', () => {
    const source = createSource({ values: [1, 0, 3, -999], nodata: -999 });
    const pixels = evaluate('"dem.tif" * 2 / "dem.tif"', [source]);
    expect(pixels[0]).toBe(2);
    expect(pixels[1]).toBe(-999);
    expect(pixels[2]).toBe(2);
    expect(pixels[3]).toBe(-999);
    const planned = planRasterCalculator('"dem.tif" + 1', [source]);
    expect(planned.ok && planned.plan.nodata).toBe(-999);
  });

  it('lets isnull convert invalid cells into a mask', () => {
    const source = createSource({ values: [1, -999, 3, -999], nodata: -999 });
    expect(evaluate('isnull("dem.tif")', [source])).toEqual(new Float64Array([0, 1, 0, 1]));
  });

  it('rejects empty, syntactically invalid and bare-identifier expressions', () => {
    expect(validateRasterExpression('   ', [createSource()])).toEqual({ ok: false, error: '请输入地图代数表达式。' });
    expect(validateRasterExpression('"dem.tif" *', [createSource()]).ok).toBe(false);
    expect(validateRasterExpression('"dem.tif" dem', [createSource()]).ok).toBe(false);
    const bare = validateRasterExpression('dem * 2', [createSource()]);
    expect(bare.ok).toBe(false);
    expect(bare.ok ? '' : bare.error).toContain('双引号');
    expect(validateRasterExpression('"dem.tif" ^ 2', [createSource()]).ok).toBe(false);
    expect(validateRasterExpression('"dem.tif', [createSource()]).ok).toBe(false);
  });

  it('rejects unknown rasters, unknown functions and wrong arities with actionable messages', () => {
    const missing = validateRasterExpression('"missing.tif" + 1', [createSource()]);
    expect(missing.ok).toBe(false);
    expect(missing.ok ? '' : missing.error).toContain('"missing.tif"');
    expect(missing.ok ? '' : missing.error).toContain('"dem.tif"');

    const unknownFunction = validateRasterExpression('median("dem.tif")', [createSource()]);
    expect(unknownFunction.ok ? '' : unknownFunction.error).toContain('median');

    const arity = validateRasterExpression('pow("dem.tif")', [createSource()]);
    expect(arity.ok ? '' : arity.error).toContain('pow');

    const constant = validateRasterExpression('2 + 3', [createSource()]);
    expect(constant.ok).toBe(false);
    expect(constant.ok ? '' : constant.error).toContain('至少需要引用一个栅格');
  });

  it('requires at least one referenced raster and consistent grids', () => {
    const mismatch = createSourceFrom({ name: 'slope.tif', values: [1, 2, 3, 4, 5, 6], });
    const sized = { ...mismatch, width: 3, height: 2 };
    const result = validateRasterExpression('"dem.tif" + "slope.tif"', [createSource(), sized]);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain('尺寸');

    const shifted = { ...createSource({ name: 'slope.tif' }), geoTransform: [121, 0.5, 0, 31, 0, -0.5] };
    const grid = validateRasterExpression('"dem.tif" + "slope.tif"', [createSource(), shifted]);
    expect(grid.ok).toBe(false);
    expect(grid.ok ? '' : grid.error).toContain('GeoTransform');
  });

  it('reports zero valid cells so the caller can block empty outputs', () => {
    const source = createSource({ values: [-999, -999, -999, -999], nodata: -999 });
    const planned = planRasterCalculator('"dem.tif" * 2', [source]);
    expect(planned.ok).toBe(true);
    expect(planned.ok && planned.plan.evaluate().validCount).toBe(0);
  });

  it('keeps the grid metadata of the first referenced raster', () => {
    const planned = planRasterCalculator('"dem.tif" * 2', [createSource({ epsg: 4326 })]);
    expect(planned.ok).toBe(true);
    if (planned.ok) {
      expect(planned.plan.width).toBe(2);
      expect(planned.plan.height).toBe(2);
      expect(planned.plan.geoTransform).toEqual([120, 0.5, 0, 31, 0, -0.5]);
      expect(planned.plan.epsg).toBe(4326);
      expect(planned.plan.referencedNames).toEqual(['dem.tif']);
    }
  });
});
