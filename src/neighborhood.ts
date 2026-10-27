import * as THREE from 'three';
import { HOME } from './battlefield';

export function createNeighborhood(materials = new Map<string, THREE.MeshStandardMaterial>()) {
  const root = new THREE.Group();
  const cream = '#eee3ca', trim = '#fff0d3', dark = '#334852', glass = '#42777f';
  const wood = '#93674e', leaf = '#558357', brick = '#b27658';
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
  function planter(p: THREE.Object3D, x: number, z: number) {
    box(p, brick, x, 0.28, z, 1.45, 0.5, 0.75);
    box(p, '#594c3d', x, 0.55, z, 1.25, 0.06, 0.58);
    for (let i = 0; i < 3; i++) {
      bush(p, x - 0.45 + i * 0.45, 0.78, z, 0.38);
      bush(p, x - 0.45 + i * 0.45, 1.01, z + 0.08, 0.12, '#e9b863');
    }
  }
  function fence(p: THREE.Object3D, x: number, z: number, length: number) {
    const f = group('fence', x, z, p);
    for (let i = 0; i <= length; i += 0.55) {
      box(f, trim, i - length / 2, 0.7, 0, 0.12, 1.25, 0.15);
      mesh(f, trim, new THREE.ConeGeometry(0.105, 0.16, 4), i - length / 2, 1.4, 0).rotation.y = Math.PI / 4;
    }
    for (const y of [0.45, 1.05]) box(f, cream, 0, y, -0.08, length, 0.12, 0.12);
    return f;
  }
  function window(p: THREE.Object3D, x: number, y: number, z: number, w = 1.15, h = 1.5) {
    const g = group('window', x, z, p); g.position.y = y;
    box(g, wood, 0, 0, 0, w + 0.26, h + 0.25, 0.14);
    box(g, glass, 0, 0, 0.09, w, h, 0.08);
    box(g, '#7eb4b3', -w * 0.25, 0.06, 0.14, w * 0.35, h * 0.84, 0.025);
    for (const side of [-1, 1]) box(g, trim, side * (w / 2 + 0.04), 0, 0.15, 0.09, h + 0.18, 0.1);
    for (const yy of [-h / 2, 0, h / 2]) box(g, trim, 0, yy, 0.16, w + 0.18, 0.08, 0.1);
    box(g, trim, 0, 0, 0.16, 0.07, h, 0.1);
    box(g, cream, 0, -h / 2 - 0.1, 0.16, w + 0.4, 0.16, 0.4);
    return g;
  }
  function house(x: number, z: number, wall: string, roofColor: string, floors: number, index: number, home = false) {
    const g = group(home ? 'home' : 'house', x, z);
    const w = home ? 7 : 6, d = 5.4, h = floors * 2.65 + 0.5;
    box(g, '#b9b5a0', 0, 0.12, 0, w + 2.5, 0.24, d + 3.4);
    box(g, brick, 0, 0.5, 0, w + 0.2, 0.75, d + 0.2);
    box(g, wall, 0, (h + 0.6) / 2, 0, w, h - 0.6, d);
    for (let y = 0.35; y < 0.8; y += 0.22) {
      box(g, '#d5b09a', 0, y, d / 2 + 0.12, w, 0.025, 0.02);
      for (let i = 0; i < 8; i++) box(g, '#d5b09a', -w / 2 + i * 0.85 + (y > 0.5 ? 0.4 : 0), y + 0.09, d / 2 + 0.12, 0.025, 0.17, 0.02);
    }
    for (const side of [-1, 1]) box(g, cream, side * (w / 2 - 0.1), h / 2 + 0.3, d / 2 + 0.05, 0.18, h - 0.5, 0.16);
    for (let level = 0; level < floors; level++) {
      const yy = 2.05 + level * 2.65;
      for (const xx of [-w * 0.29, w * 0.29]) {
        window(g, xx, yy, d / 2 + 0.04);
        for (const side of [-1, 1]) {
          box(g, roofColor, xx + side * 0.84, yy, d / 2 + 0.08, 0.3, 1.65, 0.1);
          for (let slat = 0; slat < 6; slat++) box(g, wood, xx + side * 0.84, yy - 0.6 + slat * 0.24, d / 2 + 0.15, 0.24, 0.035, 0.03);
        }
      }
      for (const side of [-1, 1]) {
        const win = window(g, side * (w / 2 + 0.02), yy, 0, 1.2, 1.4); win.rotation.y = side * Math.PI / 2;
      }
      box(g, cream, 0, yy + 1.05, d / 2 + 0.06, w, 0.13, 0.22);
    }
    box(g, dark, 0, 1.27, d / 2 + 0.08, 1.18, 2.25, 0.12);
    box(g, roofColor, 0, 1.23, d / 2 + 0.17, 0.94, 2.08, 0.1);
    box(g, glass, 0, 1.78, d / 2 + 0.24, 0.65, 0.66, 0.04);
    cylinder(g, '#dba94e', 0.32, 1.18, d / 2 + 0.32, 0.06, 0.06, 0.06).rotation.x = Math.PI / 2;
    for (let step = 0; step < 3; step++) box(g, cream, 0, 0.12 + step * 0.12, d / 2 + 1 - step * 0.22, 1.65, 0.2, 0.8);
    box(g, roofColor, 0, 2.65, d / 2 + 0.5, 1.9, 0.14, 1.2).rotation.x = 0.12;
    // A gable, separate sloped roof panels and ridge replace the old pyramid silhouette.
    const shape = new THREE.Shape().moveTo(-w / 2, 0).lineTo(w / 2, 0).lineTo(0, 1.7).closePath();
    mesh(g, wall, new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }), 0, h, -d / 2, 'roof');
    const slope = Math.atan2(1.9, w / 2 + 0.45), width = Math.hypot(w / 2 + 0.45, 1.9);
    for (const side of [-1, 1]) {
      box(g, roofColor, side * (w / 2 + 0.45) / 2, h + 0.9, 0, width, 0.18, d + 0.85).rotation.z = -side * slope;
      for (let row = 1; row <= 4; row++) {
        const xx = side * row * (w / 2 + 0.45) / 4;
        box(g, wood, xx, h + 1.9 - row * 1.9 / 4 + 0.12, 0, 0.065, 0.05, d + 0.85).rotation.z = -side * slope;
      }
      box(g, cream, side * (w / 2 + 0.4), h - 0.07, 0, 0.14, 0.25, d + 0.9);
      cylinder(g, dark, side * (w / 2 + 0.2), h / 2, -d / 2, 0.055, 0.055, h);
    }
    box(g, roofColor, 0, h + 1.94, 0, 0.2, 0.15, d + 0.95);
    box(g, brick, 1.65, h + 1.8, -1.25, 0.65, 1.8, 0.8);
    box(g, cream, 1.65, h + 2.7, -1.25, 0.85, 0.16, 1);
    window(g, 0, h + 0.6, d / 2 + 0.05, 0.65, 0.65);
    const ac = box(g, cream, w / 2 + 0.24, 2.1, -1.65, 0.5, 0.7, 1.05, 'air-conditioner');
    for (let i = 0; i < 5; i++) box(g, dark, ac.position.x + 0.26, 1.88 + i * 0.1, -1.65, 0.025, 0.04, 0.8);
    planter(g, -w / 2 + 0.7, d / 2 + 1.1);
    fence(g, 0, -d / 2 - 0.7, w + 1.3);
    const mailbox = group('mailbox', w / 2 + 0.65, d / 2 + 0.8, g);
    box(mailbox, wood, 0, 0.65, 0, 0.12, 1.3, 0.12);
    box(mailbox, roofColor, 0, 1.35, 0, 0.5, 0.4, 0.55);
    box(mailbox, dark, 0, 1.4, 0.29, 0.34, 0.045, 0.02);
    if (index % 2 === 0) {
      const balcony = group('balcony', 0, d / 2 + 0.5, g);
      balcony.position.y = floors > 1 ? 3.2 : 0.2;
      box(balcony, cream, 0, 0, 0, 2.8, 0.16, 1);
      for (let i = -3; i <= 3; i++) box(balcony, dark, i * 0.4, 0.55, 0.4, 0.04, 1, 0.04);
      box(balcony, dark, 0, 1.05, 0.4, 2.8, 0.06, 0.06);
    }
    return g;
  }
  house(HOME.x, HOME.z, '#dfbd8b', '#476f73', 2, 1, true);
  const colors = ['#dbbd95', '#a6b8a4', '#c88b75', '#b6bec2'];
  const roofs = ['#626e79', '#9f6150', '#476f73'];
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const g = house(side * 29, -25 + Math.floor(i / 2) * 16, colors[i % 4], roofs[i % 3], i % 3 ? 2 : 1, i);
    g.rotation.y = -side * Math.PI / 2;
  }
  for (let i = 0; i < 4; i++) house(-16 + i * 10, -30, colors[(i + 1) % 4], roofs[(i + 1) % 3], 2, i);

  function shop(x: number, z: number, color: string) {
    const g = group('shop', x, z);
    box(g, '#b9b5a0', 0, 0.14, 0, 8.5, 0.28, 7);
    box(g, cream, 0, 2, 0, 7, 4, 5);
    box(g, color, 0, 3.35, 2.65, 7.3, 0.85, 0.25);
    box(g, trim, 0, 4.15, 0, 7.5, 0.3, 5.5);
    box(g, dark, 0, 4.35, 0, 6.8, 0.13, 4.8);
    for (const xx of [-2.2, 0, 2.2]) window(g, xx, 1.8, 2.54, 1.65, 2.1);
    for (let i = 0; i < 12; i++) {
      box(g, i % 2 ? trim : color, -3.3 + i * 0.6, 2.85, 3.15, 0.6, 0.1, 1.1).rotation.x = 0.15;
      box(g, i % 2 ? trim : color, -3.3 + i * 0.6, 2.65, 3.7, 0.6, 0.35, 0.08);
    }
    for (let i = 0; i < 3; i++) {
      box(g, wood, -2.5 + i * 1.05, 0.4, 3.2, 0.8, 0.65, 0.8);
      for (let j = 0; j < 4; j++) bush(g, -2.7 + i * 1.05 + j % 2 * 0.35, 0.84, 3.05 + Math.floor(j / 2) * 0.3, 0.18, i % 2 ? '#e9b863' : '#c88b75');
    }
    const ac = box(g, cream, 1.8, 4.65, 0.5, 1.6, 0.6, 1.3, 'air-conditioner');
    cylinder(g, dark, ac.position.x, 4.98, 0.5, 0.48, 0.48, 0.06, 12);
    return g;
  }
  shop(8, 27, '#9f6150'); shop(18, 27, '#476f73');

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
    const color = ['#c88b75', '#e9b863', '#476f73', '#b6bec2'][i];
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
  for (const x of [-20.5, 20.5]) for (const z of [-28, 22]) {
    const g = group('bench', x, z);
    for (let i = 0; i < 4; i++) box(g, wood, 0, 0.65, -0.3 + i * 0.2, 2.4, 0.09, 0.15);
    for (let i = 0; i < 3; i++) box(g, wood, 0, 1 + i * 0.2, -0.45, 2.4, 0.14, 0.1);
    for (const side of [-1, 1]) box(g, dark, side * 0.9, 0.35, 0, 0.1, 0.7, 0.65);
    planter(g, 0, 1.4);
  }
  return root;
}
