import { ToolField } from './ToolField';

export function GeoprocessingEnvironmentForm() {
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
