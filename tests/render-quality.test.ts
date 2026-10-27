import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World } from '../src/world';
import { CameraControls } from '../src/camera-controls';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

test('terrain does not overlay nearly coplanar grass surfaces', () => {
  const world = Object.create(World.prototype) as World;
  Object.assign(world, { root: new THREE.Group(), pads: [], materials: new Map() });
  world.terrain();
  world.root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
  const surfaces = new Set(ray.intersectObject(world.root, true)
    .filter(hit => hit.point.y >= 0).map(hit => hit.point.y.toFixed(4)));
  assert.equal(surfaces.size, 1, 'the central lawn must have one visible ground surface');
});

test('resize uses native mobile DPR, budgets large screens, and keeps composer in sync', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
  const ambientOcclusion = new SSAOPass(new THREE.Scene(), camera, 1, 1, 8);
  try {
    Object.defineProperty(globalThis, 'devicePixelRatio', { value: 3, configurable: true });
    const world = Object.create(World.prototype) as World;
    let width = 390, height = 844, rendererRatio = 1, composerRatio = 1;
    const bloom = { enabled: true };
    const controls = new CameraControls(camera, {
      clientWidth: width, clientHeight: height, addEventListener() {},
    } as unknown as HTMLElement, () => {});
    Object.assign(world, {
      host: { getBoundingClientRect: () => ({ width, height }) },
      camera, controls,
      renderer: { setPixelRatio(r: number) { rendererRatio = r; }, getPixelRatio: () => rendererRatio, setSize() {} },
      composer: { setPixelRatio(r: number) { composerRatio = r; }, setSize() {} },
      ambientOcclusion, bloom,
      particles: { material: { uniforms: { pixelRatio: { value: 1 } } } },
    });
    world.resize();
    assert.equal(rendererRatio, 3);
    assert.equal(composerRatio, rendererRatio);
    assert.equal(ambientOcclusion.enabled, false);
    assert.equal(bloom.enabled, false);
    for (const material of [ambientOcclusion.ssaoMaterial, ambientOcclusion.depthRenderMaterial]) {
      assert.equal(material.uniforms.cameraNear.value, camera.near);
      assert.equal(material.uniforms.cameraFar.value, camera.far);
    }
    width = 1440; height = 1000;
    world.resize();
    assert.ok(width * height * rendererRatio ** 2 <= 3_000_001);
    assert.equal(composerRatio, rendererRatio);
    assert.equal(ambientOcclusion.enabled, true);
    assert.equal(bloom.enabled, true);
    assert.equal(ambientOcclusion.ssaoMaterial.uniforms.cameraFar.value, camera.far);
  } finally {
    ambientOcclusion.dispose();
    if (original) Object.defineProperty(globalThis, 'devicePixelRatio', original);
    else Reflect.deleteProperty(globalThis, 'devicePixelRatio');
  }
});
