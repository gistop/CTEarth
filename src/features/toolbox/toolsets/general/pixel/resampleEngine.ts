export type RasterResampleMethod = 'nearest' | 'bilinear' | 'cubic' | 'majority';

export const rasterResampleMethodLabels: Record<RasterResampleMethod, string> = {
  nearest: '最邻近',
  bilinear: '双线性',
  cubic: '三次卷积',
  majority: '众数',
};

export const RASTER_RESAMPLE_METHODS: readonly RasterResampleMethod[] = ['nearest', 'bilinear', 'cubic', 'majority'];

const MAX_OUTPUT_DIMENSION = 20000;
const CUBIC_SHARPNESS = -0.5;

export type RasterResampleSource = {
  width: number;
  height: number;
  geoTransform: number[];
  nodata?: number;
  pixels: Float64Array;
};

export type RasterResamplePlan = {
  method: RasterResampleMethod;
  width: number;
  height: number;
  geoTransform: number[];
  cellSize: number;
  inputCellSize: number;
  evaluate(): { pixels: Float64Array; validCount: number };
};

export type RasterResampleValidation = { ok: true; cellSize: number | null };
export type RasterResampleRejection = { ok: false; error: string };

export type RasterResampleParamsInput = {
  method: unknown;
  cellSize?: unknown;
};

export function validateRasterResampleParams(
  params: RasterResampleParamsInput,
): RasterResampleValidation | RasterResampleRejection {
  const method = params.method;
  if (typeof method !== 'string' || !RASTER_RESAMPLE_METHODS.includes(method as RasterResampleMethod)) {
    return {
      ok: false,
      error: `不支持的重采样方法：${String(method)}。可选：最邻近（nearest）、双线性（bilinear）、三次卷积（cubic）、众数（majority）。`,
    };
  }

  if (params.cellSize === undefined || params.cellSize === null || params.cellSize === '') {
    return { ok: true, cellSize: null };
  }
  const cellSize = typeof params.cellSize === 'number' ? params.cellSize : Number(params.cellSize);
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    return { ok: false, error: '输出像元大小必须是大于 0 的数字。' };
  }
  return { ok: true, cellSize };
}

