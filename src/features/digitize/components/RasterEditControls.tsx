import { useState } from 'react';
import { Download, Layers, Play, SquareDashedMousePointer } from 'lucide-react';
import { displayLayerName, useGis } from '../../../gisStore';
import { useDigitize } from '../stores/DigitizeContext';
import { isValidRasterEditValue } from '../services/digitizeValidation';

export function RasterEditControls() {
  const [value, setValue] = useState('0');
  const digitize = useDigitize();
  const { editRasterByAoi, isRunning, raster, saveRasterLayer } = useGis();
  const hasValidValue = isValidRasterEditValue(value);

  return (
    <div className="ribbon-raster-edit">
      <div className="ribbon-raster-edit-head">
        <label className="ribbon-layer-select">
          <Layers size={18} strokeWidth={1.7} />
          <select value={raster ? 'raster' : ''} disabled={!raster} aria-label="当前栅格图层">
            {raster ? (
              <option value="raster">{displayLayerName(raster.name)}</option>
            ) : (
              <option value="">无栅格图层</option>
            )}
          </select>
        </label>
        <label className="ribbon-aoi-values" title="在 AOI 命中的像元上标注像元值">
          <input
            type="checkbox"
            checked={digitize.rasterPixelValuesVisible}
            disabled={!raster}
            aria-label="显示像元值"
            onChange={(event) => digitize.setRasterPixelValuesVisible(event.target.checked)}
          />
          <span>显示像元值</span>
        </label>
      </div>
      <button
        className={digitize.rasterAoiActive ? 'ribbon-aoi-button is-active' : 'ribbon-aoi-button'}
        type="button"
        title="绘制 AOI"
        disabled={!raster}
        aria-pressed={digitize.rasterAoiActive}
        onClick={digitize.startRasterAoi}
      >
        <SquareDashedMousePointer size={23} strokeWidth={1.6} />
        <span>AOI</span>
      </button>
      <label className="ribbon-value-input">
        <span>修改值</span>
        <input
          type="number"
          value={value}
          aria-label="新像元值"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button
        className="ribbon-icon-only-button"
        type="button"
        title="执行栅格修改"
        disabled={!raster || !digitize.rasterAoi || !hasValidValue || isRunning}
        onClick={() => {
          if (digitize.rasterAoi) {
            void editRasterByAoi({ polygon: digitize.rasterAoi, value });
          }
        }}
      >
        <Play size={23} strokeWidth={1.6} />
      </button>
      <button
        className="ribbon-icon-only-button"
        type="button"
        title="下载 GeoTIFF"
        disabled={!raster || isRunning}
        onClick={() => void saveRasterLayer()}
      >
        <Download size={23} strokeWidth={1.6} />
      </button>
    </div>
  );
}
