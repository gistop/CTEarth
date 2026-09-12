import type { DigitizeCoordinate as Coordinate } from '../types';
import { nodeBoundaryRings } from './boundaryNodingService';
import { boundaryNodeTolerance, closestSegmentPosition, samePosition, segmentContact, validateRingTopology } from './geometryTopologyService';

export function createBoundaryCache(input: Coordinate[][]): BoundaryCache {
  const valid = input.filter(ring => ring.length >= 3 && ring.every(position => position.length >= 2 && position.every(Number.isFinite)));
  const rings = nodeBoundaryRings(valid).filter(ring => ring.length >= 4);
  return { rings };
}

export function completeSharedBoundary(ring: Coordinate[], cache: BoundaryCache, tolerance: number): Coordinate[] | null {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('公共边容差必须是非负有限数值。');
  if (ring.length < 4 || !ring.every(position => position.length >= 2 && position.every(Number.isFinite))) return null;
  const open = withoutClosingCoordinate(ring);
  const start = findClosestBoundaryLocation(open[0], cache.rings);
  const end = findClosestBoundaryLocation(open[open.length - 1], cache.rings);
  if (!start || !end || start.distance > tolerance || end.distance > tolerance || samePosition(start.coordinate, end.coordinate, boundaryNodeTolerance)) return null;
  const graph = buildBoundaryGraph(nodeBoundaryRings(cache.rings, [start.coordinate, end.coordinate]));
  const nodes = [...graph.values()];
  const first = nodes.find(node => samePosition(node.coordinate, start.coordinate, boundaryNodeTolerance))!.coordinate;
  const last = nodes.find(node => samePosition(node.coordinate, end.coordinate, boundaryNodeTolerance))!.coordinate;
  const startKey = coordinateKey(last); const endKey = coordinateKey(first);
  if (!findShortestBoundaryPath(graph, startKey, endKey)) return null;
  const stroke = open.map(coordinate => [...coordinate]);
  const dimensions = stroke[0].length;
  if (stroke.some(position => position.length !== dimensions)) throw new Error('绘制线的坐标维度不一致。');
  stroke[0] = [first[0], first[1], ...stroke[0].slice(2)];
  stroke[stroke.length - 1] = [last[0], last[1], ...stroke[stroke.length - 1].slice(2)];
  for (const node of graph.values()) {
    node.edges = node.edges.filter(edge => isSafeBoundaryEdge(node.coordinate, graph.get(edge.key)!.coordinate, stroke));
  }
  const path = findShortestBoundaryPath(graph, startKey, endKey);
  if (!path || path.length < 2) throw new Error('公共边无法安全补齐：绘制线与边界相交或重合，请调整绘制路径。');
  const boundary = path.slice(1, -1).map(coordinate => {
    if (coordinate.length < dimensions) throw new Error('公共边缺少与绘制线一致的附加坐标，无法安全补齐。');
    return coordinate.slice(0, dimensions);
  });
  const coordinates = [...stroke, ...boundary, [...stroke[0]]];
  validateRingTopology(coordinates);
  return coordinates;
}

type BoundaryGraph = globalThis.Map<string, {
  coordinate: Coordinate;
  edges: { key: string; weight: number }[];
}>;

export type BoundaryCache = {
  rings: Coordinate[][];
};

function findClosestBoundaryLocation(coordinate: Coordinate, rings: Coordinate[][]) {
  let closest: ReturnType<typeof closestSegmentPosition> | undefined;
  for (const ring of rings) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      const location = closestSegmentPosition(coordinate, ring[index], ring[index + 1]);
      if (!closest || location.distance < closest.distance) closest = location;
    }
  }
  return closest;
}

function buildBoundaryGraph(rings: Coordinate[][]) {
  const graph: BoundaryGraph = new globalThis.Map();
  for (const ring of rings) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      addGraphEdge(graph, ring[index], ring[index + 1]);
      addGraphEdge(graph, ring[index + 1], ring[index]);
    }
  }
  return graph;
}

function isSafeBoundaryEdge(start: Coordinate, end: Coordinate, stroke: Coordinate[]) {
  for (let index = 0; index < stroke.length - 1; index += 1) {
    const contact = segmentContact(start, end, stroke[index], stroke[index + 1], boundaryNodeTolerance);
    if (!contact) continue;
    if (contact.kind !== 'touch') return false;
    const endpoint = index === 0 ? stroke[0] : index === stroke.length - 2 ? stroke[stroke.length - 1] : undefined;
    if (!endpoint || !contact.points.every(position => samePosition(position, endpoint, boundaryNodeTolerance))) return false;
  }
  return true;
}

