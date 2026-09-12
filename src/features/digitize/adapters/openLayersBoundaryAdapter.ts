import type Feature from 'ol/Feature.js';
import type Geometry from 'ol/geom/Geometry.js';
import Polygon from 'ol/geom/Polygon.js';
import MultiPolygon from 'ol/geom/MultiPolygon.js';
import type { DigitizeCoordinate as Coordinate } from '../types';
import { nodeBoundaryRings } from '../services/boundaryNodingService';
import { boundaryNodeTolerance, segmentContact, validateRingTopology } from '../services/geometryTopologyService';

export function synchronizeSharedBoundaries(existing: Feature<Geometry>[], completed: Feature<Geometry>): void {
  const entries = [...existing.filter(feature => feature !== completed), completed].flatMap(feature => {
    const geometry = feature.getGeometry();
    if (!(geometry instanceof Polygon || geometry instanceof MultiPolygon)) return [];
    const polygons = geometry instanceof Polygon ? [geometry.getCoordinates()] : geometry.getCoordinates();
    return [{ feature, geometry, polygons, changed: false }];
  });
  const rings = entries.flatMap(entry => entry.polygons.flatMap((polygon, polygonIndex) => polygon.map((coordinates, ringIndex) => ({ entry, coordinates, polygonIndex, ringIndex }))));
  const focus = rings.filter(ring => ring.entry.feature === completed);
  const neighbors = rings.filter(ring => ring.entry.feature !== completed && focus.some(target => shareEdge(ring.coordinates, target.coordinates)));
  if (!neighbors.length) return;
  const selected = [...neighbors, ...focus];
  const noded = nodeBoundaryRings(selected.map(ring => ring.coordinates));
  noded.forEach(ring => validateRingTopology(ring));
  selected.forEach((ring, index) => {
    if (JSON.stringify(ring.coordinates) === JSON.stringify(noded[index])) return;
    ring.entry.polygons[ring.polygonIndex][ring.ringIndex] = noded[index];
    ring.entry.changed = true;
  });
  for (const entry of entries) {
    if (!entry.changed) continue;
    const geometry = entry.geometry.clone();
    if (geometry instanceof Polygon) geometry.setCoordinates(entry.polygons[0], geometry.getLayout());
    else geometry.setCoordinates(entry.polygons, geometry.getLayout());
    entry.feature.setGeometry(geometry);
  }
}

function shareEdge(first: Coordinate[], second: Coordinate[]) {
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex += 1) {
      if (segmentContact(first[firstIndex], first[firstIndex + 1], second[secondIndex], second[secondIndex + 1], boundaryNodeTolerance)?.kind === 'overlap') return true;
    }
  }
  return false;
}
