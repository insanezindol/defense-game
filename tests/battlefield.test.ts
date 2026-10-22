import test from 'node:test';
import assert from 'node:assert/strict';
import { PADS, ROAD_LENGTH, ROAD_HALF_WIDTH, roadPoint, nearestRoadDistance, MAP_BOUNDS } from '../src/battlefield';

test('a long S-shaped road has 24 usable, separate off-road building sites', () => {
  assert.equal(PADS.length, 24);
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

test('road interpolation and nearest distance preserve progress through every bend', () => {
  for (let i = 0; i <= 100; i++) {
    const distance = ROAD_LENGTH * i / 100;
    const p = roadPoint(distance);
    assert.ok(Math.abs(nearestRoadDistance(p) - distance) < 0.001);
  }
  assert.deepEqual(roadPoint(-10), roadPoint(0));
  assert.deepEqual(roadPoint(ROAD_LENGTH + 10), roadPoint(ROAD_LENGTH));
});
