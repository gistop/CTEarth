import { useEffect, useMemo, useRef } from 'react';
import { useLayerStore } from '../../../layers/stores/layerStore';
import { useMapGroupRenderState } from '../../../../mapGroupRenderState';
import type { SceneModelLayer } from '../../../../gisStore';
import type { CesiumNamespace, CesiumSceneModel, CesiumViewer } from './cesiumRuntime';
import type { MapViewMode } from './MapCommandContext';
import {
  attachSceneModelSnapScene,
  registerSceneModelSnapSource,
  unregisterSceneModelSnapSource,
} from './sceneModelVertexSnap';

type SceneModelsCesiumScene = { Cesium: CesiumNamespace; viewer: CesiumViewer } | null;
type CesiumModel = CesiumSceneModel;

type ModelEntry = {
  model: CesiumModel | null;
  radius: number;
  correction: unknown | null;
};

/**
 * 等待相机静止（飞行/惯性滑动结束）：连续多次采样位置不变视为稳定，最长等待 3 秒。
 * 切换到三维模式时相机会执行初始 flyTo，不等稳定的话"屏幕中心"会取到飞行途中的画面。
 */
async function waitForCameraSettled(viewer: CesiumViewer) {
  const camera = viewer.camera;
  const deadline = Date.now() + 3000;
  let stableSamples = 0;
  let lastLongitude = camera.positionCartographic.longitude;
  let lastLatitude = camera.positionCartographic.latitude;
  let lastHeight = camera.positionCartographic.height;

  while (Date.now() < deadline && !viewer.isDestroyed()) {
    await new Promise((resolve) => window.setTimeout(resolve, 60));

    if (viewer.isDestroyed()) {
      return;
    }

    const cartographic = camera.positionCartographic;

    if (
      Math.abs(cartographic.longitude - lastLongitude) < 1e-10
      && Math.abs(cartographic.latitude - lastLatitude) < 1e-10
      && Math.abs(cartographic.height - lastHeight) < 0.01
    ) {
      stableSamples += 1;
    } else {
      stableSamples = 0;
    }

    lastLongitude = cartographic.longitude;
    lastLatitude = cartographic.latitude;
    lastHeight = cartographic.height;

    if (stableSamples >= 5) {
      return;
    }
  }
}

/**
 * 将图层列表中的三维模型（glb/gltf）同步到 Cesium 场景：
 * 仅在三维（globe）模式下加载；放置点取屏幕中心并贴地，支持缩放与垂直微调。
 */
