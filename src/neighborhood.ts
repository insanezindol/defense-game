import * as THREE from 'three';
import { HOME } from './battlefield';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createHouseModel } from './resident-models';

export function createNeighborhood(materials = new Map<string, THREE.MeshStandardMaterial>(), houses: GLTF[] = []) {
  const root = new THREE.Group();
  const cream = '#adb5a5', dark = '#334852', glass = '#42777f';
  const wood = '#93674e', leaf = '#558357';
  function mesh(p: THREE.Object3D, color: string, geo: THREE.BufferGeometry, x: number, y: number, z: number, name = '') {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, flatShading: true }));
    const m = new THREE.Mesh(geo, materials.get(color));
    m.position.set(x, y, z); m.name = name;
    m.castShadow = m.receiveShadow = true; p.add(m);
    return m;
  }
  const box = (p: THREE.Object3D, c: string, x: number, y: number, z: number, w: number, h: number, d: number, name = '') =>
    mesh(p, c, new THREE.BoxGeometry(w, h, d), x, y, z, name);
  const cylinder = (p: THREE.Object3D, c: string, x: number, y: number, z: number, top: number, bottom: number, h: number, n = 8) =>
    mesh(p, c, new THREE.CylinderGeometry(top, bottom, h, n), x, y, z);
  function group(name: string, x: number, z: number, parent: THREE.Object3D = root) {
    const g = new THREE.Group(); g.name = name; g.position.set(x, 0, z); parent.add(g); return g;
  }
  function beam(p: THREE.Object3D, c: string, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const m = mesh(p, c, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 6), 0, 0, 0);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }
  function bush(p: THREE.Object3D, x: number, y: number, z: number, r: number, color = leaf) {
    const m = mesh(p, color, new THREE.IcosahedronGeometry(r, 1), x, y, z); m.scale.y = 0.8;
    return m;
  }
  function fence(p: THREE.Object3D, x: number, z: number, length: number) {
    const f = group('fence', x, z, p);
    box(f, '#707b76', 0, 0.55, 0, length, 1.1, 0.4);
    for (const xx of [-length / 2, length / 2]) box(f, dark, xx, 0.7, 0, 0.2, 1.4, 0.45);
  }
  function crate(p: THREE.Object3D, x: number, z: number) {
    const c = group('supply-crate', x, z, p);
    box(c, '#66705a', 0, 0.45, 0, 1.1, 0.9, 0.9);
    for (const side of [-1, 1]) box(c, dark, side * 0.36, 0.47, 0, 0.07, 0.94, 0.95);
    box(c, '#d8b870', 0, 0.5, 0.46, 0.28, 0.12, 0.025);
  }
  const hq = group('hq', HOME.x, HOME.z);
  box(hq, '#727d74', 0, 0.2, 0, 9, 0.4, 8);
  box(hq, '#586b67', 0, 1.5, 0, 7, 2.6, 5.4, 'command-bunker');
  box(hq, '#334852', 0, 3, 0, 7.6, 0.45, 6, 'roof');
  box(hq, dark, 0, 1.15, 2.73, 1.5, 2, 0.15);
  for (const x of [-2.25, 2.25]) {
    box(hq, dark, x, 2, 2.73, 1.6, 0.55, 0.16, 'window');
    box(hq, glass, x, 2.05, 2.83, 1.36, 0.22, 0.04);
    fence(hq, x, -3.2, 3.3);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    box(hq, '#bdab70', side * (2.3 + i * 0.35), 0.43, 3.45, 0.18, 0.035, 0.6).rotation.y = -0.5;
  }
  crate(hq, -3.3, 3.1); crate(hq, 3.2, -2.3);
  const antenna = group('antenna', 1.8, -1, hq);
  cylinder(antenna, dark, 0, 4.3, 0, 0.045, 0.07, 2.8);
  box(antenna, dark, 0, 5.2, 0, 1.7, 0.06, 0.06);
  box(antenna, '#a7b6ae', 0, 4.65, 0, 0.8, 0.55, 0.12);
  box(antenna, '#72d5ce', 0, 5.74, 0, 0.08, 0.08, 0.08);
  function support(x: number, z: number, index: number) {
    const g = group('support-building', x, z);
    box(g, '#8a9387', 0, 0.12, 0, 8.5, 0.24, 8.8);
    if (houses.length) g.add(createHouseModel(houses[index % houses.length], 6));
    else {
      box(g, '#718078', 0, 1.7, 0, 6, 3.2, 5.4);
      box(g, dark, 0, 3.4, 0, 6.5, 0.3, 5.9, 'roof');
      for (const xx of [-1.7, 1.7]) box(g, glass, xx, 2, 2.72, 1.1, 0.55, 0.06, 'window');
      box(g, dark, 0, 1.2, 2.74, 1.15, 2.2, 0.12);
    }
    crate(g, -2.5, 3.4); fence(g, 0, -3.5, 7.3);
    box(g, dark, 0, 1.8, 2.95, 2, 0.4, 0.1);
    for (const side of [-1, 1]) box(g, '#d8b870', side * 0.7, 1.8, 3.02, 0.1, 0.24, 0.04);
    return g;
  }
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    support(side * 29, -25 + Math.floor(i / 2) * 16, i).rotation.y = -side * Math.PI / 2;
  }
  for (let i = 0; i < 4; i++) support(-16 + i * 10, -22, i);
  for (const x of [8, 18]) {
    const g = group('logistics', x, 27);
    box(g, '#8a9387', 0, 0.14, 0, 8.5, 0.28, 7);
    box(g, '#718078', 0, 2, 0, 7, 4, 5);
    box(g, dark, 0, 4.15, 0, 7.5, 0.3, 5.5);
    box(g, dark, 0, 3.35, 2.65, 7.3, 0.85, 0.25);
    box(g, '#475957', 0, 1.4, 2.56, 3.4, 2.6, 0.12);
    for (let y = 0.4; y < 2.7; y += 0.3) box(g, '#78837b', 0, y, 2.65, 3.3, 0.035, 0.04);
    crate(g, -2.7, 3); crate(g, 2.7, 3);
  }
  for (let i = 0; i < 16; i++) {
    const x = i % 2 ? 21.8 : -21.8, z = -25 + Math.floor(i / 2) * 8;
    const g = group('tree', x, z);
    cylinder(g, '#b9b5a0', 0, 0.14, 0, 1.25, 1.3, 0.28, 8);
    cylinder(g, wood, 0, 1.65, 0, 0.16, 0.28, 3.1, 7);
    for (const side of [-1, 1]) beam(g, wood, new THREE.Vector3(0, 1.8, 0), new THREE.Vector3(side * 0.65, 3.1, 0.2), 0.1);
    bush(g, -0.6, 3.1, 0, 1.1, i % 4 ? leaf : '#c49168');
    bush(g, 0.55, 3.5, 0.15, 1.3, i % 4 ? '#759658' : '#d6ae75');
    bush(g, 0, 4.1, -0.15, 1, i % 4 ? '#8ca568' : '#d6ae75');
  }
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1, x = side * 24.5, z = -23 + Math.floor(i / 2) * 16;
    const g = group('streetlight', x, z);
    cylinder(g, dark, 0, 2.5, 0, 0.07, 0.13, 5);
    cylinder(g, dark, 0, 0.3, 0, 0.22, 0.28, 0.5);
    box(g, dark, -side * 0.6, 5, 0, 1.3, 0.1, 0.12);
    box(g, dark, -side * 1.2, 4.94, 0, 0.65, 0.15, 0.45);
    box(g, '#f6d28b', -side * 1.2, 4.84, 0, 0.5, 0.07, 0.32);
  }
  for (let i = 0; i < 4; i++) {
    const g = group('car', i % 2 ? 24.8 : -24.8, -17 + i * 12);
    const color = ['#606e5d', '#6b756a', '#476f73', '#7b8584'][i];
    box(g, dark, 0, 0.38, 0, 1.55, 0.3, 3.3);
    box(g, color, 0, 0.75, 0, 1.8, 0.65, 3.6);
    const cabin = mesh(g, color, new THREE.CylinderGeometry(1, 1.25, 0.85, 4), 0, 1.46, -0.15);
    cabin.rotation.y = Math.PI / 4; cabin.scale.set(0.87, 1, 1.3);
    box(g, glass, 0, 1.45, 0.86, 1.15, 0.58, 0.06).rotation.x = -0.24;
    for (const side of [-1, 1]) {
      box(g, glass, side * 0.73, 1.45, -0.1, 0.03, 0.5, 1.5);
      for (const zz of [-1.1, 1.1]) {
        cylinder(g, '#333d41', side * 0.86, 0.42, zz, 0.38, 0.38, 0.22, 12).rotation.z = Math.PI / 2;
        cylinder(g, '#b6bec2', side * 0.99, 0.42, zz, 0.19, 0.19, 0.025, 8).rotation.z = Math.PI / 2;
      }
      box(g, '#f6d28b', side * 0.55, 0.84, 1.82, 0.4, 0.2, 0.05);
      box(g, '#9f6150', side * 0.55, 0.84, -1.82, 0.35, 0.17, 0.05);
    }
    box(g, cream, 0, 0.48, 1.84, 1.6, 0.13, 0.1);
  }
  for (let i = 0; i < 3; i++) {
    const g = group('utility-pole', -25, -29 + i * 26);
    cylinder(g, wood, 0, 3.7, 0, 0.12, 0.22, 7.4);
    box(g, dark, 0, 6.8, 0, 2.6, 0.14, 0.15);
    for (const xx of [-1, 0, 1]) {
      cylinder(g, cream, xx, 7.05, 0, 0.09, 0.12, 0.4, 6);
      if (i < 2) for (let j = 0; j < 12; j++) {
        const a = j / 12, b = (j + 1) / 12;
        beam(g, dark, new THREE.Vector3(xx, 7.25 - Math.sin(a * Math.PI) * 0.8, a * 26),
          new THREE.Vector3(xx, 7.25 - Math.sin(b * Math.PI) * 0.8, b * 26), 0.018);
      }
    }
  }
  return root;
}
