export type RasterReclassifyMethod = 'jenks' | 'quantile' | 'equalInterval' | 'custom';

export const rasterReclassifyMethodLabels: Record<RasterReclassifyMethod, string> = {
  jenks: '自然间断点',
  quantile: '分位数',
  equalInterval: '等间距',
  custom: '自定义间距',
};

export const RASTER_RECLASSIFY_METHODS: readonly RasterReclassifyMethod[] = ['jenks', 'quantile', 'equalInterval', 'custom'];

const MIN_CLASS_COUNT = 2;
const MAX_CLASS_COUNT = 64;
const JENKS_SAMPLE_LIMIT = 2048;

export type RasterReclassifyPlan = {
  method: RasterReclassifyMethod;
  breaks: number[];
  classCount: number;
  min: number;
  max: number;
  evaluate(): { pixels: Float64Array; validCount: number; histogram: number[] };
};

export type RasterReclassifyValidation = {
  ok: true;
  classCount: number | null;
  customBreaks: number[] | null;
};

export type RasterReclassifyRejection = { ok: false; error: string };

export type RasterReclassifyParamsInput = {
  method: unknown;
  classCount?: unknown;
  customBreaks?: unknown;
};

export function validateRasterReclassifyParams(
  params: RasterReclassifyParamsInput,
): RasterReclassifyValidation | RasterReclassifyRejection {
  const method = params.method;
  if (typeof method !== 'string' || !RASTER_RECLASSIFY_METHODS.includes(method as RasterReclassifyMethod)) {
    return {
      ok: false,
      error: `不支持的重分类方法：${String(method)}。可选：自然间断点（jenks）、分位数（quantile）、等间距（equalInterval）、自定义间距（custom）。`,
    };
  }

  if (method === 'custom') {
    return parseCustomBreaks(params.customBreaks);
  }

  const classCount = typeof params.classCount === 'number' ? params.classCount : Number(params.classCount);
  if (!Number.isInteger(classCount) || classCount < MIN_CLASS_COUNT || classCount > MAX_CLASS_COUNT) {
    return { ok: false, error: `分类数必须是 ${MIN_CLASS_COUNT} 到 ${MAX_CLASS_COUNT} 之间的整数。` };
  }
  return { ok: true, classCount, customBreaks: null };
}

export function planRasterReclassify(
  pixels: Float64Array,
  nodata: number | undefined,
  params: RasterReclassifyParamsInput,
): { ok: true; plan: RasterReclassifyPlan } | RasterReclassifyRejection {
  const validation = validateRasterReclassifyParams(params);
  if (!validation.ok) {
    return validation;
  }

  const sorted: number[] = [];
  for (let index = 0; index < pixels.length; index++) {
    const value = pixels[index];
    if (Number.isFinite(value) && value !== nodata) {
      sorted.push(value);
    }
  }

  if (sorted.length < MIN_CLASS_COUNT) {
    return { ok: false, error: '没有足够的有效像元用于重分类。' };
  }

  sorted.sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const method = params.method as RasterReclassifyMethod;

  let breaks: number[];
  if (method === 'custom') {
    breaks = sanitizeBreaks(validation.customBreaks ?? [], sorted);
  } else if (min === max) {
    return { ok: false, error: '有效像元值全部相同，无法分级。' };
  } else if (method === 'equalInterval') {
    breaks = sanitizeBreaks(equalIntervalBreaks(min, max, validation.classCount ?? MIN_CLASS_COUNT), sorted);
  } else if (method === 'quantile') {
    breaks = sanitizeBreaks(quantileBreaks(sorted, validation.classCount ?? MIN_CLASS_COUNT), sorted);
  } else {
    breaks = sanitizeBreaks(jenksBreaks(prepareJenksSample(sorted), validation.classCount ?? MIN_CLASS_COUNT), sorted);
  }

  if (breaks.length === 0) {
    return { ok: false, error: '无法从当前像元值计算出有效的分类间断点，请调整分类数或改用自定义间距。' };
  }

  return {
    ok: true,
    plan: {
      method,
      breaks,
      classCount: breaks.length + 1,
      min,
      max,
      evaluate: () => {
        const output = new Float64Array(pixels.length);
        output.fill(nodata ?? Number.NaN);
        const histogram = new Array<number>(breaks.length + 1).fill(0);
        let validCount = 0;
        for (let index = 0; index < pixels.length; index++) {
          const value = pixels[index];
          if (!Number.isFinite(value) || value === nodata) {
            continue;
          }
          let classIndex = 1;
          for (let position = 0; position < breaks.length; position++) {
            if (value > breaks[position]) {
              classIndex++;
            } else {
              break;
            }
          }
          output[index] = classIndex;
          histogram[classIndex - 1]++;
          validCount++;
        }
        return { pixels: output, validCount, histogram };
      },
    },
  };
}

function parseCustomBreaks(value: unknown): RasterReclassifyValidation | RasterReclassifyRejection {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    return { ok: false, error: '自定义间距需要提供至少一个间断点，例如 100, 200, 500。' };
  }
  const breaks: number[] = [];
  for (const token of text.split(/[,，\s]+/).filter(Boolean)) {
    const parsed = Number(token);
    if (!Number.isFinite(parsed)) {
      return { ok: false, error: `间断点必须是数字："${token}"。` };
    }
    breaks.push(parsed);
  }
  for (let index = 1; index < breaks.length; index++) {
    if (breaks[index] <= breaks[index - 1]) {
      return { ok: false, error: '自定义间断点必须严格递增。' };
    }
  }
  if (breaks.length > MAX_CLASS_COUNT - 1) {
    return { ok: false, error: `自定义间断点最多 ${MAX_CLASS_COUNT - 1} 个（${MAX_CLASS_COUNT} 类）。` };
  }
  return { ok: true, classCount: null, customBreaks: breaks };
}

