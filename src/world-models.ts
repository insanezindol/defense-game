import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Enemy } from "./game";
import { animateResident } from './resident-models';

type CharacterKind = Enemy["kind"] | "hero";
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

export function setCameraZoom(camera: THREE.PerspectiveCamera, value: number) {
  if (Number.isFinite(value)) camera.zoom = THREE.MathUtils.clamp(value, MIN_ZOOM, MAX_ZOOM);
  camera.updateProjectionMatrix();
  return camera.zoom;
}

export function fitCamera(camera: THREE.PerspectiveCamera, aspect: number) {
  const zoom = camera.zoom;
  camera.zoom = 1;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  let distance = 46;
  for (let i = 0; i < 30; i++) {
    camera.position.set(distance * 0.13, distance * 0.68, distance * 0.72);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const corners = [-16, 16].flatMap(x => [-14.5, 14.5].map(z => new THREE.Vector3(x, 0, z)));
    corners.push(new THREE.Vector3(0, 7, 12));
    if (corners.every(p => { p.project(camera); return Math.abs(p.x) < 0.91 && Math.abs(p.y) < 0.91; })) break;
    distance *= 1.08;
  }
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}

export function projectilePosition(start: THREE.Vector3, end: THREE.Vector3, progress: number, lob: boolean) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const point = start.clone().lerp(end, t);
  if (lob) point.y += 8 * t * (1 - t);
  return point;
}

