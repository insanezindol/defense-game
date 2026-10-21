type Point = { x: number; z: number };

export function routeAroundTowers(start: Point, goal: Point, centers: Point[], clearance: number): Point[] {
  const clearPoint = (point: Point) => centers.every(c => Math.hypot(point.x - c.x, point.z - c.z) >= clearance - 1e-8);
  const clearSegment = (a: Point, b: Point) => {
    const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
    return centers.every(c => {
      const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / lengthSquared)) : 0;
      return (a.x + dx * t - c.x) ** 2 + (a.z + dz * t - c.z) ** 2 >= clearance ** 2 - 1e-8;
    });
  };
  if (clearSegment(start, goal)) return [goal];
  const nodes: Point[] = [start, goal];
  const radius = clearance + 0.08;
  const add = (x: number, z: number) => { if (clearPoint({ x, z })) nodes.push({ x, z }); };
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    for (const x of [-radius, radius]) for (const z of [-radius, radius]) add(c.x + x, c.z + z);
    // These exits let a unit leave a narrow joint between two expanded tower footprints.
    for (let j = i + 1; j < centers.length; j++) {
      const other = centers[j], dx = other.x - c.x, dz = other.z - c.z, distance = Math.hypot(dx, dz);
      if (distance > 2 * radius) continue;
      const h = Math.sqrt(Math.max(0, radius ** 2 - distance ** 2 / 4));
      const mx = (c.x + other.x) / 2, mz = (c.z + other.z) / 2;
      add(mx - dz / distance * h, mz + dx / distance * h);
      add(mx + dz / distance * h, mz - dx / distance * h);
    }
  }
  const distances = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  distances[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (!visited.has(i) && (current === -1 || distances[i] < distances[current])) current = i;
    }
    if (current === -1 || !Number.isFinite(distances[current])) break;
    if (current === 1) {
      const route: Point[] = [];
      for (let i = 1; i !== 0; i = previous[i]) route.push(nodes[i]);
      return route.reverse();
    }
    visited.add(current);
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i)) continue;
      const distance = distances[current] + Math.hypot(nodes[i].x - nodes[current].x, nodes[i].z - nodes[current].z);
      if (distance < distances[i] && clearSegment(nodes[current], nodes[i])) {
        distances[i] = distance;
        previous[i] = current;
      }
    }
  }
  return [];
}