function equalIntervalBreaks(min: number, max: number, classCount: number): number[] {
  const breaks: number[] = [];
  const span = max - min;
  for (let index = 1; index < classCount; index++) {
    breaks.push(min + (span * index) / classCount);
  }
  return breaks;
}

function quantileBreaks(sorted: readonly number[], classCount: number): number[] {
  const total = sorted.length;
  const breaks: number[] = [];
  for (let index = 1; index < classCount; index++) {
    const target = Math.ceil((index * total) / classCount) - 1;
    let position = Math.max(0, Math.min(total - 2, target));
    const previous = breaks[breaks.length - 1];
    while (position < total - 1 && sorted[position] <= (previous ?? Number.NEGATIVE_INFINITY)) {
      position++;
    }
    if (sorted[position] <= (previous ?? Number.NEGATIVE_INFINITY) || sorted[position] >= sorted[total - 1]) {
      break;
    }
    breaks.push(sorted[position]);
  }
  return breaks;
}

/**
 * Fisher-Jenks 自然间断点：动态规划最小化组内方差。
 * 参见 Fisher (1958) 与 Jenks-Caspall 的经典实现。输入必须升序。
 */
function jenksBreaks(sorted: readonly number[], classCount: number): number[] {
  const count = sorted.length;
  if (classCount <= 1 || count < 2) {
    return [];
  }
  if (classCount >= count) {
    const distinct = Array.from(new Set(sorted));
    return distinct.length > 1 ? distinct.slice(1) : [];
  }

  const lowerClassLimits: number[][] = [];
  const varianceCombinations: number[][] = [];
  for (let index = 0; index <= count; index++) {
    lowerClassLimits.push(new Array<number>(classCount + 1).fill(0));
    varianceCombinations.push(new Array<number>(classCount + 1).fill(0));
  }

  for (let index = 1; index <= classCount; index++) {
    lowerClassLimits[1][index] = 1;
    for (let position = 2; position <= count; position++) {
      varianceCombinations[position][index] = Number.POSITIVE_INFINITY;
    }
  }

  for (let upper = 2; upper <= count; upper++) {
    let sum = 0;
    let sumSquares = 0;
    let weight = 0;
    let variance = 0;
    for (let offset = 1; offset <= upper; offset++) {
      const lowerClassLimit = upper - offset + 1;
      const value = sorted[lowerClassLimit - 1];
      sum += value;
      sumSquares += value * value;
      weight++;
      variance = sumSquares - (sum * sum) / weight;
      if (lowerClassLimit !== 1) {
        for (let index = 2; index <= classCount; index++) {
          const candidate = variance + varianceCombinations[lowerClassLimit - 1][index - 1];
          if (varianceCombinations[upper][index] >= candidate) {
            lowerClassLimits[upper][index] = lowerClassLimit;
            varianceCombinations[upper][index] = candidate;
          }
        }
      }
    }
    lowerClassLimits[upper][1] = 1;
    varianceCombinations[upper][1] = variance;
  }

  const boundaries = new Array<number>(classCount + 1);
  boundaries[0] = sorted[0];
  boundaries[classCount] = sorted[count - 1];
  let upper = count;
  for (let index = classCount; index > 1; index--) {
    const limit = Math.round(lowerClassLimits[upper][index]);
    boundaries[index - 1] = sorted[limit - 2];
    upper = limit - 1;
  }
  return boundaries.slice(1, -1);
}

function prepareJenksSample(sorted: readonly number[]): number[] {
  if (sorted.length <= JENKS_SAMPLE_LIMIT) {
    return sorted as number[];
  }
  const stride = sorted.length / JENKS_SAMPLE_LIMIT;
  const sample: number[] = [];
  for (let index = 0; index < JENKS_SAMPLE_LIMIT; index++) {
    sample.push(sorted[Math.floor(index * stride)]);
  }
  return sample;
}

/**
 * 过滤间断点：每个类必须至少包含一个有效值。
 * 语义：值 v 属于类 1 + #{b ∈ breaks : v > b}，即间断点归属下界（v == b 时留在下面的类）。
 */
function sanitizeBreaks(breaks: readonly number[], sorted: readonly number[]): number[] {
  const result: number[] = [];
  for (const value of breaks) {
    if (!Number.isFinite(value)) {
      continue;
    }
    const previous = result[result.length - 1];
    if (previous !== undefined && value <= previous) {
      continue;
    }
    const previousBoundary = previous ?? Number.NEGATIVE_INFINITY;
    if (countInRange(sorted, previousBoundary, value) === 0 || countGreaterThan(sorted, value) === 0) {
      continue;
    }
    result.push(value);
  }
  return result;
}

function countInRange(sorted: readonly number[], exclusiveLower: number, inclusiveUpper: number): number {
  return upperBound(sorted, inclusiveUpper) - upperBound(sorted, exclusiveLower);
}

function countGreaterThan(sorted: readonly number[], value: number): number {
  return sorted.length - upperBound(sorted, value);
}

function upperBound(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}
