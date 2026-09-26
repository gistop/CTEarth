import { describe, expect, it } from 'vitest';
import {
  getMapGroupLayerDrawOrder,
  getMapGroupLayerSelectionId,
  moveLayerItemByOffset,
  moveLayerItemInMapGroups,
  moveMapGroupByOffset,
  moveMapGroupsInOrder,
  nextMapGroupName,
  normalizeMapGroups,
} from './mapGroupService';
import type { MapGroup } from '../types';

function createGroups(): MapGroup[] {
  return [
    {
      id: 'map-1',
      name: '项目',
      displayVisible: true,
      layerItems: [
        { instanceId: 'point-instance', layerId: 'uploaded:point', visible: true },
        { instanceId: 'boundary-instance', layerId: 'uploaded:boundary', visible: true },
        { instanceId: 'basemap-instance', layerId: 'basemap', visible: true },
      ],
    },
    {
      id: 'map-2',
      name: '项目 2',
      displayVisible: true,
      layerItems: [
        { instanceId: 'roads-instance', layerId: 'uploaded:roads', visible: true },
      ],
    },
  ];
}

describe('mapGroupService', () => {
  it('uses a stable instance id when moving a filtered layer row', () => {
    const next = moveLayerItemInMapGroups(
      createGroups(),
      { groupId: 'map-1', instanceId: 'boundary-instance', layerId: 'uploaded:boundary' },
      { groupId: 'map-2', targetInstanceId: 'roads-instance' },
    );

    expect(next[0].layerItems.map((item) => item.instanceId)).toEqual([
      'point-instance',
      'basemap-instance',
    ]);
    expect(next[1].layerItems.map((item) => item.instanceId)).toEqual([
      'boundary-instance',
      'roads-instance',
    ]);
  });

  it('keeps the basemap selection identity after a cross-group move', () => {
    const item = createGroups()[0].layerItems[2];
    expect(getMapGroupLayerSelectionId('map-2', item)).toBe('map-2:basemap-instance');
  });

  it('supports keyboard layer and map-group reordering', () => {
    const layersMoved = moveLayerItemByOffset(createGroups(), 'map-1', 'boundary-instance', -1);
    expect(layersMoved[0].layerItems.map((item) => item.instanceId)).toEqual([
      'boundary-instance',
      'point-instance',
      'basemap-instance',
    ]);

    const groupsMoved = moveMapGroupByOffset(createGroups(), 'map-2', -1);
    expect(groupsMoved.map((group) => group.id)).toEqual(['map-2', 'map-1']);
  });

  it('moves a map group to an explicit drop position', () => {
    const next = moveMapGroupsInOrder(
      createGroups(),
      { groupId: 'map-1' },
      { groupId: 'map-2', position: 'after' },
    );
    expect(next.map((group) => group.id)).toEqual(['map-2', 'map-1']);
  });

  it('migrates legacy default group names (地图/地图 N) to the project wording', () => {
    const migrated = normalizeMapGroups([
      { id: 'map-1', name: '地图', layerItems: [] },
      { id: 'map-2', name: '地图 2', layerItems: [] },
      { id: 'map-3', name: '地图3', layerItems: [] },
      { id: 'map-4', name: '行政区', layerItems: [] },
    ]);

    expect(migrated.map((group) => group.name)).toEqual(['项目', '项目 2', '项目 3', '行政区']);
  });

  it('generates the next project name from existing groups', () => {
    expect(nextMapGroupName([
      { id: 'map-1', name: '项目', layerItems: [] },
      { id: 'map-2', name: '项目 2', layerItems: [] },
    ])).toBe('项目 3');
  });

  it('normalizes legacy basemap records and derives draw order', () => {
    const legacyGroups = createGroups().map((group) => ({
      ...group,
      displayVisible: undefined,
      layerItems: group.layerItems.map((item) => item.layerId === 'basemap'
        ? { ...item, basemapId: undefined, opacity: undefined }
        : item),
    }));

    const normalized = normalizeMapGroups(legacyGroups);
    const basemap = normalized[0].layerItems.find((item) => item.layerId === 'basemap');

    expect(normalized[0].displayVisible).toBe(true);
    expect(basemap).toMatchObject({ basemapId: 'osm', opacity: 1 });
    expect(getMapGroupLayerDrawOrder(normalized)).toEqual([
      'uploaded:point',
      'uploaded:boundary',
      'basemap',
      'uploaded:roads',
    ]);
  });
});
