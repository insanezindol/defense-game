import * as THREE from 'three';
import { HOME } from './battlefield';

export function createNeighborhood(materials = new Map<string, THREE.MeshStandardMaterial>()) {
  const root = new THREE.Group();
  const concrete = '#858477', dark = '#343f3b', olive = '#60694d', steel = '#626e65', glass = '#496f72', sand = '#a09270';
  function mesh(p: THREE.Object3D, color: string, geo: THREE.BufferGeometry, x: number, y: number, z: number, name = '') {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0, flatShading: true }));
    const m = new THREE.Mesh(geo, materials.get(color));
    m.position.set(x, y, z); m.name = name; m.castShadow = m.receiveShadow = true; p.add(m); return m;
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
  function barrier(p: THREE.Object3D, x: number, z: number, length: number) {
    const f = group('concrete-barrier', x, z, p);
    box(f, concrete, 0, 0.55, 0, length, 1.1, 0.45);
    box(f, '#6d7166', 0, 0.2, 0, length + 0.15, 0.4, 0.85);
    for (let xx = -length / 2 + 0.4; xx < length / 2; xx += 1.2) {
      box(f, '#b6a569', xx, 0.75, 0.24, 0.15, 0.45, 0.025).rotation.z = -0.4;
    }
  }
  function crate(p: THREE.Object3D, x: number, z: number) {
    const c = group('supply-crate', x, z, p);
    box(c, olive, 0, 0.45, 0, 1.1, 0.9, 0.9);
    for (const side of [-1, 1]) box(c, dark, side * 0.36, 0.47, 0, 0.07, 0.94, 0.95);
    box(c, '#d8b870', 0, 0.5, 0.46, 0.28, 0.12, 0.025);
  }
  function sandbags(p: THREE.Object3D, x: number, z: number, length: number) {
    const g = group('sandbags', x, z, p);
    for (let row = 0; row < 3; row++) for (let i = 0; i < length; i++) {
      const bag = mesh(g, row % 2 ? sand : '#95896b', new THREE.CapsuleGeometry(0.18, 0.48, 2, 6),
        (i - (length - 1) / 2) * 0.8 + (row % 2) * 0.15, 0.2 + row * 0.3, 0);
      bag.rotation.z = Math.PI / 2;
    }
  }
  function drum(p: THREE.Object3D, x: number, z: number) {
    const g = group('fuel-drum', x, z, p);
    cylinder(g, '#675d43', 0, 0.6, 0, 0.4, 0.4, 1.2, 12);
    for (const y of [0.15, 1.05]) cylinder(g, dark, 0, y, 0, 0.42, 0.42, 0.06, 12);
    cylinder(g, '#a09270', 0.15, 1.22, 0, 0.055, 0.055, 0.04);
  }
  const hq = group('hq', HOME.x, HOME.z);
  box(hq, concrete, 0, 0.2, 0, 9, 0.4, 8);
  box(hq, '#59665b', 0, 1.5, 0, 7, 2.6, 5.4, 'command-bunker');
  box(hq, dark, 0, 3, 0, 7.6, 0.45, 6, 'roof');
  box(hq, dark, 0, 1.15, 2.73, 1.5, 2, 0.15);
  for (const x of [-2.25, 2.25]) {
    box(hq, dark, x, 2, 2.73, 1.6, 0.55, 0.16, 'window');
    box(hq, glass, x, 2.05, 2.83, 1.36, 0.22, 0.04);
    sandbags(hq, x, -3.2, 4);
  }
  sandbags(hq, -2.5, 3.4, 4); sandbags(hq, 2.5, 3.4, 4);
  crate(hq, -3.3, 2.5); crate(hq, 3.2, -2.3);
  const antenna = group('antenna', 1.8, -1, hq);
  cylinder(antenna, dark, 0, 4.3, 0, 0.045, 0.07, 2.8);
  box(antenna, dark, 0, 5.2, 0, 1.7, 0.06, 0.06);
  box(antenna, '#a7b6ae', 0, 4.65, 0, 0.8, 0.55, 0.12);
  box(antenna, '#bd7953', 0, 5.74, 0, 0.08, 0.08, 0.08);
  function support(x: number, z: number, index: number) {
    const g = group('support-building', x, z);
    box(g, '#7e7b68', 0, 0.12, 0, 8.5, 0.24, 8.8);
    if (index % 3 === 0) {
      const tent = group('field-tent', 0, 0, g);
      box(tent, olive, 0, 0.85, 0, 5.8, 1.3, 6.2);
      for (const side of [-1, 1]) {
        box(tent, '#6d7454', side * 1.5, 2.35, 0, 3.5, 0.14, 6.6, 'roof').rotation.z = -side * 0.54;
        beam(tent, '#9c947c', new THREE.Vector3(side * 2.9, 1.5, 2.8), new THREE.Vector3(side * 3.8, 0.25, 3.6), 0.025);
      }
      box(tent, dark, 0, 0.9, 3.13, 1.5, 1.4, 0.06);
      box(tent, '#8b8c66', 0, 3.22, 0, 0.2, 0.12, 6.7);
    } else {
      const hangar = group('barracks', 0, 0, g);
      box(hangar, concrete, 0, 0.3, 0, 6.3, 0.4, 6.7);
      const roof = mesh(hangar, index % 2 ? steel : olive,
        new THREE.CylinderGeometry(3, 3, 6.4, 12, 1, false, -Math.PI / 2, Math.PI), 0, 0.5, 0, 'roof');
      roof.rotation.x = -Math.PI / 2;
      for (const zz of [-2.8, -1.4, 0, 1.4, 2.8]) mesh(hangar, dark, new THREE.TorusGeometry(3.02, 0.045, 4, 18, Math.PI), 0, 0.5, zz);
      box(hangar, dark, 0, 1.15, 3.24, 1.5, 1.7, 0.08);
      for (const side of [-1, 1]) box(hangar, glass, side * 1.85, 1.3, 3.25, 0.75, 0.35, 0.06, 'window');
    }
    crate(g, -2.5, 3.4); drum(g, 2.4, 3.2); barrier(g, 0, -3.7, 7.3);
    return g;
  }
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    support(side * 29, -25 + Math.floor(i / 2) * 16, i).rotation.y = -side * Math.PI / 2;
  }
  for (let i = 0; i < 4; i++) support(-16 + i * 10, -22, i);
  for (const x of [8, 18]) {
    const g = group('logistics', x, 27);
    box(g, concrete, 0, 0.14, 0, 8.5, 0.28, 7);
    box(g, steel, 0, 2, 0, 7, 4, 5);
    box(g, dark, 0, 4.15, 0, 7.5, 0.3, 5.5, 'roof');
    box(g, dark, 0, 3.35, 2.65, 7.3, 0.85, 0.25);
    box(g, '#47534a', 0, 1.4, 2.56, 3.4, 2.6, 0.12);
    for (let y = 0.4; y < 2.7; y += 0.3) box(g, '#8a8b77', 0, y, 2.65, 3.3, 0.035, 0.04);
    for (const side of [-1, 1]) { crate(g, side * 2.7, 3); drum(g, side * 3.4, -2.3); }
  }
  for (const side of [-1, 1]) {
    const fence = group('perimeter-wire', side * 20.8, 0);
    for (let z = -28; z <= 28; z += 4) {
      cylinder(fence, dark, 0, 0.9, z, 0.055, 0.07, 1.8);
      if (z < 28) for (const y of [0.6, 1.1, 1.6]) beam(fence, '#73796d', new THREE.Vector3(0, y, z), new THREE.Vector3(0, y, z + 4), 0.018);
      mesh(fence, '#73796d', new THREE.TorusGeometry(0.28, 0.025, 3, 8), 0, 1.65, z + 0.5).rotation.y = Math.PI / 2;
    }
    for (const z of [-34, 34]) {
      const tower = group('watchtower', side * 24, z);
      for (const xx of [-1.2, 1.2]) for (const zz of [-1.2, 1.2]) {
        box(tower, steel, xx, 2.6, zz, 0.18, 5.2, 0.18);
        beam(tower, dark, new THREE.Vector3(xx, 0.2, zz), new THREE.Vector3(-xx, 4.7, zz), 0.045);
      }
      box(tower, dark, 0, 4.8, 0, 3.1, 0.2, 3.1);
      for (const xx of [-1.4, 1.4]) box(tower, olive, xx, 5.3, 0, 0.14, 0.9, 2.9);
      for (const zz of [-1.4, 1.4]) box(tower, olive, 0, 5.3, zz, 2.9, 0.9, 0.14);
      box(tower, dark, 0, 6.4, 0, 3.6, 0.18, 3.6, 'roof');
      for (const xx of [-1.4, 1.4]) for (const zz of [-1.4, 1.4]) box(tower, steel, xx, 5.9, zz, 0.09, 0.9, 0.09);
      for (const xx of [-0.3, 0.3]) box(tower, dark, xx, 2.4, 1.6, 0.07, 4.8, 0.07);
      for (let y = 0.3; y < 4.8; y += 0.35) box(tower, steel, 0, y, 1.6, 0.65, 0.06, 0.07);
    }
  }
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const g = group(i < 2 ? 'armored-vehicle' : 'supply-truck', side * 24.8, -15 + Math.floor(i / 2) * 25);
    box(g, dark, 0, 0.5, 0, 2.1, 0.45, 4.3);
    box(g, olive, 0, 1.1, 0, 2.3, 0.9, 4.6);
    box(g, olive, 0, 1.8, 1.1, 2.1, 0.7, 1.8);
    box(g, glass, 0, 1.9, 2.02, 1.5, 0.3, 0.05);
    if (i < 2) {
      cylinder(g, steel, 0, 2.05, -0.6, 0.65, 0.85, 0.65);
      box(g, dark, 0, 2.15, 0.65, 0.13, 0.13, 2.2);
      box(g, '#a3996b', -0.65, 1.4, 2.32, 0.3, 0.1, 0.03);
    } else {
      box(g, '#777a57', 0, 2, -0.75, 2.2, 1.2, 2.5);
      for (const zz of [-1.7, -0.7, 0.3]) box(g, dark, 0, 2.62, zz, 2.25, 0.06, 0.06);
    }
    for (const side of [-1, 1]) for (const z of [-1.5, 0, 1.5]) {
      cylinder(g, '#303732', side * 1.13, 0.5, z, 0.48, 0.48, 0.3, 12).rotation.z = Math.PI / 2;
      cylinder(g, steel, side * 1.3, 0.5, z, 0.22, 0.22, 0.04).rotation.z = Math.PI / 2;
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const g = group('scorched-stump', side * (35 + i % 2), -27 + i * 17);
      cylinder(g, '#514d3d', 0, 0.8, 0, 0.16, 0.36, 1.6);
      beam(g, '#514d3d', new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(side * 0.65, 1.65, 0.2), 0.09);
    }
    for (const z of [-32, 35]) {
      const g = group('shell-crater', side * 10, z);
      cylinder(g, '#575748', 0, 0.08, 0, 2.1, 2.3, 0.1, 14);
      cylinder(g, '#45493e', 0, 0.14, 0, 1.65, 1.8, 0.03, 14);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        mesh(g, concrete, new THREE.IcosahedronGeometry(0.22, 0), Math.cos(a) * 2.2, 0.2, Math.sin(a) * 2.2);
      }
    }
  }
  for (const x of [-17, 17]) {
    barrier(root, x, -16.5, 5);
    sandbags(root, x, 16, 4);
    const g = group('tank-obstacle', x, -30);
    for (const angle of [-0.7, 0.7]) box(g, dark, 0, 1.1, 0, 0.18, 2.5, 0.18).rotation.z = angle;
    box(g, dark, 0, 1.1, 0, 0.18, 0.18, 2.4).rotation.y = 0.5;
  }
  return root;
}
