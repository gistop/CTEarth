import { useRef, type ChangeEvent } from 'react';
import { Database, Grid2X2, Layers, Map, PenTool, Search, Upload } from 'lucide-react';
import { useGis } from '../../gisStore';

export function ContentsPanel() {
  return (
    <aside className="panel-shell contents-panel">
      <LayerSection />
    </aside>
  );
}

function LayerSection() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { layer, message, uploadGeoJson, uploadShapefileZip } = useGis();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (/\.geojson$/i.test(file.name) || /\.json$/i.test(file.name)) {
      await uploadGeoJson(file);
    } else {
      await uploadShapefileZip(file);
    }

    event.target.value = '';
  };

  return (
    <section className="contents-layer-section" aria-label="图层内容">
      <div className="panel-search">
        <Search size={15} />
        <input placeholder="搜索" aria-label="搜索内容" />
      </div>
      <div className="contents-tabs">
        <Layers size={18} />
        <Database size={18} />
        <Map size={18} />
        <PenTool size={18} />
        <Grid2X2 size={18} />
        <button
          type="button"
          title="上传 Shapefile ZIP 或 GeoJSON"
          aria-label="上传 Shapefile ZIP 或 GeoJSON"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={18} />
        </button>
        <input
          ref={fileInputRef}
          className="hidden-file-input"
          type="file"
          accept=".zip,.geojson,.json"
          onChange={handleFileChange}
        />
      </div>
      <section className="layer-tree contents-layer-tree">
        <h3>绘制顺序</h3>
        <div className="tree-row root">
          <input type="checkbox" defaultChecked aria-label="地图" />
          <Map size={16} />
          <span>地图</span>
        </div>
        {layer ? (
          <>
            <div className="tree-row selected">
              <input type="checkbox" defaultChecked aria-label={`${layer.fileName} 图层`} />
              <span className="layer-swatch point" />
              <span>{layer.fileName}</span>
            </div>
            <div className="layer-note">
              {layer.geojson.features.length} 个要素
              {layer.points.features.length > 0 ? `，点：${layer.points.features.length}` : ''}
              {layer.selectedField ? `，字段：${layer.selectedField}` : ''}
            </div>
          </>
        ) : (
          <div className="layer-note">点击上方上传按钮，选择 Shapefile ZIP 或 GeoJSON。</div>
        )}
        <div className="layer-note status">{message}</div>
      </section>
    </section>
  );
}