function toyParts(materials: Map<string, THREE.MeshStandardMaterial>) {
  function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true }));
    const mesh = new THREE.Mesh(geometry, materials.get(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  return {
    part,
    box: (p: THREE.Object3D, c: string, x: number, y: number, z: number, w: number, h: number, d: number) =>
      part(p, new THREE.BoxGeometry(w, h, d), c, x, y, z),
    sphere: (p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number) =>
      part(p, new THREE.SphereGeometry(r, 12, 8), c, x, y, z),
  };
}

function namedGroup(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

export function createCharacter(kind: CharacterKind, materials = new Map<string, THREE.MeshStandardMaterial>()) {
  const root = new THREE.Group();
  const { part, box, sphere } = toyParts(materials);
  const body = namedGroup(root, "body");
  const enemy = kind !== "hero", boss = kind === "boss", brute = kind === "brute";
  const uniform = enemy ? '#694c44' : '#496c66', armor = enemy ? '#343d40' : '#304b52';
  const marking = enemy ? '#e98264' : '#72d5ce', skin = '#cba487';
  namedGroup(body, 'cape', 0, 1.1, -0.22);
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'left' : 'right';
    const leg = namedGroup(body, `leg-${name}`, side * 0.21, 0.85, 0);
    box(leg, uniform, 0, -0.28, 0, 0.29, 0.65, 0.3);
    box(leg, armor, 0, -0.69, 0.1, 0.32, 0.24, 0.48);
    const arm = namedGroup(body, `arm-${name}`, side * 0.47, 1.65, 0);
    box(arm, uniform, 0, -0.19, 0, 0.28, 0.48, 0.3);
    box(arm, armor, 0, -0.05, 0, 0.34, 0.25, 0.35);
    box(arm, skin, 0, -0.48, 0.05, 0.19, 0.18, 0.2);
    if (side === 1) {
      const rifle = namedGroup(arm, 'rifle', 0, -0.4, 0.3);
      box(rifle, '#263239', 0, 0, 0.14, 0.15, 0.2, 0.67);
      box(rifle, '#48555a', 0, 0.025, 0.6, 0.07, 0.08, boss || brute ? 0.65 : 0.4);
      box(rifle, '#263239', 0, -0.15, 0.1, 0.1, 0.22, 0.17);
      box(rifle, marking, 0, 0.15, 0.2, 0.08, 0.06, 0.14);
    }
  }
  box(body, uniform, 0, 1.38, 0, 0.77, 0.85, 0.43);
  const vest = namedGroup(body, 'armor');
  box(vest, armor, 0, 1.44, 0.16, brute ? 0.95 : 0.69, brute ? 0.86 : 0.62, 0.27);
  for (const x of [-0.2, 0, 0.2]) box(vest, uniform, x, 1.2, 0.34, 0.15, 0.22, 0.12);
  box(vest, marking, -0.18, 1.64, 0.31, 0.19, 0.09, 0.03);
  box(body, armor, 0, 1.38, -0.31, 0.53, 0.62, 0.24);
  const head = namedGroup(body, 'head', 0, 2.07, 0);
  part(head, new THREE.CylinderGeometry(0.25, 0.22, 0.45, 8), skin, 0, 0, 0);
  const helmet = namedGroup(head, 'helmet');
  part(helmet, new THREE.SphereGeometry(0.32, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), armor, 0, 0.13, 0);
  box(helmet, armor, 0, 0.12, 0.2, 0.58, 0.09, 0.32);
  box(head, '#1f3039', 0, 0.025, 0.24, 0.41, 0.14, 0.06);
  box(head, marking, 0, 0.04, 0.279, 0.32, 0.04, 0.02);
  if (kind === 'runner') box(body, marking, 0, 1.55, -0.48, 0.18, 0.42, 0.12);
  if (brute || boss) for (const side of [-1, 1]) box(vest, armor, side * 0.52, 1.6, 0, 0.3, 0.45, 0.58);
  if (boss) {
    box(helmet, marking, 0, 0.35, 0.1, 0.1, 0.24, 0.2);
    box(body, armor, -0.33, 2, -0.4, 0.035, 0.85, 0.035);
  }
  const health = namedGroup(root, 'health', 0, 2.85, 0);
  box(health, '#24353e', 0, 0, 0, 0.95, 0.085, 0.025);
  box(health, marking, 0, 0, 0.02, 0.88, 0.045, 0.025).name = 'hp';
  // Bake toy pieces into shared skinned surfaces; limbs remain real bones.
  body.updateMatrixWorld(true);
  const bones: THREE.Bone[] = [];
  const boneIndices = new Map<THREE.Object3D, number>();
  function rig(group: THREE.Group, parent: THREE.Object3D) {
    const bone = new THREE.Bone();
    bone.name = group.name;
    bone.position.copy(group.position); bone.quaternion.copy(group.quaternion); bone.scale.copy(group.scale);
    boneIndices.set(group, bones.length);
    bones.push(bone);
    parent.add(bone);
    for (const child of group.children) if (child instanceof THREE.Group) rig(child, bone);
  }
  rig(body, root);
  const surfaces = new Map<string, THREE.BufferGeometry[]>();
  body.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    const material = obj.material as THREE.MeshStandardMaterial;
    const surface = material.emissiveIntensity > 0 && material.emissive.getHex() !== 0 ? 'glow' : material.metalness > 0.5 ? 'metal' : 'cloth';
    const geometry = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
    geometry.applyMatrix4(obj.matrixWorld);
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3), indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    const index = boneIndices.get(obj.parent!)!;
    for (let i = 0; i < count; i++) {
      colors.set(material.color.toArray(), i * 3);
      indices[i * 4] = index;
      weights[i * 4] = 1;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    const list = surfaces.get(surface) ?? [];
    list.push(geometry); surfaces.set(surface, list);
    obj.geometry.dispose();
  });
  root.remove(body);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const [surface, geometries] of surfaces) {
    const key = `skin-${surface}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
      color: '#ffffff', vertexColors: true, metalness: surface === 'metal' ? 0.72 : 0.05,
      roughness: surface === 'metal' ? 0.32 : 0.85, flatShading: true,
      emissive: surface === 'glow' ? '#82bfff' : '#000000', emissiveIntensity: surface === 'glow' ? 1.4 : 0,
    }));
    const mesh = new THREE.SkinnedMesh(mergeGeometries(geometries)!, materials.get(key));
    geometries.forEach(geometry => geometry.dispose());
    mesh.castShadow = surface !== 'glow'; mesh.receiveShadow = true;
    // Animated weapon tips can leave their bind-pose bounds.
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton);
  }
  root.scale.setScalar(boss ? 1.9 : brute ? 1.3 : kind === "runner" ? 0.85 : 1.08);
  root.userData.kind = kind;
  return root;
}

export function animateCharacter(model: THREE.Group, time: number, walking: boolean, attacking: boolean) {
  if (model.userData.resident) return animateResident(model, time, walking, attacking);
  const stride = walking ? Math.sin(time * 10) * 0.55 : 0;
  model.getObjectByName("leg-left")!.rotation.x = stride;
  model.getObjectByName("leg-right")!.rotation.x = walking ? -stride : 0;
  model.getObjectByName("arm-left")!.rotation.x = -stride * 0.6;
  model.getObjectByName("arm-right")!.rotation.x = attacking ? -1.2 + Math.sin(time * 22) * 0.65 : stride * 0.6;
  model.getObjectByName("cape")!.rotation.x = -0.12 + Math.sin(time * 5) * (walking ? 0.18 : 0.045);
  model.getObjectByName("body")!.position.y = walking ? Math.abs(Math.sin(time * 10)) * 0.065 : Math.sin(time * 2) * 0.018;

}

export function createDefense(kind: "arrow" | "cannon" | "frost", level: number, materials = new Map<string, THREE.MeshStandardMaterial>(), branch?: "primary" | "secondary") {
  const root = new THREE.Group();
  const { part, box } = toyParts(materials);
  const steel = '#34494f', dark = '#202f37', accent = kind === 'frost' ? '#79d7e5' : '#d8b870';
  const specialized = level >= 3 && branch;
  const secondary = specialized && branch === 'secondary';
  const trim = secondary ? '#d38b67' : accent;
  part(root, new THREE.CylinderGeometry(0.77, 0.87, 0.23, 16), steel, 0, 0.17, 0);
  for (const side of [-1, 1]) box(root, dark, side * 0.61, 0.29, 0, 0.25, 0.18, 0.85);
  part(root, new THREE.CylinderGeometry(0.24, 0.38, 0.65, 12), steel, 0, 0.6, 0);
  const turret = namedGroup(root, 'turret', 0, 1.05, 0);
  const weapon = namedGroup(turret, kind === 'arrow' ? 'gatling' : kind === 'cannon' ? 'mortar' : 'cryo-emitter');
  box(weapon, steel, 0, 0, -0.2, 0.74, 0.46, 0.65);
  if (kind === 'arrow') {
    const barrels = namedGroup(weapon, 'barrels');
    const count = secondary ? 3 : 6;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      const barrel = part(barrels, new THREE.CylinderGeometry(secondary ? 0.09 : 0.055, secondary ? 0.09 : 0.055, 0.88, 8), dark,
        Math.cos(angle) * 0.17, Math.sin(angle) * 0.17, 0.58);
      barrel.rotation.x = Math.PI / 2;
    }
    for (const z of [0.3, 0.86]) part(weapon, new THREE.TorusGeometry(0.24, 0.045, 6, 12), steel, 0, 0, z);
    box(weapon, trim, -0.5, 0, -0.2, 0.25, 0.4, 0.54);
  } else if (kind === 'cannon') {
    for (const x of secondary ? [-0.24, 0.24] : [0]) {
      const tube = namedGroup(weapon, 'launcher', x, 0.13, 0.12); tube.rotation.x = 0.65;
      part(tube, new THREE.CylinderGeometry(0.22, 0.25, 1.1, 12), steel, 0, 0.35, 0);
      part(tube, new THREE.CylinderGeometry(0.16, 0.16, 0.025, 12), dark, 0, 0.91, 0);
      part(tube, new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), trim, 0, 0.73, 0);
    }
    for (const side of [-1, 1]) box(weapon, dark, side * 0.49, -0.15, 0, 0.16, 0.65, 0.8);
  } else {
    for (const side of [-1, 1]) {
      part(weapon, new THREE.CylinderGeometry(0.18, 0.18, 0.64, 10), trim, side * 0.48, 0.06, -0.15);
      box(weapon, dark, side * 0.48, 0.06, -0.15, 0.37, 0.12, 0.4);
    }
    const emitter = namedGroup(weapon, 'emitter', 0, 0.08, 0.48);
    for (const x of secondary ? [-0.2, 0.2] : [0]) {
      part(emitter, new THREE.TorusGeometry(0.22, 0.07, 8, 16), steel, x, 0, 0);
      part(emitter, new THREE.CylinderGeometry(0.13, 0.13, 0.16, 12), trim, x, 0, 0).rotation.x = Math.PI / 2;
    }
    box(weapon, trim, 0, 0.38, -0.1, 0.2, 0.12, 0.4);
  }
  for (let i = 0; i < Math.min(level, 3); i++) box(root, accent, (i - (Math.min(level, 3) - 1) / 2) * 0.2, 0.3, 0.65, 0.12, 0.06, 0.05);
  if (specialized) {
    const badge = namedGroup(weapon, `branch-${branch}`);
    box(badge, trim, 0, 0.32, -0.4, 0.46, 0.09, 0.08);
    if (secondary) box(badge, trim, 0, 0.45, -0.4, 0.25, 0.09, 0.08);
  }
  root.userData.branch = specialized || undefined;
  // Merge each rigid group into one vertex-colored mesh; aiming parts remain independent.
  function batch(group: THREE.Group) {
    for (const child of [...group.children]) if (child instanceof THREE.Group) batch(child);
    const geometries: THREE.BufferGeometry[] = [];
    for (const child of [...group.children]) {
      if (!(child instanceof THREE.Mesh)) continue;
      child.updateMatrix();
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      geometry.applyMatrix4(child.matrix);
      const color = (child.material as THREE.MeshStandardMaterial).color;
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set(color.toArray(), i);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometries.push(geometry);
      child.geometry.dispose();
      group.remove(child);
    }
    if (!geometries.length) return;
    const key = "outpost-defense";
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true }));
    const mesh = new THREE.Mesh(mergeGeometries(geometries)!, materials.get(key));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
  batch(root);
  return root;
}
