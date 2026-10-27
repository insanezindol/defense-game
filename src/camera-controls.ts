import * as THREE from "three";
import { MIN_ZOOM, MAX_ZOOM } from "./world-models";

const DEFAULT_YAW = Math.atan2(0.13, 0.72);
const DEFAULT_PITCH = Math.atan2(0.68, Math.hypot(0.13, 0.72));
type Pointer = { x: number; y: number; startX: number; startY: number; button: number };

export class CameraControls {
  readonly target = new THREE.Vector3();
  readonly yaw = DEFAULT_YAW;
  readonly pitch = DEFAULT_PITCH;
  private distance = 100;
  private defaultZoom = 1;
  private pointers = new Map<number, Pointer>();
  private gesturing = false;
  private pinchDistance = 0;
  private pinchZoom = 1;
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(
    private camera: THREE.PerspectiveCamera,
    private element: HTMLElement,
    private onTap: (clientX: number, clientY: number) => void,
    private onZoom?: (zoom: number) => void,
  ) {
    this.resize(element.clientWidth, element.clientHeight);
    this.reset();
    element.addEventListener("pointerdown", this.pointerDown);
    element.addEventListener("pointermove", this.pointerMove);
    element.addEventListener("pointerup", this.pointerUp);
    element.addEventListener("pointercancel", this.pointerCancel);
    element.addEventListener("lostpointercapture", this.pointerCancel);
    element.addEventListener("wheel", this.wheel, { passive: false });
    element.addEventListener("contextmenu", this.contextMenu);
  }

  apply() {
    this.target.x = THREE.MathUtils.clamp(this.target.x, -24, 24);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -34, 34);
    this.camera.position.set(
      Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.distance).add(this.target);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  resize(width: number, height: number) {
    this.defaultZoom = width < 700 ? 1.7 : 1;
    this.camera.aspect = Math.max(width, 1) / Math.max(height, 1);
    const outward = new THREE.Vector3(Math.sin(DEFAULT_YAW) * Math.cos(DEFAULT_PITCH),
      Math.sin(DEFAULT_PITCH), Math.cos(DEFAULT_YAW) * Math.cos(DEFAULT_PITCH));
    const right = new THREE.Vector3(Math.cos(DEFAULT_YAW), 0, -Math.sin(DEFAULT_YAW));
    const up = new THREE.Vector3().crossVectors(outward, right);
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.9;
    this.distance = 0;
    for (const x of [-24, 24]) for (const z of [-34, 34]) {
      const corner = new THREE.Vector3(x, 0, z);
      this.distance = Math.max(this.distance, corner.dot(outward) + Math.max(
        Math.abs(corner.dot(right)) / (tangent * this.camera.aspect), Math.abs(corner.dot(up)) / tangent,
      ));
    }
    // Keep depth precision around the visible neighborhood, including the pan bounds.
    this.camera.near = Math.max(1, this.distance - 120);
    this.camera.far = this.distance + 120;
    this.camera.updateProjectionMatrix();
    this.apply();
  }

  reset() {
    this.target.set(0, 0, 0);
    this.camera.zoom = this.defaultZoom;
    this.camera.updateProjectionMatrix();
    this.apply();
    this.onZoom?.(this.camera.zoom);
  }

  private groundPoint(clientX: number, clientY: number) {
    const bounds = this.element.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(
      (clientX - bounds.left) / Math.max(bounds.width, 1) * 2 - 1,
      1 - (clientY - bounds.top) / Math.max(bounds.height, 1) * 2,
    ), this.camera);
    return this.ray.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  setZoom(value: number, clientX?: number, clientY?: number) {
    if (!Number.isFinite(value)) return this.camera.zoom;
    const before = clientX !== undefined && clientY !== undefined ? this.groundPoint(clientX, clientY) : null;
    this.camera.zoom = THREE.MathUtils.clamp(value, MIN_ZOOM, MAX_ZOOM);
    this.camera.updateProjectionMatrix();
    if (before) {
      const after = this.groundPoint(clientX!, clientY!);
      if (after) this.target.add(before.sub(after));
    }
    this.apply();
    this.onZoom?.(this.camera.zoom);
    return this.camera.zoom;
  }

  pan(fromX: number, fromY: number, toX: number, toY: number) {
    const before = this.groundPoint(fromX, fromY), after = this.groundPoint(toX, toY);
    if (before && after) this.target.add(before.sub(after));
    this.apply();
  }

  screenInput(x: number, z: number) {
    return new THREE.Vector2(x * Math.cos(this.yaw) + z * Math.sin(this.yaw),
      z * Math.cos(this.yaw) - x * Math.sin(this.yaw));
  }

  private pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (!this.pointers.size) this.gesturing = false;
    this.pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, button: event.button,
    });
    if (this.pointers.size > 1) {
      this.gesturing = true;
      this.pinchDistance = 0;
    }
    this.element.setPointerCapture(event.pointerId);
  };

  private pointerMove = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    const points = [...this.pointers.values()];
    const oldX = pointer.x, oldY = pointer.y;
    const beforeDistance = points.length >= 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    if (points.length >= 2 && !this.pinchDistance) {
      this.pinchDistance = beforeDistance;
      this.pinchZoom = this.camera.zoom;
    }
    const centerX = points.length >= 2 ? (points[0].x + points[1].x) / 2 : 0;
    const centerY = points.length >= 2 ? (points[0].y + points[1].y) / 2 : 0;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > 5) this.gesturing = true;
    if (!this.gesturing) return;
    if (points.length >= 2) {
      const nextX = (points[0].x + points[1].x) / 2, nextY = (points[0].y + points[1].y) / 2;
      this.pan(centerX, centerY, nextX, nextY);
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (this.pinchDistance > 0 && distance > 0) this.setZoom(this.pinchZoom * distance / this.pinchDistance, nextX, nextY);
    } else this.pan(oldX, oldY, pointer.x, pointer.y);
  };

  private release(event: PointerEvent) {
    this.pointers.delete(event.pointerId);
    this.pinchDistance = 0;
    if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
  }

  private pointerUp = (event: PointerEvent) => {
    const pointer = this.pointers.get(event.pointerId);
    const tap = pointer && !this.gesturing && pointer.button === 0 &&
      Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) <= 5;
    this.release(event);
    if (tap) this.onTap(event.clientX, event.clientY);
  };

  private pointerCancel = (event: PointerEvent) => {
    this.gesturing = true;
    this.release(event);
  };

  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.element.clientHeight : 1;
    this.setZoom(this.camera.zoom * Math.exp(-event.deltaY * unit * 0.0015), event.clientX, event.clientY);
  };

  private contextMenu = (event: Event) => event.preventDefault();

  dispose() {
    for (const id of this.pointers.keys()) if (this.element.hasPointerCapture(id)) this.element.releasePointerCapture(id);
    this.pointers.clear();
    this.element.removeEventListener("pointerdown", this.pointerDown);
    this.element.removeEventListener("pointermove", this.pointerMove);
    this.element.removeEventListener("pointerup", this.pointerUp);
    this.element.removeEventListener("pointercancel", this.pointerCancel);
    this.element.removeEventListener("lostpointercapture", this.pointerCancel);
    this.element.removeEventListener("wheel", this.wheel);
    this.element.removeEventListener("contextmenu", this.contextMenu);
  }
}
