export type Point = { x: number; z: number };
export const MAP_BOUNDS = { minX: -24, maxX: 24, minZ: -34, maxZ: 34 };
export const ROAD_HALF_WIDTH = 2.15;
export const ROAD_POINTS: Point[] = [{ x: -14, z: -17 }];
function lineTo(x: number, z: number) {
  const from = ROAD_POINTS.at(-1)!, steps = Math.ceil(Math.hypot(x - from.x, z - from.z) / 0.4);
  for (let i = 1; i <= steps; i++) ROAD_POINTS.push({ x: from.x + (x - from.x) * i / steps, z: from.z + (z - from.z) * i / steps });
}
function bend(cx: number, cz: number, start: number, end: number, radius = 5) {
  for (let i = 1; i <= 64; i++) {
    const angle = start + (end - start) * i / 64;
    ROAD_POINTS.push({ x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius });
  }
}
lineTo(12, -17); bend(12, -12, -Math.PI / 2, Math.PI / 2);
lineTo(-12, -7); bend(-12, -2, -Math.PI / 2, -Math.PI * 1.5);
lineTo(12, 3); bend(12, 8, -Math.PI / 2, Math.PI / 2);
lineTo(-9, 13); bend(-9, 16, -Math.PI / 2, -Math.PI, 3); lineTo(-12, 17);
const distances = [0];
for (let i = 1; i < ROAD_POINTS.length; i++) {
  distances.push(distances[i - 1] + Math.hypot(ROAD_POINTS[i].x - ROAD_POINTS[i - 1].x, ROAD_POINTS[i].z - ROAD_POINTS[i - 1].z));
}
export const ROAD_LENGTH = distances.at(-1)!;

export function roadPoint(distance: number, lane = 0) {
  const d = Math.max(0, Math.min(ROAD_LENGTH, distance));
  let lo = 1, hi = distances.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (distances[mid] < d) lo = mid + 1; else hi = mid; }
  const a = ROAD_POINTS[lo - 1], b = ROAD_POINTS[lo];
  const length = distances[lo] - distances[lo - 1], t = (d - distances[lo - 1]) / length;
  const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
  return { x: a.x + (b.x - a.x) * t - dz * lane, z: a.z + (b.z - a.z) * t + dx * lane, dx, dz };
}

export function nearestRoadDistance(point: Point) {
  let best = Infinity, result = 0;
  for (let i = 1; i < ROAD_POINTS.length; i++) {
    const a = ROAD_POINTS[i - 1], b = ROAD_POINTS[i], dx = b.x - a.x, dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared));
    const error = (point.x - a.x - dx * t) ** 2 + (point.z - a.z - dz * t) ** 2;
    if (error < best) { best = error; result = distances[i - 1] + t * Math.sqrt(lengthSquared); }
  }
  return result;
}

export const PADS: Point[] = [-21.5, -12, -2, 8].flatMap(z =>
  [-12, -7.2, -2.4, 2.4, 7.2, 12].map(x => ({ x, z })));
export const HOME = { x: -12, z: 21 };
