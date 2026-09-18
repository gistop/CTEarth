import { useMemo } from 'react';
import type {
  BufferParameters as BufferRunParameters,
  ExtractByMaskParameters as ExtractByMaskRunParameters,
  IdwParameters as IdwRunParameters,
  OverlayParameters as OverlayRunParameters,
  OverlayToolId,
  RasterCalculatorParameters as RasterCalculatorRunParameters,
  RasterReclassifyParameters as RasterReclassifyRunParameters,
  RasterResampleParameters as RasterResampleRunParameters,
  TerrainParameters as TerrainRunParameters,
  TerrainToolId,
} from '../../../../../gisStore';
import { displayLayerName, useGis } from '../../../../../gisStore';
import { ToolField } from '../../../components/ToolField';
import { validateRasterExpression } from '../pixel/rasterCalculatorEngine';
import {
  planRasterReclassify,
  rasterReclassifyMethodLabels,
  RASTER_RECLASSIFY_METHODS,
  type RasterReclassifyMethod,
} from '../pixel/reclassifyEngine';
import {
  planRasterResample,
  rasterResampleMethodLabels,
  RASTER_RESAMPLE_METHODS,
} from '../pixel/resampleEngine';
import {
  hasPolygonOverlayFeatures,
  idwLayerDisplayName,
  isPolygonOverlaySource,
  analysisToolTitles,
} from '../services/analysisToolService';