export function planRasterResample(
  source: RasterResampleSource,
  params: RasterResampleParamsInput,
): { ok: true; plan: RasterResamplePlan } | RasterResampleRejection {
  const validation = validateRasterResampleParams(params);
  if (!validation.ok) {
    return validation;
  }
  if (source.width <= 0 || source.height <= 0 || source.pixels.length < source.width * source.height) {
    return { ok: false, error: '输入栅格像元数据不完整，无法重采样。' };
  }

  const transform = source.geoTransform;
  if (transform.length < 6 || transform[2] !== 0 || transform[4] !== 0 || !transform[1] || !transform[5]) {
    return { ok: false, error: '仅支持北向上（无旋转）且具有有效像元大小的栅格进行重采样。' };
  }

  const inputCellSize = Math.abs(transform[1]);
  const inputCellSizeY = Math.abs(transform[5]);
  const cellSize = validation.cellSize ?? inputCellSize;
  const factor = cellSize / inputCellSize;
  const cellSizeY = inputCellSizeY * factor;
  const width = Math.max(1, Math.ceil(source.width / factor - 1e-9));
  const height = Math.max(1, Math.ceil(source.height / factor - 1e-9));

  if (width > MAX_OUTPUT_DIMENSION || height > MAX_OUTPUT_DIMENSION) {
    return { ok: false, error: `输出像元数量过大（${width} x ${height}），请增大输出像元大小后重试。` };
  }

  const outputTransform = [
    transform[0],
    Math.sign(transform[1]) * cellSize,
    0,
    transform[3],
    0,
    Math.sign(transform[5]) * cellSizeY,
  ];
  const method = params.method as RasterResampleMethod;
  const nodata = source.nodata;
  const isValid = (value: number) => Number.isFinite(value) && value !== nodata;

  return {
    ok: true,
    plan: {
      method,
      width,
      height,
      geoTransform: outputTransform,
      cellSize,
      inputCellSize,
      evaluate: () => {
        const pixels = new Float64Array(width * height);
        pixels.fill(nodata ?? Number.NaN);
        let validCount = 0;
        for (let row = 0; row < height; row++) {
          for (let column = 0; column < width; column++) {
            const value = sampleOutputCell(column, row);
            if (Number.isFinite(value) && value !== nodata) {
              pixels[row * width + column] = value;
              validCount++;
            }
          }
        }
        return { pixels, validCount };

        function sampleOutputCell(column: number, row: number): number {
          const outputCenterX = outputTransform[0] + (column + 0.5) * outputTransform[1];
          const outputCenterY = outputTransform[3] + (row + 0.5) * outputTransform[5];
          const fractionalColumn = (outputCenterX - transform[0]) / transform[1] - 0.5;
          const fractionalRow = (outputCenterY - transform[3]) / transform[5] - 0.5;

          if (method === 'nearest') {
            return nearestValue(fractionalColumn, fractionalRow);
          }
          if (method === 'majority') {
            return majorityValue(column, row, fractionalColumn, fractionalRow);
          }
          return interpolateValue(fractionalColumn, fractionalRow, method === 'bilinear' ? 2 : 4);
        }

        function nearestValue(fractionalColumn: number, fractionalRow: number): number {
          const column = Math.round(fractionalColumn);
          const row = Math.round(fractionalRow);
          if (column < 0 || column >= source.width || row < 0 || row >= source.height) {
            return Number.NaN;
          }
          const value = source.pixels[row * source.width + column];
          return isValid(value) ? value : Number.NaN;
        }

        function majorityValue(column: number, row: number, fallbackColumn: number, fallbackRow: number): number {
          const left = (outputTransform[0] + column * outputTransform[1] - transform[0]) / transform[1];
          const right = (outputTransform[0] + (column + 1) * outputTransform[1] - transform[0]) / transform[1];
          const top = (outputTransform[3] + row * outputTransform[5] - transform[3]) / transform[5];
          const bottom = (outputTransform[3] + (row + 1) * outputTransform[5] - transform[3]) / transform[5];
          const columnStart = Math.max(0, Math.ceil(Math.min(left, right) - 0.5));
          const columnEnd = Math.min(source.width - 1, Math.ceil(Math.max(left, right) - 0.5) - 1);
          const rowStart = Math.max(0, Math.ceil(Math.min(top, bottom) - 0.5));
          const rowEnd = Math.min(source.height - 1, Math.ceil(Math.max(top, bottom) - 0.5) - 1);

          if (columnEnd < columnStart || rowEnd < rowStart) {
            return nearestValue(fallbackColumn, fallbackRow);
          }

          const counts = new Map<number, number>();
          for (let sourceRow = rowStart; sourceRow <= rowEnd; sourceRow++) {
            for (let sourceColumn = columnStart; sourceColumn <= columnEnd; sourceColumn++) {
              const value = source.pixels[sourceRow * source.width + sourceColumn];
              if (!isValid(value)) {
                continue;
              }
              counts.set(value, (counts.get(value) ?? 0) + 1);
            }
          }
          let bestValue = Number.NaN;
          let bestCount = 0;
          for (const [value, count] of counts) {
            if (count > bestCount || (count === bestCount && value < bestValue)) {
              bestValue = value;
              bestCount = count;
            }
          }
          return bestValue;
        }

        function interpolateValue(fractionalColumn: number, fractionalRow: number, kernelSize: 2 | 4): number {
          const columnOrigin = Math.floor(fractionalColumn);
          const rowOrigin = Math.floor(fractionalRow);
          const columnOffset = fractionalColumn - columnOrigin;
          const rowOffset = fractionalRow - rowOrigin;
          const columnStart = kernelSize === 2 ? 0 : -1;
          const rowStart = kernelSize === 2 ? 0 : -1;
          const weightOf = kernelSize === 2 ? bilinearWeight : cubicWeight;

          let weightedSum = 0;
          let weightSum = 0;
          for (let rowDelta = rowStart; rowDelta < rowStart + kernelSize; rowDelta++) {
            const sourceRow = rowOrigin + rowDelta;
            if (sourceRow < 0 || sourceRow >= source.height) {
              continue;
            }
            const rowWeight = weightOf(rowOffset - rowDelta);
            if (rowWeight === 0) {
              continue;
            }
            for (let columnDelta = columnStart; columnDelta < columnStart + kernelSize; columnDelta++) {
              const sourceColumn = columnOrigin + columnDelta;
              if (sourceColumn < 0 || sourceColumn >= source.width) {
                continue;
              }
              const weight = rowWeight * weightOf(columnOffset - columnDelta);
              if (weight === 0) {
                continue;
              }
              const value = source.pixels[sourceRow * source.width + sourceColumn];
              if (!isValid(value)) {
                continue;
              }
              weightedSum += value * weight;
              weightSum += weight;
            }
          }
          return weightSum > 0 ? weightedSum / weightSum : Number.NaN;
        }

        function bilinearWeight(distance: number): number {
          const absolute = Math.abs(distance);
          return absolute <= 1 ? 1 - absolute : 0;
        }

        function cubicWeight(distance: number): number {
          const absolute = Math.abs(distance);
          if (absolute >= 2) {
            return 0;
          }
          if (absolute <= 1) {
            return (CUBIC_SHARPNESS + 2) * absolute ** 3 - (CUBIC_SHARPNESS + 3) * absolute ** 2 + 1;
          }
          return (
            CUBIC_SHARPNESS * absolute ** 3
            - 5 * CUBIC_SHARPNESS * absolute ** 2
            + 8 * CUBIC_SHARPNESS * absolute
            - 4 * CUBIC_SHARPNESS
          );
        }
      },
    },
  };
}
