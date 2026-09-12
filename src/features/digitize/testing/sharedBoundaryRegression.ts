import { createEditableLayer } from './digitizeFixtures';

export const regressionRings = [
  [[5.291072140946123, 50.08525043084154], [8.789547302777946, 48.19842048838211], [7.480176481975394, 46.718451479064726], [4.943270516670445, 46.81654630065361], [3.511146181417654, 48.36180264038535], [4.2476672681190895, 49.75594099040532], [5.291072140946123, 50.08525043084154]],
  [[5.9583335267040685, 49.73091644531206], [7.889354863476193, 50.47745608454565], [9.055513250753464, 49.07716368738042], [9.014595412603384, 47.05403301059644], [7.851129784954758, 47.14196737882892], [8.789547302777946, 48.19842048838211], [5.9583335267040685, 49.73091644531206]],
  [[5.586994986570188, 46.79167224914471], [6.866408909724196, 45.77050057380515], [9.607904065779541, 45.799034859383], [9.95570569005522, 46.60612434244783], [9.028155002934295, 47.73328526789956], [9.014595412603384, 47.05403301059647], [7.851129784954758, 47.14196737882892], [8.789547302777946, 48.19842048838211], [7.480176481975394, 46.718451479064754], [5.586994986570188, 46.79167224914471]],
];

export function regressionDraft(index: number) {
  return structuredClone([...regressionRings[index].slice(0, 5), regressionRings[index][0]]);
}

export function createRegressionLayer(count = 2) {
  return {
    ...createEditableLayer('polygon-layer'), geometryType: 'Polygon' as const,
    geojson: { type: 'FeatureCollection' as const, features: regressionRings.slice(0, count).map(ring => ({ type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [structuredClone(ring)] }, properties: null })) },
    fields: [], numericFields: [], selectedFeatureIndexes: [], selectedField: '',
    points: { type: 'FeatureCollection' as const, features: [] },
  };
}
