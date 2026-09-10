import { useGis } from '../../../gisStore';

/**
 * View-model boundary for the layer feature.
 *
 * The application currently stores GIS data in GisProvider. Keeping this
 * facade here lets the layer UI depend on a focused contract while the rest
 * of the application is migrated incrementally.
 */
export function useLayerStore() {
  const gis = useGis();

  return {
    layer: gis.layer,
    layers: gis.layers,
    activeLayerId: gis.activeLayerId,
    layerZoomRequest: gis.layerZoomRequest,
    rasterZoomRequest: gis.rasterZoomRequest,
    raster: gis.raster,
    rasters: gis.rasters,
    activeRasterId: gis.activeRasterId,
    vectorOverlay: gis.vectorOverlay,
    basemapStyle: gis.basemapStyle,
    rasterStyle: gis.rasterStyle,
    vectorOverlayStyle: gis.vectorOverlayStyle,
    uploadedLayerStyles: gis.uploadedLayerStyles,
    layerVisibility: gis.layerVisibility,
    rasterLayerVisibility: gis.rasterLayerVisibility,
    uploadedLayerVisibility: gis.uploadedLayerVisibility,
    layerOrder: gis.layerOrder,
    workspaceDraftLoaded: gis.workspaceDraftLoaded,
    message: gis.message,
    createBlankGeoJsonLayer: gis.createBlankGeoJsonLayer,
    deleteUploadedLayer: gis.deleteUploadedLayer,
    saveGeoJsonLayer: gis.saveGeoJsonLayer,
    saveGeoPackageLayer: gis.saveGeoPackageLayer,
    setLayerVisibility: gis.setLayerVisibility,
    setAllLayerVisibility: gis.setAllLayerVisibility,
    setLayerDrawOrder: gis.setLayerDrawOrder,
    moveLayerOrder: gis.moveLayerOrder,
    setRasterLayerVisibility: gis.setRasterLayerVisibility,
    setUploadedLayerVisibility: gis.setUploadedLayerVisibility,
    setRasterStyle: gis.setRasterStyle,
    setVectorOverlayStyle: gis.setVectorOverlayStyle,
    setUploadedLayerStyle: gis.setUploadedLayerStyle,
    renameUploadedLayer: gis.renameUploadedLayer,
    renameRasterLayer: gis.renameRasterLayer,
    renameVectorOverlay: gis.renameVectorOverlay,
    setActiveLayer: gis.setActiveLayer,
    setActiveRaster: gis.setActiveRaster,
    zoomToLayer: gis.zoomToLayer,
    zoomToRaster: gis.zoomToRaster,
    updateUploadedLayerGeoJson: gis.updateUploadedLayerGeoJson,
    setSelectedField: gis.setSelectedField,
    setLayerSelection: gis.setLayerSelection,
    clearSelection: gis.clearSelection,
    uploadCsv: gis.uploadCsv,
    uploadGeoJson: gis.uploadGeoJson,
    uploadGeoPackage: gis.uploadGeoPackage,
    uploadGeoParquetFile: gis.uploadGeoParquetFile,
    uploadGeoParquetUrl: gis.uploadGeoParquetUrl,
    uploadGeoTiff: gis.uploadGeoTiff,
    uploadGeoTiffUrl: gis.uploadGeoTiffUrl,
    uploadShapefileZip: gis.uploadShapefileZip,
  } as const;
}

export type LayerStore = ReturnType<typeof useLayerStore>;