export function IdwParametersForm({
  params,
  onChange,
}: {
  params: IdwRunParameters;
  onChange: (name: keyof IdwRunParameters, value: string) => void;
}) {
  const { layer, layers, setActiveLayer, setSelectedField } = useGis();
  const pointLayerOptions = layers.filter((item) => item.points.features.length > 0);
  const selectedLayer = pointLayerOptions.find((item) => item.id === params.layerId)
    ?? (layer && layer.points.features.length > 0 ? layer : null)
    ?? pointLayerOptions[0]
    ?? null;
  const fieldOptions = selectedLayer?.numericFields ?? [];

  return (
    <form className="tool-form">
      <ToolField label="输入点要素" required action="folder">
        <select
          value={selectedLayer?.id ?? ''}
          onChange={(event) => {
            const nextLayer = pointLayerOptions.find((item) => item.id === event.target.value);
            onChange('layerId', event.target.value);
            onChange('field', nextLayer?.selectedField ?? nextLayer?.numericFields[0] ?? '');
            if (nextLayer) setActiveLayer(nextLayer.id);
          }}
        >
          <option value="" disabled>选择点图层</option>
          {pointLayerOptions.map((item) => (
            <option key={item.id} value={item.id}>{idwLayerDisplayName(item.fileName)}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="Z 值字段" required action="settings">
        <select
          value={params.field}
          onChange={(event) => {
            onChange('field', event.target.value);
            if (selectedLayer?.id === layer?.id) setSelectedField(event.target.value);
          }}
        >
          <option value="" disabled>选择字段</option>
          {fieldOptions.map((field) => <option key={field} value={field}>{field}</option>)}
        </select>
      </ToolField>
      <ToolField label="输出栅格" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      <ToolField label="输出像元大小">
        <input value={params.cellSize} onChange={(event) => onChange('cellSize', event.target.value)} />
      </ToolField>
      <ToolField label="幂">
        <input value={params.weight} type="number" min="0.1" step="0.1" onChange={(event) => onChange('weight', event.target.value)} />
      </ToolField>
      <ToolField label="搜索半径">
        <input value={params.radius} type="number" min="0" step="any" onChange={(event) => onChange('radius', event.target.value)} />
      </ToolField>
      <ToolField label="点数">
        <input value={params.minPoints} type="number" min="0" step="1" onChange={(event) => onChange('minPoints', event.target.value)} />
      </ToolField>
      <ToolField label="最大距离"><input /></ToolField>
      <ToolField label="输入障碍折线要素" action="folder"><input /></ToolField>
    </form>
  );
}

export function BufferParametersForm({
  params,
  onChange,
}: {
  params: BufferRunParameters;
  onChange: (name: keyof BufferRunParameters, value: string | boolean) => void;
}) {
  const { layer } = useGis();

  return (
    <form className="tool-form">
      <ToolField label="输入要素" required action="folder">
        <input value={layer?.fileName ?? ''} readOnly placeholder="请先在左侧上传 Shapefile ZIP" />
      </ToolField>
      <ToolField label="输出要素" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      <ToolField label="距离" required>
        <input value={params.distance} type="number" min="0.000001" step="any" onChange={(event) => onChange('distance', event.target.value)} />
      </ToolField>
      <ToolField label="圆弧段数">
        <input value={params.quadrantSegments} type="number" min="1" step="1" onChange={(event) => onChange('quadrantSegments', event.target.value)} />
      </ToolField>
      <ToolField label="端点样式">
        <select value={params.capStyle} onChange={(event) => onChange('capStyle', event.target.value)}>
          <option value="round">圆形</option><option value="flat">平直</option><option value="square">方形</option>
        </select>
      </ToolField>
      <ToolField label="连接样式">
        <select value={params.joinStyle} onChange={(event) => onChange('joinStyle', event.target.value)}>
          <option value="round">圆形</option><option value="bevel">斜角</option><option value="mitre">尖角</option>
        </select>
      </ToolField>
      <ToolField label="融合结果">
        <input checked={params.dissolve} type="checkbox" onChange={(event) => onChange('dissolve', event.target.checked)} />
      </ToolField>
    </form>
  );
}

export function OverlayParametersForm({
  tool,
  params,
  onChange,
}: {
  tool: OverlayToolId;
  params: OverlayRunParameters;
  onChange: (name: keyof OverlayRunParameters, value: string) => void;
}) {
  const { layers, vectorOverlay } = useGis();
  const polygonLayers = layers.filter(isPolygonOverlaySource);
  const polygonVectorOverlay = vectorOverlay && hasPolygonOverlayFeatures(vectorOverlay.geojson.features);
  const layerOptions = [
    ...polygonLayers.map((item) => ({ id: item.id, label: displayLayerName(item.fileName) })),
    ...(polygonVectorOverlay ? [{ id: 'vectorOverlay', label: `${displayLayerName(vectorOverlay.name)}（叠加结果）` }] : []),
  ];
  const overlayOptions = layerOptions.filter((option) => option.id !== params.inputLayerId);

  return (
    <form className="tool-form">
      <ToolField label="输入要素" required action="folder">
        <select
          value={params.inputLayerId}
          onChange={(event) => {
            const inputLayerId = event.target.value;
            const nextOverlayLayerId = params.overlayLayerId === inputLayerId
              ? layerOptions.find((option) => option.id !== inputLayerId)?.id ?? ''
              : params.overlayLayerId;
            onChange('inputLayerId', inputLayerId);
            onChange('overlayLayerId', nextOverlayLayerId);
          }}
        >
          <option value="" disabled>选择输入图层</option>
          {layerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </ToolField>
      <ToolField label="叠加要素" required action="folder">
        <select value={params.overlayLayerId} onChange={(event) => onChange('overlayLayerId', event.target.value)}>
          <option value="" disabled>选择叠加图层</option>
          {overlayOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </ToolField>
      <ToolField label="输出要素" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      <ToolField label="捕捉容差">
        <input value={params.snapTolerance} type="number" min="0" step="any" placeholder="默认" onChange={(event) => onChange('snapTolerance', event.target.value)} />
      </ToolField>
      <ToolField label="叠加类型"><input value={analysisToolTitles[tool]} readOnly /></ToolField>
    </form>
  );
}

export function ExtractByMaskParametersForm({
  params,
  onChange,
}: {
  params: ExtractByMaskRunParameters;
  onChange: (name: keyof ExtractByMaskRunParameters, value: string | boolean) => void;
}) {
  const { layers, raster, vectorOverlay } = useGis();
  const maskOptions = [
    ...layers.filter(isPolygonOverlaySource).map((item) => ({ id: item.id, label: displayLayerName(item.fileName) })),
    ...(vectorOverlay && hasPolygonOverlayFeatures(vectorOverlay.geojson.features)
      ? [{ id: 'vectorOverlay', label: displayLayerName(vectorOverlay.name) }]
      : []),
  ];

  return (
    <form className="tool-form">
      <ToolField label="输入栅格" required action="folder">
        <input value={raster?.name ?? ''} readOnly placeholder="请先添加 GeoTIFF 栅格" />
      </ToolField>
      <ToolField label="输入掩膜数据" required action="folder">
        <select value={params.maskLayerId} onChange={(event) => onChange('maskLayerId', event.target.value)}>
          <option value="" disabled>选择面图层或缓冲区结果</option>
          {maskOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </ToolField>
      <ToolField label="输出栅格" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      <ToolField label="保持输入栅格尺寸">
        <input checked={params.maintainDimensions} type="checkbox" onChange={(event) => onChange('maintainDimensions', event.target.checked)} />
      </ToolField>
    </form>
  );
}

export function TerrainParametersForm({
  tool,
  params,
  onChange,
}: {
  tool: TerrainToolId;
  params: TerrainRunParameters;
  onChange: (name: keyof TerrainRunParameters, value: string) => void;
}) {
  const { raster } = useGis();

  return (
    <form className="tool-form">
      <ToolField label="输入 DEM" required action="folder">
        <input value={raster?.name ?? ''} readOnly placeholder="请先添加 DEM GeoTIFF" />
      </ToolField>
      <ToolField label="输出栅格" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      <ToolField label="Z 因子">
        <input value={params.zFactor} type="number" min="0.000001" step="any" onChange={(event) => onChange('zFactor', event.target.value)} />
      </ToolField>
      {tool === 'hillshade' ? (
        <>
          <ToolField label="太阳高度角"><input value={params.altitude} type="number" min="0" max="90" step="any" onChange={(event) => onChange('altitude', event.target.value)} /></ToolField>
          <ToolField label="太阳方位角"><input value={params.azimuth} type="number" min="0" max="360" step="any" onChange={(event) => onChange('azimuth', event.target.value)} /></ToolField>
        </>
      ) : null}
      {tool === 'slope' ? (
        <ToolField label="输出单位">
          <select value={params.units} onChange={(event) => onChange('units', event.target.value)}>
            <option value="degrees">degrees</option><option value="radians">radians</option><option value="percent">percent</option>
          </select>
        </ToolField>
      ) : null}
    </form>
  );
}

const RASTER_CALCULATOR_TOKENS = ['+', '-', '*', '/', '%', '(', ')', '&&', '||'] as const;

export function RasterCalculatorForm({
  params,
  onChange,
}: {
  params: RasterCalculatorRunParameters;
  onChange: (name: keyof RasterCalculatorRunParameters, value: string) => void;
}) {
  const { rasters } = useGis();
  const validation = validateRasterExpression(params.expression, rasters);
  const appendToken = (token: string) => {
    const current = params.expression;
    const needsSpace = current.length > 0 && !/\s$/.test(current);
    onChange('expression', `${current}${needsSpace ? ' ' : ''}${token}`);
  };

  return (
    <form className="tool-form">
      <ToolField label="地图代数表达式" required>
        <textarea
          className="tool-expression"
          rows={3}
          value={params.expression}
          placeholder={'例如："dem.tif" * 2 + "slope.tif"'}
          onChange={(event) => onChange('expression', event.target.value)}
        />
      </ToolField>
      <div className="tool-field">
        <span>栅格</span>
        <div className="tool-field-control">
          <select
            aria-label="插入栅格名称"
            value=""
            onChange={(event) => {
              if (event.target.value) {
                appendToken(`"${event.target.value}"`);
              }
            }}
          >
            <option value="" disabled>点击插入栅格名称</option>
            {rasters.map((item) => (
              <option key={item.id} value={item.name}>{item.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="tool-field">
        <span>运算符</span>
        <div className="tool-operator-row" role="group" aria-label="插入运算符">
          {RASTER_CALCULATOR_TOKENS.map((token) => (
            <button key={token} type="button" onClick={() => appendToken(token)}>{token}</button>
          ))}
          <button type="button" onClick={() => appendToken('con(, , )')}>con</button>
          <button type="button" onClick={() => appendToken('isnull()')}>isnull</button>
        </div>
      </div>
      {params.expression.trim() && !validation.ok ? (
        <p className="tool-expression-error" role="alert">{validation.error}</p>
      ) : null}
      <ToolField label="输出栅格" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
    </form>
  );
}

function formatReclassifyValue(value: number) {
  return String(Math.round(value * 1e6) / 1e6);
}

export function RasterReclassifyForm({
  params,
  onChange,
}: {
  params: RasterReclassifyRunParameters;
  onChange: (name: keyof RasterReclassifyRunParameters, value: string) => void;
}) {
  const { rasters, setActiveRaster } = useGis();
  const selectedRaster = rasters.find((item) => item.id === params.rasterId) ?? rasters[0] ?? null;
  const preview = useMemo(
    () => (selectedRaster
      ? planRasterReclassify(selectedRaster.pixels, selectedRaster.nodata, {
        method: params.method,
        classCount: params.classCount,
        customBreaks: params.customBreaks,
      })
      : null),
    [selectedRaster, params.method, params.classCount, params.customBreaks],
  );
  const evaluated = preview?.ok ? preview.plan.evaluate() : null;

  return (
    <form className="tool-form">
      <ToolField label="输入栅格" required action="folder">
        <select
          value={selectedRaster?.id ?? ''}
          onChange={(event) => {
            onChange('rasterId', event.target.value);
            if (rasters.some((item) => item.id === event.target.value)) {
              setActiveRaster(event.target.value);
            }
          }}
        >
          <option value="" disabled>选择栅格</option>
          {rasters.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="重分类方法" required>
        <select value={params.method} onChange={(event) => onChange('method', event.target.value)}>
          {RASTER_RECLASSIFY_METHODS.map((method) => (
            <option key={method} value={method}>{rasterReclassifyMethodLabels[method]}</option>
          ))}
        </select>
      </ToolField>
      {params.method === 'custom' ? (
        <ToolField label="间断点" required>
          <input
            value={params.customBreaks}
            placeholder="例如：100, 200, 500"
            onChange={(event) => onChange('customBreaks', event.target.value)}
          />
        </ToolField>
      ) : (
        <ToolField label="分类数" required>
          <input
            value={params.classCount}
            type="number"
            min="2"
            max="64"
            step="1"
            onChange={(event) => onChange('classCount', event.target.value)}
          />
        </ToolField>
      )}
      <ToolField label="输出栅格" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      {preview && !preview.ok ? (
        <p className="tool-expression-error" role="alert">{preview.error}</p>
      ) : null}
      {preview?.ok && evaluated ? (
        <div className="tool-field">
          <span>分类预览</span>
          <div className="tool-reclass-preview" aria-label="分类预览">
            <div className="tool-reclass-preview-header">
              <span>类</span>
              <span>范围</span>
              <span>像元数</span>
            </div>
            {Array.from({ length: preview.plan.classCount }, (_, index) => index + 1).map((classIndex) => {
              const lower = classIndex === 1 ? preview.plan.min : preview.plan.breaks[classIndex - 2];
              const upper = classIndex === preview.plan.classCount ? preview.plan.max : preview.plan.breaks[classIndex - 1];
              return (
                <div key={classIndex} className="tool-reclass-preview-row">
                  <span>{classIndex}</span>
                  <span>{`${formatReclassifyValue(lower)} ~ ${formatReclassifyValue(upper)}`}</span>
                  <span>{evaluated.histogram[classIndex - 1]}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </form>
  );
}

export function RasterResampleForm({
  params,
  onChange,
}: {
  params: RasterResampleRunParameters;
  onChange: (name: keyof RasterResampleRunParameters, value: string) => void;
}) {
  const { rasters, setActiveRaster } = useGis();
  const selectedRaster = rasters.find((item) => item.id === params.rasterId) ?? rasters[0] ?? null;
  const preview = useMemo(
    () => (selectedRaster
      ? planRasterResample(
        {
          width: selectedRaster.width,
          height: selectedRaster.height,
          geoTransform: selectedRaster.geoTransform,
          nodata: selectedRaster.nodata,
          pixels: selectedRaster.pixels,
        },
        { method: params.method, cellSize: params.cellSize },
      )
      : null),
    [selectedRaster, params.method, params.cellSize],
  );

  return (
    <form className="tool-form">
      <ToolField label="输入栅格" required action="folder">
        <select
          value={selectedRaster?.id ?? ''}
          onChange={(event) => {
            onChange('rasterId', event.target.value);
            if (rasters.some((item) => item.id === event.target.value)) {
              setActiveRaster(event.target.value);
            }
          }}
        >
          <option value="" disabled>选择栅格</option>
          {rasters.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="重采样方法" required>
        <select value={params.method} onChange={(event) => onChange('method', event.target.value)}>
          {RASTER_RESAMPLE_METHODS.map((method) => (
            <option key={method} value={method}>{rasterResampleMethodLabels[method]}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="输出像元大小">
        <input
          value={params.cellSize}
          type="number"
          min="0.000001"
          step="any"
          placeholder={selectedRaster ? String(formatReclassifyValue(Math.abs(selectedRaster.geoTransform[1] || 1))) : '与输入一致'}
          onChange={(event) => onChange('cellSize', event.target.value)}
        />
      </ToolField>
      <ToolField label="输出栅格" required action="folder">
        <input value={params.outputName} onChange={(event) => onChange('outputName', event.target.value)} />
      </ToolField>
      {preview && !preview.ok ? (
        <p className="tool-expression-error" role="alert">{preview.error}</p>
      ) : null}
      {preview?.ok ? (
        <div className="tool-field">
          <span>输出网格</span>
          <div className="tool-resample-preview">
            {`${preview.plan.width} x ${preview.plan.height} 像元，像元大小 ${formatReclassifyValue(preview.plan.cellSize)}`}
          </div>
        </div>
      ) : null}
    </form>
  );
}
