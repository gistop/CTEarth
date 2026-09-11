import type { DisplayCrsId } from './MapCommandContext';

export type CoordinateSystemLeaf = {
  kind: 'crs';
  id: DisplayCrsId;
  code: string;
  name: string;
  engine: 'MapLibre' | 'OpenLayers';
  keywords: string[];
};

export type CoordinateSystemGroup = {
  kind: 'group';
  id: string;
  label: string;
  children: CoordinateSystemNode[];
};

export type CoordinateSystemNode = CoordinateSystemGroup | CoordinateSystemLeaf;

export const coordinateSystemTree: CoordinateSystemGroup[] = [
  {
    kind: 'group',
    id: 'geographic',
    label: '地理坐标系',
    children: [
      {
        kind: 'group',
        id: 'world',
        label: 'World',
        children: [
          {
            kind: 'crs',
            id: 'wgs84',
            code: 'EPSG:4326',
            name: 'WGS 84',
            engine: 'OpenLayers',
            keywords: ['4326', 'epsg:4326', 'wgs84', 'wgs 84', 'world', '地理', '经纬度'],
          },
        ],
      },
    ],
  },
  {
    kind: 'group',
    id: 'projected',
    label: '投影坐标系',
    children: [
      {
        kind: 'group',
        id: 'web-mercator',
        label: 'Web Mercator',
        children: [
          {
            kind: 'crs',
            id: 'webMercator',
            code: 'EPSG:3857',
            name: 'Web Mercator',
            engine: 'MapLibre',
            keywords: ['3857', 'epsg:3857', 'web mercator', 'mercator', 'maplibre', '默认', '投影'],
          },
        ],
      },
      {
        kind: 'group',
        id: 'utm',
        label: 'UTM',
        children: [
          {
            kind: 'group',
            id: 'wgs-1984',
            label: 'WGS 1984',
            children: [
              {
                kind: 'crs',
                id: 'epsg32651',
                code: 'EPSG:32651',
                name: 'WGS 84 / UTM zone 51N',
                engine: 'OpenLayers',
                keywords: ['32651', 'epsg:32651', 'utm', 'utm 51n', 'wgs 1984', 'wgs 84', '投影'],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const defaultCoordinateSystemPath = ['projected', 'web-mercator'];

export function getMenuColumns(activePath: string[]) {
  const columns: { parentId: string; nodes: CoordinateSystemNode[] }[] = [
    { parentId: 'root', nodes: coordinateSystemTree },
  ];
  let nodes: CoordinateSystemNode[] = coordinateSystemTree;

  activePath.forEach((groupId) => {
    const group = nodes.find((node): node is CoordinateSystemGroup => node.kind === 'group' && node.id === groupId);

    if (!group) {
      return;
    }

    columns.push({ parentId: group.id, nodes: group.children });
    nodes = group.children;
  });

  return columns;
}

export function getCrsById(id: DisplayCrsId) {
  const items = flattenCrs(coordinateSystemTree);

  return items.find((crs) => crs.id === id) ?? items[0];
}

export function getPathForCrs(id: DisplayCrsId) {
  return findCrsPath(coordinateSystemTree, id)?.path;
}

export function findMatchingCrs(value: string) {
  const normalized = normalizeSearchText(value);

  if (!normalized) {
    return null;
  }

  return flattenCrsWithPath(coordinateSystemTree).find(({ crs }) => (
    normalizeSearchText(crs.code).includes(normalized)
    || normalizeSearchText(crs.name).includes(normalized)
    || crs.keywords.some((keyword) => normalizeSearchText(keyword).includes(normalized))
  )) ?? null;
}

export function formatCrsLabel(crs: CoordinateSystemLeaf) {
  return `${crs.code}（${crs.name}）`;
}

function findCrsPath(nodes: CoordinateSystemNode[], id: DisplayCrsId, path: string[] = []): { crs: CoordinateSystemLeaf; path: string[] } | null {
  for (const node of nodes) {
    if (node.kind === 'crs' && node.id === id) {
      return { crs: node, path };
    }

    if (node.kind === 'group') {
      const result = findCrsPath(node.children, id, path.concat(node.id));

      if (result) {
        return result;
      }
    }
  }

  return null;
}

function flattenCrs(nodes: CoordinateSystemNode[]): CoordinateSystemLeaf[] {
  return nodes.flatMap((node) => (
    node.kind === 'crs' ? [node] : flattenCrs(node.children)
  ));
}

function flattenCrsWithPath(nodes: CoordinateSystemNode[], path: string[] = []) {
  return nodes.flatMap((node): { crs: CoordinateSystemLeaf; path: string[] }[] => {
    if (node.kind === 'crs') {
      return [{ crs: node, path }];
    }

    return flattenCrsWithPath(node.children, path.concat(node.id));
  });
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
