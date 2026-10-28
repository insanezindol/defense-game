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
  for (const name of ['idle', 'walk', 'holding-right-shoot']) assert.ok(source.animations.some(a => a.name === name));
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
  assert.ok(a.getObjectByName('rifle') && a.getObjectByName('hp'));
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

test('resident faces follow all eight movement directions in the game coordinate system', async () => {
  for (const [index, kind] of [[0, 'hero'], [1, 'grunt']] as const) {
    const source = await model(MODEL_PATHS[index]);
    const resident = createResident(source, kind, new Map());
    for (const [x, z] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      resident.rotation.y = Math.atan2(x, z);
      animateResident(resident, 0, true, false);
      animateResident(resident, 0.1, true, false);
      resident.updateMatrixWorld(true);
      // The visible face of these authored residents points toward local +Z.
      const face = new THREE.Vector3(0, 0, 1).applyQuaternion(
        resident.getObjectByName('head')!.getWorldQuaternion(new THREE.Quaternion()));
      face.y = 0; face.normalize();
      assert.ok(face.dot(new THREE.Vector3(x, 0, z).normalize()) > 0.98, `${kind} faces backward for ${x},${z}`);
    }
  }
});


test('all authored combat roles fit helmets to their head and retain rifle gear through shooting', async () => {
  const source = await model(MODEL_PATHS[1]);
  for (const kind of ['hero', 'grunt', 'runner', 'brute', 'boss'] as const) {
    const resident = createResident(source, kind, new Map());
    resident.updateMatrixWorld(true);
    const helmet = new THREE.Box3().setFromObject(resident.getObjectByName('helmet')!);
    const head = new THREE.Box3().setFromObject(resident.getObjectByName('head-mesh')!);
    assert.ok(helmet.max.y >= head.max.y * 0.92, `${kind} helmet should cover top of the head`);
    assert.ok(helmet.getSize(new THREE.Vector3()).x >= head.getSize(new THREE.Vector3()).x * 0.9);
    assert.ok(resident.getObjectByName('armor') && resident.getObjectByName('rifle'));
    animateResident(resident, 0, false, true);
    assert.equal(resident.userData.resident.state, 'holding-right-shoot');
  }
});

test('combat gear batches each rigid attachment into one colored mesh with intact dimensions', async () => {
  const source = await model(MODEL_PATHS[1]);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  for (const kind of ['hero', 'grunt', 'runner', 'brute', 'boss'] as const) {
    const resident = createResident(source, kind, materials);
    for (const [name, width] of [['helmet', 1.85], ['armor', kind === 'brute' || kind === 'boss' ? 1.46 : 0.78], ['rifle', 0.18]] as const) {
      const group = resident.getObjectByName(name)!;
      assert.equal(group.children.length, 1, `${kind} ${name} needs one draw call`);
      const mesh = group.children[0] as THREE.Mesh;
      assert.ok(mesh instanceof THREE.Mesh);
      const material = mesh.material as THREE.MeshStandardMaterial;
      assert.equal(material.vertexColors, true);
      assert.equal(mesh.userData.sharedAsset, undefined, 'generated gear remains instance-owned for disposal');
      mesh.geometry.computeBoundingBox();
      assert.ok(Math.abs(mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).x - width) < 1e-5, `${kind} ${name} retains width`);
      const colors = mesh.geometry.attributes.color;
      assert.equal(colors.count, mesh.geometry.attributes.position.count);
      const unique = new Set(Array.from({ length: colors.count }, (_, i) => `${colors.getX(i)},${colors.getY(i)},${colors.getZ(i)}`));
      assert.ok(unique.size >= 2, `${name} retains team markings`);
    }
  }
});
