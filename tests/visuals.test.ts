import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCharacter, animateCharacter, fitCamera, projectilePosition, setCameraZoom } from "../src/world-models";

test("camera zoom enlarges the scene, clamps its range, and survives viewport fitting", () => {
  const camera = new THREE.PerspectiveCamera(42, 1.5, 0.1, 1200);
  fitCamera(camera, 1.5);
  camera.updateMatrixWorld();
  const original = new THREE.Vector3(5, 0, 0).project(camera).x;
  setCameraZoom(camera, 2);
  assert.ok(new THREE.Vector3(5, 0, 0).project(camera).x > original * 1.9);
  const position = camera.position.clone();
  fitCamera(camera, 1.5);
  assert.equal(camera.zoom, 2);
  assert.ok(camera.position.distanceTo(position) < 1e-8, 'resize must not counteract user zoom');
  setCameraZoom(camera, 100);
  assert.equal(camera.zoom, 5);
  setCameraZoom(camera, 0);
  assert.equal(camera.zoom, 1);
  setCameraZoom(camera, NaN);
  assert.equal(camera.zoom, 1);
  setCameraZoom(camera, 1);
  assert.equal(camera.zoom, 1);
});

test("the entire battlefield and keep fit in landscape and portrait cameras", () => {
  for (const aspect of [1.8, 1, 0.55]) {
    const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 200);
    fitCamera(camera, aspect);
    camera.updateMatrixWorld();
    for (const x of [-16, 16]) for (const z of [-14.5, 14.5]) {
      const point = new THREE.Vector3(x, 0, z).project(camera);
      assert.ok(Math.abs(point.x) < 0.96 && Math.abs(point.y) < 0.96, `${aspect}: ground ${point.toArray()}`);
    }
    assert.ok(Math.abs(new THREE.Vector3(0, 7, 12).project(camera).y) < 0.96);
  }
});

test("walking moves opposing legs and idle returns them to rest", () => {
  const hero = createCharacter("hero");
  animateCharacter(hero, 0.2, true, false);
  const left = hero.getObjectByName("leg-left")!;
  const right = hero.getObjectByName("leg-right")!;
  assert.ok(Math.abs(left.rotation.x) > 0.1);
  assert.ok(left.rotation.x * right.rotation.x < 0);
  animateCharacter(hero, 0.2, false, false);
  assert.equal(left.rotation.x, 0);
  assert.equal(right.rotation.x, 0);
});

test("each enemy has animated limbs and the boss has a larger silhouette", () => {
  const hero = createCharacter("hero");
  hero.updateMatrixWorld(true);
  const heroSize = new THREE.Box3().setFromObject(hero).getSize(new THREE.Vector3());
  for (const kind of ["grunt", "runner", "brute", "boss"] as const) {
    const model = createCharacter(kind);
    assert.ok(model.getObjectByName("arm-right"));
    assert.ok(model.getObjectByName("leg-left"));
    if (kind === "boss") {
      model.updateMatrixWorld(true);
      assert.ok(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y > heroSize.y * 1.5);
    }
  }
});

test("projectiles leave the muzzle, arc, and land exactly on the target", () => {
  const start = new THREE.Vector3(2, 2.5, 4), end = new THREE.Vector3(8, 1, -2);
  assert.deepEqual(projectilePosition(start, end, 0, true).toArray(), start.toArray());
  assert.deepEqual(projectilePosition(start, end, 1, true).toArray(), end.toArray());
  assert.ok(projectilePosition(start, end, 0.5, true).y > 3);
  assert.deepEqual(projectilePosition(start, end, 2, false).toArray(), end.toArray());
});

test("detailed characters use a small number of GPU-skinned draw calls", () => {
  const model = createCharacter("hero");
  const skinned: THREE.SkinnedMesh[] = [];
  model.traverse(obj => { if (obj instanceof THREE.SkinnedMesh) skinned.push(obj); });
  assert.ok(skinned.length > 0 && skinned.length <= 3);
  const mesh = skinned[0];
  model.updateMatrixWorld(true);
  mesh.skeleton.update();
  const before = Array.from({length: mesh.geometry.attributes.position.count}, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3()));
  animateCharacter(model, 0.2, true, true);
  model.updateMatrixWorld(true);
  mesh.skeleton.update();
  assert.ok(before.some((p, i) => p.distanceTo(mesh.getVertexPosition(i, new THREE.Vector3())) > 0.05));
});

