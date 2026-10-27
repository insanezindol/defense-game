import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODEL_PATHS, createResident, animateResident, createHouseModel } from '../src/resident-models';
import { World } from '../src/world';

async function model(path: string) {
  const data = await readFile(`public${path}`);
  const length = data.readUInt32LE(12), json = JSON.parse(data.subarray(20, 20 + length).toString());
  const offset = 20 + length, binary = data.subarray(offset + 8, offset + 8 + data.readUInt32LE(offset));
  json.buffers[0].uri = `data:application/octet-stream;base64,${binary.toString('base64')}`;
  // Node verifies meshes/rigs without a browser image decoder; browsers load the supplied atlas.
  for (const material of json.materials) delete material.pbrMetallicRoughness?.baseColorTexture;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'ProgressEvent');
  Object.defineProperty(globalThis, 'ProgressEvent', { configurable: true, value: class { constructor(public type: string) {} } });
  try { return await new GLTFLoader().parseAsync(JSON.stringify(json), ''); }
  finally {
    if (original) Object.defineProperty(globalThis, 'ProgressEvent', original);
    else Reflect.deleteProperty(globalThis, 'ProgressEvent');
  }
}

test('authored residents share GPU meshes but have independent animated skeletons', async () => {
  const source = await model(MODEL_PATHS[0]);
  for (const name of ['idle', 'walk', 'attack-melee-right']) assert.ok(source.animations.some(a => a.name === name));
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const a = createResident(source, 'hero', materials), b = createResident(source, 'hero', materials);
  const meshA = a.getObjectByName('body-mesh') as THREE.SkinnedMesh;
  const meshB = b.getObjectByName('body-mesh') as THREE.SkinnedMesh;
  assert.equal(meshA.geometry, meshB.geometry);
  assert.notEqual(meshA.skeleton, meshB.skeleton);
  const before = b.getObjectByName('leg-left')!.quaternion.clone();
  animateResident(a, 0, true, false); animateResident(a, 0.1, true, false); animateResident(a, 0.2, true, false);
  assert.ok(a.getObjectByName('leg-left')!.quaternion.angleTo(before) > 0.01);
  assert.ok(b.getObjectByName('leg-left')!.quaternion.equals(before));
  assert.ok(a.getObjectByName('broom') && a.getObjectByName('hp'));
  assert.equal(meshA.userData.sharedAsset, true);
  let disposed = 0;
  meshA.geometry.addEventListener('dispose', () => disposed++);
  const world = Object.create(World.prototype) as World;
  Object.assign(world, { root: new THREE.Group(), renderer: { shadowMap: { needsUpdate: false } } });
  world.root.add(a, b);
  (world as unknown as { remove(group: THREE.Group): void }).remove(a);
  assert.equal(disposed, 0, 'one resident leaving must not dispose another resident GPU geometry');
  assert.ok(world.root.children.includes(b));
});

test('authored homes normalize to their lot and reuse model geometry', async () => {
  const source = await model(MODEL_PATHS[2]);
  const a = createHouseModel(source, 6), b = createHouseModel(source, 6);
  const size = new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 6) < 1e-5);
  assert.ok(size.y > 2 && size.y < 10);
  assert.equal((a.children[0] as THREE.Mesh).geometry, (b.children[0] as THREE.Mesh).geometry);
});
