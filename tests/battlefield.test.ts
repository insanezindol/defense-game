import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PADS, ROAD_POINTS, ROAD_LENGTH, ROAD_HALF_WIDTH, roadPoint, nearestRoadDistance, MAP_BOUNDS } from '../src/battlefield';

test('a long S-shaped road has 18 usable, separate off-road building sites', () => {
  assert.deepEqual(PADS, [-12, -2, 8].flatMap(z => [-12, -7.2, -2.4, 2.4, 7.2, 12].map(x => ({ x, z }))));
  assert.ok(ROAD_LENGTH > 100);
  const points = Array.from({ length: 201 }, (_, i) => roadPoint(ROAD_LENGTH * i / 200));
  assert.ok(points.some(p => p.x > 14) && points.some(p => p.x < -14));
  for (let i = 0; i < PADS.length; i++) {
    const pad = PADS[i], nearest = roadPoint(nearestRoadDistance(pad));
    const distance = Math.hypot(pad.x - nearest.x, pad.z - nearest.z);
    assert.ok(distance >= ROAD_HALF_WIDTH + 1.35, `pad ${i} blocks the road`);
    assert.ok(distance < 6, `pad ${i} cannot attack the road`);
    assert.ok(pad.x > MAP_BOUNDS.minX + 1.5 && pad.x < MAP_BOUNDS.maxX - 1.5);
    for (let j = 0; j < i; j++) assert.ok(Math.hypot(pad.x - PADS[j].x, pad.z - PADS[j].z) > 3, `${i} overlaps ${j}`);
  }
});

test('removing the first row and right turn preserves every remaining road point', () => {
  assert.deepEqual(ROAD_POINTS[0], { x: 12, z: -7 });
  assert.equal(roadPoint(0).dx, -1);
  assert.ok(ROAD_POINTS.every(p => p.z >= -7));
  // Snapshot of the original road after its first 129 points: no retained geometry may move.
  assert.equal(createHash('sha256').update(JSON.stringify(ROAD_POINTS)).digest('hex'),
    'e2419333eea3029c41fead4b95ed2962351c0f6cbeac870094a6bdf2947fd1ad');
});

test('road interpolation and nearest distance preserve progress through every bend', () => {
  for (let i = 0; i <= 100; i++) {
    const distance = ROAD_LENGTH * i / 100;
    const p = roadPoint(distance);
    assert.ok(Math.abs(nearestRoadDistance(p) - distance) < 0.001);
  }
  assert.deepEqual(roadPoint(-10), roadPoint(0));
  assert.deepEqual(roadPoint(ROAD_LENGTH + 10), roadPoint(ROAD_LENGTH));
});

test('interior pads are centered between straight road sections ten units apart', () => {
  for (const pad of PADS.slice(6).filter(p => Math.abs(p.x) < 9)) {
    const upper = roadPoint(nearestRoadDistance({ x: pad.x, z: pad.z - 5 }));
    const lower = roadPoint(nearestRoadDistance({ x: pad.x, z: pad.z + 5 }));
    assert.ok(Math.abs(upper.x - pad.x) < 1e-8);
    assert.ok(Math.abs(lower.x - pad.x) < 1e-8);
    assert.ok(Math.abs(upper.z - (pad.z - 5)) < 1e-8);
    assert.ok(Math.abs(lower.z - (pad.z + 5)) < 1e-8);
  }
});
