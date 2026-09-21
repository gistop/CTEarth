import { useState } from 'react';
import { displayLayerName, useGis } from '../../../gisStore';
import { ToolField } from './ToolField';

type GeoprocessingEnvironmentFormProps = {
  maskLayerId?: string;
  onMaskLayerChange?: (maskLayerId: string) => void;
};

export function GeoprocessingEnvironmentForm({
  maskLayerId,
  onMaskLayerChange,
}: GeoprocessingEnvironmentFormProps = {}) {
  const { layers, vectorOverlay } = useGis();
  const [localMaskLayerId, setLocalMaskLayerId] = useState('');
  const selectedMaskLayerId = maskLayerId ?? localMaskLayerId;
  const maskOptions = [
    ...layers
      .filter((item) => hasPolygonFeatures(item.geojson.features))
      .map((item) => ({ id: item.id, label: displayLayerName(item.fileName) })),
    ...(vectorOverlay && hasPolygonFeatures(vectorOverlay.geojson.features)
      ? [{ id: 'vectorOverlay', label: `${displayLayerName(vectorOverlay.name)}（叠加结果）` }]
      : []),
  ];

  const handleMaskLayerChange = (nextMaskLayerId: string) => {
    if (onMaskLayerChange) {
      onMaskLayerChange(nextMaskLayerId);
    } else {
      setLocalMaskLayerId(nextMaskLayerId);
    }
  };

  return (
    <form className="tool-form">
      <ToolField label="输出坐标系">
        <select defaultValue="map">
          <option value="map">与当前地图相同</option>
          <option value="layer">与输入图层相同</option>
        </select>
      </ToolField>
      <ToolField label="处理范围">
        <select defaultValue="default">
          <option value="default">默认</option>
          <option value="display">当前显示范围</option>
        </select>
      </ToolField>
      <ToolField label="掩膜">
        <select value={selectedMaskLayerId} onChange={(event) => handleMaskLayerChange(event.target.value)}>
          <option value="">无掩膜</option>
          {maskOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </ToolField>
      <ToolField label="像元大小">
        <input placeholder="使用参数设置" />
      </ToolField>
      <ToolField label="捕捉栅格" action="folder">
        <input />
      </ToolField>
      <ToolField label="并行处理因子">
        <input defaultValue="50%" />
      </ToolField>
    </form>
  );
}

function hasPolygonFeatures(features: unknown[]) {
  return features.some((feature) => {
    if (!feature || typeof feature !== 'object') {
      return false;
    }

    const geometry = (feature as { geometry?: { type?: unknown } }).geometry;
    return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
  });
}