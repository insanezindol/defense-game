import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNeighborhood } from '../src/neighborhood';
import { World } from '../src/world';
import { PADS, ROAD_HALF_WIDTH, nearestRoadDistance, roadPoint } from '../src/battlefield';

test('neighborhood has detailed homes, shops and street life with finite shared geometry', () => {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const scene = createNeighborhood(materials);
  for (const name of ['home', 'shop', 'car', 'tree', 'streetlight', 'fence', 'window', 'roof', 'air-conditioner']) {
    assert.ok(scene.getObjectByName(name), name);
  }
  scene.updateMatrixWorld(true);
  let vertices = 0;
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    assert.ok([...materials.values()].includes(object.material as THREE.MeshStandardMaterial));
    const positions = object.geometry.attributes.position;
    vertices += positions.count;
    assert.ok(Array.from(positions.array).every(Number.isFinite));
  });
  assert.ok(vertices > 20000 && vertices < 350000, `detail budget: ${vertices}`);
  assert.ok(materials.size < 65, `material budget: ${materials.size}`);
  const bounds = new THREE.Box3().setFromObject(scene);
  assert.ok(bounds.min.y >= -0.01 && bounds.max.y < 13);
});

test('solid neighborhood props stay outside combat roads and build footprints', () => {
  const scene = createNeighborhood();
  scene.updateMatrixWorld(true);
  for (const object of scene.children) {
    if (object.name === 'home') continue;
    const bounds = new THREE.Box3().setFromObject(object);
    for (const pad of PADS) assert.ok(!bounds.intersectsBox(new THREE.Box3(
      new THREE.Vector3(pad.x - 1.65, 0, pad.z - 1.65),
      new THREE.Vector3(pad.x + 1.65, 10, pad.z + 1.65),
    )), `${object.name} covers a pad`);
    for (let x = bounds.min.x; x <= bounds.max.x; x += 0.5) {
      for (let z = bounds.min.z; z <= bounds.max.z; z += 0.5) {
        const p = roadPoint(nearestRoadDistance({ x, z }));
        assert.ok(Math.hypot(p.x - x, p.z - z) > ROAD_HALF_WIDTH + 0.35, `${object.name} enters road`);
      }
    }
  }
});

test('world batching merges indexed boxes and nonindexed roofs without losing scenery', () => {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const world = Object.create(World.prototype) as World;
  world.root = createNeighborhood(materials);
  world.pads = [];
  const before = new THREE.Box3().setFromObject(world.root);
  (world as unknown as { batchTerrain(): void }).batchTerrain();
  let meshes = 0;
  world.root.traverse(object => { if (object instanceof THREE.Mesh) meshes++; });
  assert.ok(meshes <= materials.size, `${meshes} calls should fit ${materials.size} materials`);
  const after = new THREE.Box3().setFromObject(world.root);
  assert.ok(before.min.distanceTo(after.min) < 1e-5);
  assert.ok(before.max.distanceTo(after.max) < 1e-5);
});
