import type { CesiumNamespace, CesiumViewer } from '../maps/components/map/cesiumRuntime';
import type { Landform } from './landforms';

// 相机飞往典型地貌视角（heading/pitch/roll 数据本身为弧度）
export function flyToLandform(Cesium: CesiumNamespace, viewer: CesiumViewer, landform: Landform): void {
  const { lon, lat, height, heading, pitch, roll } = landform.camera;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
    orientation: { heading, pitch, roll },
    duration: 2.5,
  });
}

// 在场景中添加地貌标注点（圆点 + 文字），返回 entity 引用便于切换时清理
export function addLandformMarkers(Cesium: CesiumNamespace, viewer: CesiumViewer, landform: Landform): unknown[] {
  return landform.labels.map((item) => viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, item.height),
    point: {
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString('#f59e0b'),
      outlineColor: Cesium.Color.fromCssColorString('#ffffff'),
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: item.text,
      font: '600 15px "Microsoft YaHei", sans-serif',
      fillColor: Cesium.Color.fromCssColorString('#ffffff'),
      outlineColor: Cesium.Color.fromCssColorString('#17324d'),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromAlpha(Cesium.Color.fromCssColorString('#17324d'), 0.82),
      backgroundPadding: new Cesium.Cartesian2(8, 5),
      pixelOffset: new Cesium.Cartesian2(0, -14),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }));
}

export function clearLandformMarkers(viewer: CesiumViewer, markers: unknown[]): void {
  markers.forEach((entity) => viewer.entities.remove(entity));
}
