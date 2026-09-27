import { useEffect, useMemo, useState } from 'react';
import { Box, Eye, EyeOff, Settings } from 'lucide-react';
import { useLayerStore } from '../stores/layerStore';
import { useMapCommands } from '../../maps/components/map/MapCommandContext';
import type { SceneModelLayer } from '../../../gisStore';

const MODE_LABELS: Record<string, string> = {
  planar: '平面',
  terrain: '地形',
  globe: '三维',
};

/**
 * 项目（地图组）节点内的“三维模型”分区：
 * 管理归属该项目的 glb/gltf 模型，仅在三维模式下正常显示；
 * 三维场景只加载当前项目的模型，非当前项目的模型需先切换项目。
 */
export function SceneModelsSection({ groupId, isCurrentGroup, onMakeCurrent, onSelect, searchQuery = '', selectedId }: {
  groupId: string;
  isCurrentGroup: boolean;
  onMakeCurrent: () => void;
  onSelect: (modelId: string) => void;
  searchQuery?: string;
  selectedId: string | null;
}) {
  const { sceneModels, updateSceneModel, zoomToSceneModel } = useLayerStore();
  const { mapCommandState } = useMapCommands();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groupModels = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return sceneModels.filter((model) => model.groupId === groupId
      && (keyword === '' || model.name.toLowerCase().includes(keyword)));
  }, [groupId, sceneModels, searchQuery]);

  if (groupModels.length === 0) {
    return null;
  }

  const isGlobe = mapCommandState.mapMode === 'globe';
  const modeLabel = MODE_LABELS[mapCommandState.mapMode] ?? '当前';

  return (
    <section className="scene-models-section">
      <div className="scene-models-heading">
        <Box size={13} />
        <span>三维模型</span>
      </div>
      {groupModels.map((model) => {
        const isExpanded = expandedId === model.id;
        const isSelected = selectedId === model.id;

        return (
          <div key={model.id}>
            <div
              className={`tree-row scene-model-row${isSelected ? ' selected' : ''}${isGlobe ? '' : ' is-mode-disabled'}`}
              role="treeitem"
              aria-selected={isSelected}
              tabIndex={0}
              title={isGlobe
                ? (isCurrentGroup ? '双击定位到模型' : '双击切换到该项目显示模型')
                : `三维模型仅在三维模式中显示（当前为${modeLabel}模式）`}
              onClick={() => onSelect(model.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) {
                  return;
                }

                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(model.id);
                }
              }}
              onDoubleClick={() => {
                if (!isGlobe) {
                  return;
                }

                if (isCurrentGroup) {
                  zoomToSceneModel(model.id);
                } else {
                  onMakeCurrent();
                }
              }}
            >
              <span className="scene-model-badge">
                <Box size={13} />
              </span>
              <span className="tree-row-label">{model.name}</span>
              <span className="tree-row-actions">
                <button
                  className={model.visible ? 'map-group-visibility-button is-visible' : 'map-group-visibility-button'}
                  type="button"
                  title={model.visible ? `隐藏 ${model.name}` : `显示 ${model.name}`}
                  aria-label={model.visible ? `隐藏 ${model.name}` : `显示 ${model.name}`}
                  aria-pressed={Boolean(model.visible)}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateSceneModel(model.id, { visible: !model.visible });
                  }}
                >
                  {model.visible ? <Eye size={15} strokeWidth={1.9} /> : <EyeOff size={15} strokeWidth={1.9} />}
                </button>
                <button
                  className={isExpanded ? 'layer-style-toggle is-open' : 'layer-style-toggle'}
                  type="button"
                  title="设置"
                  aria-label={`设置 ${model.name}`}
                  aria-expanded={isExpanded}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpandedId(isExpanded ? null : model.id);
                  }}
                >
                  <Settings size={15} strokeWidth={1.8} />
                </button>
              </span>
            </div>
            {isExpanded ? (
              <div className="layer-style-panel scene-model-style-panel">
                {!isGlobe ? <div className="layer-note">当前为{modeLabel}模式，三维模型仅在三维模式中显示。</div> : null}
                <div className="layer-style-form">
                  <label className="layer-style-field">
                    <span>缩放（{model.scale.toFixed(1)} 倍）</span>
                    <span className="layer-range-control">
                      <input
                        type="range"
                        min={0.1}
                        max={20}
                        step={0.1}
                        value={model.scale}
                        onChange={(event) => updateSceneModel(model.id, { scale: Number(event.target.value) })}
                      />
                      <output>{model.scale.toFixed(1)}</output>
                    </span>
                  </label>
                  <label className="layer-style-field">
                    <span>垂直微调（{model.lift.toFixed(1)} 米）</span>
                    <span className="layer-range-control">
                      <input
                        type="range"
                        min={-500}
                        max={500}
                        step={0.5}
                        value={model.lift}
                        onChange={(event) => updateSceneModel(model.id, { lift: Number(event.target.value) })}
                      />
                      <output>{model.lift.toFixed(1)}</output>
                    </span>
                  </label>
                  <SceneModelPlacementFields model={model} updateSceneModel={updateSceneModel} />
                  <div className="layer-note scene-model-place-note">
                    坐标留空时，模型首次在三维模式加载会自动放置到屏幕中心并贴地；填写或修改坐标后模型立即移动。
                  </div>
                  <div className="layer-style-actions">
                    <button type="button" onClick={() => updateSceneModel(model.id, { scale: 1, lift: 0 })}>
                      重置
                    </button>
                    <button
                      type="button"
                      disabled={!isGlobe || !isCurrentGroup}
                      title={isCurrentGroup ? undefined : '双击模型行或先切换到该项目后可定位'}
                      onClick={() => zoomToSceneModel(model.id)}
                    >
                      定位
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

/** 模型放置坐标设置：经度 / 纬度 / 放置高度，输入合法数值即写入图层并即时生效 */
function SceneModelPlacementFields({ model, updateSceneModel }: {
  model: SceneModelLayer;
  updateSceneModel: (id: string, patch: Partial<Omit<SceneModelLayer, 'id' | 'url'>>) => void;
}) {
  const [longitude, setLongitude] = useState(() => formatPlacementValue(model.longitude));
  const [latitude, setLatitude] = useState(() => formatPlacementValue(model.latitude));
  const [groundHeight, setGroundHeight] = useState(() => formatPlacementValue(model.groundHeight));

  useEffect(() => {
    setLongitude((current) => (Number(current) === model.longitude ? current : formatPlacementValue(model.longitude)));
  }, [model.longitude]);

  useEffect(() => {
    setLatitude((current) => (Number(current) === model.latitude ? current : formatPlacementValue(model.latitude)));
  }, [model.latitude]);

  useEffect(() => {
    setGroundHeight((current) => (Number(current) === model.groundHeight ? current : formatPlacementValue(model.groundHeight)));
  }, [model.groundHeight]);

  const commit = (raw: string, apply: (value: number) => void) => {
    const value = Number(raw);

    if (raw.trim() !== '' && Number.isFinite(value)) {
      apply(value);
    }
  };

  return (
    <>
      <div className="layer-style-field">
        <span>放置坐标（经度 / 纬度）</span>
        <div className="scene-model-place-row">
          <input
            type="number"
            min={-180}
            max={180}
            step={0.0001}
            placeholder="经度"
            value={longitude}
            onChange={(event) => {
              setLongitude(event.target.value);
              commit(event.target.value, (value) => updateSceneModel(model.id, { longitude: Math.min(180, Math.max(-180, value)) }));
            }}
          />
          <input
            type="number"
            min={-90}
            max={90}
            step={0.0001}
            placeholder="纬度"
            value={latitude}
            onChange={(event) => {
              setLatitude(event.target.value);
              commit(event.target.value, (value) => updateSceneModel(model.id, { latitude: Math.min(90, Math.max(-90, value)) }));
            }}
          />
        </div>
      </div>
      <label className="layer-style-field">
        <span>放置高度（米，垂直微调叠加其上）</span>
        <div className="scene-model-place-row scene-model-place-row--single">
          <input
            type="number"
            step={0.1}
            placeholder="留空按 0"
            value={groundHeight}
            onChange={(event) => {
              setGroundHeight(event.target.value);
              commit(event.target.value, (value) => updateSceneModel(model.id, { groundHeight: value }));
            }}
          />
        </div>
      </label>
    </>
  );
}

function formatPlacementValue(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '';
  }

  return String(Math.round(value * 1e6) / 1e6);
}
