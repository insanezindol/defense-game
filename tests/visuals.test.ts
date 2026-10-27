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