function addGraphEdge(graph: BoundaryGraph, from: Coordinate, to: Coordinate) {
  if (samePosition(from, to)) return;
  const fromKey = coordinateKey(from);
  const toKey = coordinateKey(to);
  const fromNode = getGraphNode(graph, fromKey, from);

  getGraphNode(graph, toKey, to);

  if (!fromNode.edges.some((edge) => edge.key === toKey)) {
    fromNode.edges.push({
      key: toKey,
      weight: getMapDistance(from, to),
    });
  }
}

function getGraphNode(graph: BoundaryGraph, key: string, coordinate: Coordinate) {
  if (!graph.has(key)) {
    graph.set(key, {
      coordinate,
      edges: [],
    });
  }

  return graph.get(key)!;
}

function findShortestBoundaryPath(graph: BoundaryGraph, startKey: string, endKey: string) {
  if (!graph.has(startKey) || !graph.has(endKey)) {
    return undefined;
  }

  const distances = new globalThis.Map<string, number>([[startKey, 0]]);
  const previous = new globalThis.Map<string, string>();
  const visited = new Set<string>();
  const queue = new MinPriorityQueue();

  queue.push(startKey, 0);

  while (queue.size > 0) {
    const current = queue.pop();

    if (!current) {
      break;
    }

    const currentKey = current.key;

    if (visited.has(currentKey)) {
      continue;
    }

    if (currentKey === endKey) {
      break;
    }

    visited.add(currentKey);
    const currentDistance = distances.get(currentKey) ?? Infinity;
    const currentNode = graph.get(currentKey)!;

    currentNode.edges.forEach((edge) => {
      if (visited.has(edge.key)) {
        return;
      }

      const nextDistance = currentDistance + edge.weight;

      if (nextDistance < (distances.get(edge.key) ?? Infinity)) {
        distances.set(edge.key, nextDistance);
        previous.set(edge.key, currentKey);
        queue.push(edge.key, nextDistance);
      }
    });
  }

  if (!distances.has(endKey)) {
    return undefined;
  }

  const path: Coordinate[] = [];
  let currentKey: string | undefined = endKey;

  while (currentKey) {
    path.unshift(graph.get(currentKey)!.coordinate);
    currentKey = previous.get(currentKey);
  }

  return path;
}

class MinPriorityQueue {
  private readonly items: { key: string; priority: number }[] = [];

  get size() {
    return this.items.length;
  }

  push(key: string, priority: number) {
    this.items.push({ key, priority });
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) {
      return undefined;
    }

    const first = this.items[0];
    const last = this.items.pop()!;

    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }

    return first;
  }

  private bubbleUp(index: number) {
    let currentIndex = index;

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);

      if (this.items[parentIndex].priority <= this.items[currentIndex].priority) {
        break;
      }

      this.swap(parentIndex, currentIndex);
      currentIndex = parentIndex;
    }
  }

  private sinkDown(index: number) {
    let currentIndex = index;

    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = currentIndex * 2 + 2;
      let smallestIndex = currentIndex;

      if (
        leftIndex < this.items.length
        && this.items[leftIndex].priority < this.items[smallestIndex].priority
      ) {
        smallestIndex = leftIndex;
      }

      if (
        rightIndex < this.items.length
        && this.items[rightIndex].priority < this.items[smallestIndex].priority
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === currentIndex) {
        break;
      }

      this.swap(currentIndex, smallestIndex);
      currentIndex = smallestIndex;
    }
  }

  private swap(firstIndex: number, secondIndex: number) {
    [this.items[firstIndex], this.items[secondIndex]] = [this.items[secondIndex], this.items[firstIndex]];
  }
}

function withoutClosingCoordinate(ring: Coordinate[]) {
  return sameCoordinate(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring.slice();
}

function getMapDistance(first: Coordinate, second: Coordinate) {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function sameCoordinate(first: Coordinate | undefined, second: Coordinate | undefined) {
  return Boolean(first && second && first[0] === second[0] && first[1] === second[1]);
}

function coordinateKey(coordinate: Coordinate) {
  return `${coordinate[0]},${coordinate[1]}`;
}