test('choosing a branch rebuilds a level-three tower at the same level and preserves it afterward', async () => {
  const { World } = await import('../src/world');
  const { newGame } = await import('../src/game');
  const state = newGame();
  state.towers.push({ pad: 0, kind: 'arrow', level: 3, cooldown: 0 });
  const world = Object.create(World.prototype) as InstanceType<typeof World>;
  Object.assign(world, {
    root: new THREE.Group(), hero: createCharacter('hero'), camera: new THREE.PerspectiveCamera(),
    ring: new THREE.Mesh(), materials: new Map(), towers: new Map(), enemies: new Map(), shots: new Map(), pads: [],
    effects: [], lastTime: 0, lastWave: 0, lastHp: state.hp, lastShadowTime: -Infinity, shake: 0,
    heroPosition: new THREE.Vector2(state.hero.x, state.hero.z),
    renderer: { shadowMap: { needsUpdate: false } }, particles: { emit() {}, update() {} },
    controls: { apply() {} }, composer: { render() {} },
    ambientOcclusion: { ssaoMaterial: { uniforms: {
      cameraProjectionMatrix: { value: new THREE.Matrix4() }, cameraInverseProjectionMatrix: { value: new THREE.Matrix4() },
    } } },
  });
  world.draw(state, null);
  const before = world.towers.get(0)!.group;
  let disposed = false;
  before.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.addEventListener('dispose', () => disposed = true); });
  state.towers[0].branch = 'secondary';
  world.draw(state, null);
  const after = world.towers.get(0)!.group;
  assert.notEqual(before, after);
  assert.ok(disposed, 'replaced tower geometry must be disposed');
  assert.ok(after.getObjectByName('branch-secondary'));
  world.draw(state, null);
  assert.equal(world.towers.get(0)!.group, after, 'unchanged branch must keep its geometry');
});

test('support meteor descends before one impact and disposes its geometry afterward', async () => {
  const { World } = await import('../src/world');
  const { newGame } = await import('../src/game');
  const state = newGame();
  state.shots.push({ id: 1, x: 0, z: 0, tx: 0, tz: 0, kind: 'frost', life: 0.7 });
  const world = Object.create(World.prototype) as InstanceType<typeof World>;
  let impacts = 0;
  Object.assign(world, {
    root: new THREE.Group(), hero: createCharacter('hero'), camera: new THREE.PerspectiveCamera(),
    ring: new THREE.Mesh(), materials: new Map(), towers: new Map(), enemies: new Map(), shots: new Map(), pads: [],
    effects: [], lastTime: 0, lastWave: 0, lastHp: state.hp, lastShadowTime: -Infinity, shake: 0,
    heroPosition: new THREE.Vector2(state.hero.x, state.hero.z),
    renderer: { shadowMap: { needsUpdate: false } }, particles: { emit() {}, update() {} },
    controls: { apply() {} }, composer: { render() {} }, impact() { impacts++; },
    ambientOcclusion: { ssaoMaterial: { uniforms: {
      cameraProjectionMatrix: { value: new THREE.Matrix4() }, cameraInverseProjectionMatrix: { value: new THREE.Matrix4() },
    } } },
  });
  world.draw(state, null);
  const meteor = world.shots.get(1)!;
  assert.equal(meteor.position.y, 26);
  assert.equal(impacts, 0);
  state.time = 0.2; state.shots[0].life = 0.5; world.draw(state, null);
  assert.ok(meteor.position.y < 26 && meteor.position.y > 0.4);
  state.time = 0.35; state.shots[0].life = 0.35; world.draw(state, null);
  assert.equal(impacts, 1); assert.equal(meteor.visible, false);
  let disposed = false;
  (meteor.children[0] as THREE.Mesh).geometry.addEventListener('dispose', () => disposed = true);
  state.time = 0.7; state.shots = []; world.draw(state, null);
  assert.equal(impacts, 1); assert.equal(world.shots.size, 0); assert.ok(disposed);
});
