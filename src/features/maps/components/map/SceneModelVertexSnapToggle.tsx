import { useSceneModelSnapEnabled, setSceneModelSnapEnabled } from './sceneModelVertexSnap';

/** 测量选点"吸附三维模型顶点"开关（各测量面板共用同一状态） */
export function SceneModelVertexSnapToggle() {
  const enabled = useSceneModelSnapEnabled();

  return (
    <label className="map-elevation-occlusion" title="开启后，测量选点优先吸附到光标附近的模型顶点（20 像素内）">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => setSceneModelSnapEnabled(event.target.checked)}
      />
      吸附顶点
    </label>
  );
}
