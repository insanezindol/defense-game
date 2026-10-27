import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CameraControls } from "../src/camera-controls";

function setup(width = 1000, height = 600) {
  const handlers = new Map<string, (event: any) => void>();
  const captures = new Set<number>();
  const element = {
    clientWidth: width, clientHeight: height,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
    removeEventListener: (name: string) => handlers.delete(name),
    setPointerCapture: (id: number) => captures.add(id),
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: (id: number) => captures.delete(id),
  } as unknown as HTMLElement;
  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1200);
  let taps = 0;
  const controls = new CameraControls(camera, element, () => taps++);
  const pointer = (name: string, x: number, y: number, id = 1, pointerType = "mouse", button = 0) =>
    handlers.get(name)!({ clientX: x, clientY: y, pointerId: id, pointerType, button, preventDefault() {} });
  return { camera, controls, handlers, captures, pointer, taps: () => taps };
}

test("default view fits all map corners in landscape and portrait", () => {
  for (const [width, height] of [[1200, 600], [400, 900]]) {
    const { camera } = setup(width, height);
    for (const x of [-24, 24]) for (const z of [-34, 34]) {
      const point = new THREE.Vector3(x, 0, z).project(camera);
      assert.ok(Math.abs(point.x) <= 0.91 && Math.abs(point.y) <= 0.91);
    }
  }
});

test("pan grabs the ground and cursor zoom keeps its anchor", () => {
  const { camera, controls } = setup();
  const anchor = new THREE.Vector3(4, 0, 2);
  const screen = anchor.clone().project(camera);
  const x = (screen.x + 1) * 500, y = (1 - screen.y) * 300;
  controls.setZoom(2, x, y);
  const zoomed = anchor.clone().project(camera);
  assert.ok(Math.hypot(zoomed.x - screen.x, zoomed.y - screen.y) < 1e-9);
  controls.pan(x, y, x + 30, y + 20);
  const after = anchor.clone().project(camera);
  assert.ok(Math.abs(after.x - screen.x - 0.06) < 1e-9);
  assert.ok(Math.abs(after.y - screen.y + 20 / 300) < 1e-9);
});

test("zoom and pan clamp; resize preserves fixed view; reset restores default", () => {
  const { camera, controls } = setup();
  controls.pan(500, 300, 100000, 100000);
  assert.ok(Math.abs(controls.target.x) <= 24 && Math.abs(controls.target.z) <= 34);
  controls.setZoom(100);
  assert.equal(camera.zoom, 2.5);
  controls.setZoom(NaN);
  assert.equal(camera.zoom, 2.5);
  const target = controls.target.clone(), yaw = controls.yaw, pitch = controls.pitch;
  controls.resize(500, 900);
  assert.deepEqual(controls.target, target);
  assert.equal(controls.yaw, yaw);
  assert.equal(controls.pitch, pitch);
  assert.equal(camera.zoom, 2.5);
  controls.setZoom(0);
  assert.equal(camera.zoom, 0.65);
  controls.reset();
  assert.equal(camera.zoom, 1);
  assert.equal(controls.target.length(), 0);
  assert.ok(Math.abs(controls.screenInput(1, 0).length() - 1) < 1e-9);
});

test("only taps select; drag, pinch, cancellation and lost capture cannot select", () => {
  const { controls, pointer, taps, handlers, captures } = setup();
  pointer("pointerdown", 500, 300);
  pointer("pointerup", 502, 301);
  assert.equal(taps(), 1);
  pointer("pointerdown", 500, 300);
  pointer("pointermove", 530, 300);
  pointer("pointerup", 500, 300);
  pointer("pointerdown", 400, 300, 2, "touch");
  pointer("pointerdown", 600, 300, 3, "touch");
  pointer("pointermove", 650, 300, 3, "touch");
  pointer("pointerup", 650, 300, 3, "touch");
  pointer("pointerup", 400, 300, 2, "touch");
  pointer("pointerdown", 500, 300);
  pointer("pointercancel", 500, 300);
  pointer("pointerup", 500, 300);
  pointer("pointerdown", 500, 300);
  pointer("lostpointercapture", 500, 300);
  pointer("pointerup", 500, 300);
  assert.equal(taps(), 1);
  controls.dispose();
  assert.equal(handlers.size, 0);
  assert.equal(captures.size, 0);
});

test("right drag is ignored, two touches pan and pinch without rotating", () => {
  const { camera, controls, pointer, taps } = setup();
  const yaw = controls.yaw;
  pointer("pointerdown", 500, 300, 1, "mouse", 2);
  pointer("pointermove", 550, 320, 1, "mouse", 2);
  pointer("pointerup", 550, 320, 1, "mouse", 2);
  assert.equal(controls.yaw, yaw);
  assert.equal(taps(), 0);
  controls.reset();
  pointer("pointerdown", 400, 300, 2, "touch");
  pointer("pointerdown", 600, 300, 3, "touch");
  pointer("pointermove", 650, 320, 3, "touch");
  assert.ok(camera.zoom > 1);
  assert.equal(controls.yaw, yaw);
  const target = controls.target.clone();
  controls.setZoom(1.5);
  assert.deepEqual(controls.target, target);
  assert.ok(controls.target.length() > 0);
  assert.ok(Math.abs(controls.screenInput(0, -1).length() - 1) < 1e-9);
});


test("parallel two-finger drag moves the ground while preserving angle and zoom", () => {
  const { camera, controls, pointer, taps } = setup();
  const orientation = camera.quaternion.clone();
  pointer("pointerdown", 400, 300, 2, "touch");
  pointer("pointerdown", 600, 300, 3, "touch");
  pointer("pointermove", 430, 320, 2, "touch");
  pointer("pointermove", 630, 320, 3, "touch");
  assert.ok(controls.target.length() > 1);
  assert.ok(camera.quaternion.angleTo(orientation) < 1e-7);
  assert.ok(Math.abs(camera.zoom - 1) < 1e-9);
  pointer("pointerup", 430, 320, 2, "touch");
  pointer("pointerup", 630, 320, 3, "touch");
  assert.equal(taps(), 0);
});