export function SceneModelSyncPanel({ cesiumScene, mapMode }: { cesiumScene: SceneModelsCesiumScene; mapMode: MapViewMode }) {
  const { sceneModels, sceneModelZoomRequest, updateSceneModel } = useLayerStore();
  const { currentGroupId } = useMapGroupRenderState();
  const sceneModelsRef = useRef(sceneModels);
  const entriesRef = useRef(new Map<string, ModelEntry>());
  const activeRef = useRef(false);

  sceneModelsRef.current = sceneModels;

  // 仅同步当前项目下的三维模型：切换项目时卸载旧项目模型、加载新项目模型
  const activeGroupModels = useMemo(
    () => (currentGroupId ? sceneModels.filter((model) => model.groupId === currentGroupId) : []),
    [currentGroupId, sceneModels],
  );

  // Cesium 场景生命周期：离开三维模式时移除全部模型
  useEffect(() => {
    if (!cesiumScene || mapMode !== 'globe') {
      activeRef.current = false;
      return;
    }

    activeRef.current = true;
    const detachSnapScene = attachSceneModelSnapScene(cesiumScene.Cesium, cesiumScene.viewer);

    return () => {
      activeRef.current = false;
      detachSnapScene();

      const { viewer } = cesiumScene;
      const entries = entriesRef.current;

      if (!viewer.isDestroyed()) {
        entries.forEach((entry) => {
          if (entry.model) {
            viewer.scene.primitives.remove(entry.model);
          }
        });
      }

      entries.forEach((_entry, id) => {
        unregisterSceneModelSnapSource(id);
      });
      entries.clear();
    };
  }, [cesiumScene, mapMode]);

  // 图层同步：加载新增模型、移除已删模型、更新显隐与变换
  useEffect(() => {
    if (!cesiumScene || mapMode !== 'globe') {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const entries = entriesRef.current;

    const buildMatrix = (model: SceneModelLayer, correction: unknown | null) => {
      if (model.longitude == null || model.latitude == null) {
        return null;
      }

      const place = Cesium.Cartesian3.fromDegrees(model.longitude, model.latitude, model.groundHeight ?? 0);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(place);
      const scaled = Cesium.Matrix4.multiplyTransformation(
        enu,
        Cesium.Matrix4.fromUniformScale(model.scale, new Cesium.Matrix4()),
        new Cesium.Matrix4(),
      );
      const grounded = Cesium.Matrix4.multiplyTransformation(
        scaled,
        correction ?? Cesium.Matrix4.IDENTITY,
        new Cesium.Matrix4(),
      );
      return Cesium.Matrix4.multiplyTransformation(
        grounded,
        Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, model.lift), new Cesium.Matrix4()),
        new Cesium.Matrix4(),
      );
    };

    entries.forEach((entry, id) => {
      if (activeGroupModels.some((model) => model.id === id)) {
        return;
      }

      if (!viewer.isDestroyed() && entry.model) {
        viewer.scene.primitives.remove(entry.model);
      }

      unregisterSceneModelSnapSource(id);
      entries.delete(id);
    });

    activeGroupModels.forEach((model) => {
      const entry = entries.get(model.id);

      if (entry) {
        if (entry.model) {
          entry.model.show = model.visible;
          const matrix = buildMatrix(model, entry.correction);

          if (matrix) {
            entry.model.modelMatrix = matrix;
          }
        }

        return;
      }

      const newEntry: ModelEntry = { model: null, radius: 80, correction: null };
      entries.set(model.id, newEntry);

      void (async () => {
        try {
          const loaded = await Cesium.Model.fromGltfAsync({ url: model.url, cesium: Cesium });

          if (viewer.isDestroyed() || !activeRef.current || entries.get(model.id) !== newEntry) {
            return;
          }

          viewer.scene.primitives.add(loaded);
          newEntry.model = loaded;
          loaded.show = model.visible;

          // 注册为测量顶点吸附源（读取实时 modelMatrix/show）
          registerSceneModelSnapSource(model.id, model.url, model.name, () => (
            newEntry.model
              ? {
                matrix: newEntry.model.modelMatrix as ArrayLike<number> | null,
                visible: newEntry.model.show,
              }
              : null
          ));

          try {
            loaded.activeAnimations?.addAll({ loop: Cesium.AnimationLoop.REPEAT });
          } catch {
            // 模型未包含动画时忽略
          }

          let longitude = model.longitude;
          let latitude = model.latitude;
          let groundHeight = model.groundHeight ?? 0;
          const needsFlyTo = longitude == null || latitude == null;

          if (needsFlyTo) {
            await waitForCameraSettled(viewer);

            if (viewer.isDestroyed() || !activeRef.current || entries.get(model.id) !== newEntry) {
              return;
            }

            const canvas = viewer.canvas;
            const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
            const ray = viewer.camera.getPickRay?.(center);
            const picked = ray
              ? viewer.scene.globe.pick?.(ray, viewer.scene)
              : undefined;
            // 地表瓦片尚未渲染时退回椭球求交，仍失败才用相机正下方
            const ellipsoidPicked = picked ?? viewer.camera.pickEllipsoid?.(center);
            const carto = ellipsoidPicked
              ? Cesium.Cartographic.fromCartesian(ellipsoidPicked)
              : new Cesium.Cartographic(viewer.camera.positionCartographic.longitude, viewer.camera.positionCartographic.latitude, 0);

            try {
              const sampledPositions = (await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [
                Cesium.Cartographic.clone(carto),
              ])) as Array<{ height?: number } | undefined>;
              const sampled = sampledPositions[0];

              if (sampled && Number.isFinite(sampled.height)) {
                carto.height = sampled.height ?? 0;
              }
            } catch {
              carto.height = 0;
            }

            longitude = Cesium.Math.toDegrees(carto.longitude);
            latitude = Cesium.Math.toDegrees(carto.latitude);
            groundHeight = carto.height ?? 0;
            updateSceneModel(model.id, { longitude, latitude, groundHeight });
          }

          const applyMatrix = () => {
            if (viewer.isDestroyed() || entries.get(model.id) !== newEntry) {
              return;
            }

            const latest = sceneModelsRef.current.find((item) => item.id === model.id);

            if (!latest) {
              return;
            }

            const matrix = buildMatrix(
              {
                ...latest,
                longitude: latest.longitude ?? longitude,
                latitude: latest.latitude ?? latitude,
                groundHeight: latest.groundHeight ?? groundHeight,
              },
              newEntry.correction,
            );

            if (matrix) {
              loaded.modelMatrix = matrix;
            }
          };

          applyMatrix();

          // 等待包围球就绪后做底部贴地校正（模型局部坐标）
          const removeListener = viewer.scene.postRender.addEventListener(() => {
            if (viewer.isDestroyed() || entries.get(model.id) !== newEntry) {
              removeListener();
              return;
            }

            let boundingSphere: CesiumModel['boundingSphere'];

            const restore = loaded.modelMatrix;

            try {
              loaded.modelMatrix = Cesium.Matrix4.IDENTITY;
              boundingSphere = loaded.boundingSphere;
            } catch {
              boundingSphere = undefined;
            } finally {
              loaded.modelMatrix = restore;
            }

            if (!boundingSphere) {
              return;
            }

            newEntry.radius = boundingSphere.radius;
            newEntry.correction = Cesium.Matrix4.fromTranslation(
              new Cesium.Cartesian3(-boundingSphere.center.x, -boundingSphere.center.y, -(boundingSphere.center.z - boundingSphere.radius)),
              new Cesium.Matrix4(),
            );
            removeListener();
            applyMatrix();

            if (needsFlyTo) {
              const flyRadius = Math.max(boundingSphere.radius * Math.max(model.scale, 0.1) * 1.6, 30);

              viewer.camera.flyToBoundingSphere(
                new Cesium.BoundingSphere(Cesium.Matrix4.getTranslation(loaded.modelMatrix, new Cesium.Cartesian3()), flyRadius),
                { duration: 1.2 },
              );
            }
          });
        } catch {
          unregisterSceneModelSnapSource(model.id);
          entries.delete(model.id);
        }
      })();
    });
  }, [activeGroupModels, cesiumScene, mapMode, updateSceneModel]);

  // 定位到指定模型
  useEffect(() => {
    if (!sceneModelZoomRequest || !cesiumScene || mapMode !== 'globe') {
      return;
    }

    const { Cesium, viewer } = cesiumScene;
    const entry = entriesRef.current.get(sceneModelZoomRequest.modelId);

    if (!entry?.model || viewer.isDestroyed()) {
      return;
    }

    const model = sceneModelsRef.current.find((item) => item.id === sceneModelZoomRequest.modelId);

    if (!model || model.longitude == null || model.latitude == null) {
      return;
    }

    const radius = Math.max(entry.radius * Math.max(model.scale, 0.1), 20);
    const place = Cesium.Cartesian3.fromDegrees(model.longitude, model.latitude, (model.groundHeight ?? 0) + radius * 0.5 + model.lift);

    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(place, radius), {
      duration: 1.2,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), radius * 3.2),
    });
  }, [sceneModelZoomRequest, cesiumScene, mapMode]);

  return null;
}
