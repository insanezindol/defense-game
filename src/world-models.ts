import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Enemy } from "./game";

type CharacterKind = Enemy["kind"] | "hero";

export function fitCamera(camera: THREE.PerspectiveCamera, aspect: number) {
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
}

export function projectilePosition(start: THREE.Vector3, end: THREE.Vector3, progress: number, lob: boolean) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const point = start.clone().lerp(end, t);
  if (lob) point.y += 8 * t * (1 - t);
  return point;
}

export function createCharacter(kind: CharacterKind, materials = new Map<string, THREE.MeshStandardMaterial>()) {
  const root = new THREE.Group();
  const enemy = kind !== "hero", boss = kind === "boss", brute = kind === "brute";
  const armor = enemy ? boss ? "#554272" : brute ? "#625854" : "#783e3c" : "#9eafb9";
  const cloth = enemy ? boss ? "#421d56" : "#392c33" : "#164e75";
  const gold = enemy ? "#ae8052" : "#d4ae5c", skin = enemy ? "#7f9573" : "#d4b08a";
  const glow = enemy ? "#ff6850" : "#7ce7ff";
  function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string,
    x: number, y: number, z: number, metal = false, luminous = false) {
    const key = `${color}:${metal}:${luminous}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
      color, metalness: metal ? 0.72 : 0.05, roughness: metal ? 0.3 : 0.86,
      emissive: luminous ? color : "#000000", emissiveIntensity: luminous ? 2.2 : 0,
    }));
    const mesh = new THREE.Mesh(geometry, materials.get(key));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const box = (p: THREE.Object3D, c: string, x: number, y: number, z: number, w: number, h: number, d: number, metal = false) =>
    part(p, new THREE.BoxGeometry(w, h, d), c, x, y, z, metal);
  const sphere = (p: THREE.Object3D, c: string, x: number, y: number, z: number, r: number, metal = false) =>
    part(p, new THREE.SphereGeometry(r, 10, 8), c, x, y, z, metal);
  const body = new THREE.Group();
  body.name = "body";
  root.add(body);
  part(body, new THREE.CylinderGeometry(0.34, 0.28, 0.65, 10), armor, 0, 1.12, 0, true);
  box(body, cloth, 0, 0.79, 0, 0.56, 0.28, 0.4);
  box(body, gold, 0, 0.92, 0.05, 0.7, 0.1, 0.5, true);
  part(body, new THREE.OctahedronGeometry(0.11), glow, 0, 1.2, 0.32, true, true);
  for (const side of [-1, 1]) {
    const name = side < 0 ? "left" : "right";
    const leg = new THREE.Group();
    leg.name = `leg-${name}`;
    leg.position.set(side * 0.19, 0.77, 0);
    body.add(leg);
    box(leg, cloth, 0, -0.18, 0, 0.25, 0.42, 0.27);
    sphere(leg, gold, 0, -0.35, 0.12, 0.14, true);
    box(leg, armor, 0, -0.48, 0, 0.25, 0.27, 0.29, true);
    box(leg, "#273542", 0, -0.67, 0.09, 0.28, 0.18, 0.43, true);
    const arm = new THREE.Group();
    arm.name = `arm-${name}`;
    arm.position.set(side * 0.42, 1.34, 0);
    body.add(arm);
    const shoulder = sphere(arm, armor, 0, 0, 0, 0.23, true);
    shoulder.scale.set(1.2, 0.8, 1.15);
    part(arm, new THREE.TorusGeometry(0.2, 0.025, 4, 12), gold, 0, 0, 0.13, true);
    box(arm, cloth, 0, -0.25, 0, 0.2, 0.33, 0.22);
    box(arm, armor, 0, -0.43, 0.02, 0.24, 0.23, 0.26, true);
    sphere(arm, skin, 0, -0.58, 0.03, 0.12);
    if (side === 1) {
      box(arm, "#413439", 0, -0.55, 0.16, 0.08, 0.1, 0.32);
      box(arm, gold, 0, -0.55, 0.32, 0.38, 0.07, 0.09, true);
      const blade = part(arm, new THREE.ConeGeometry(brute ? 0.22 : 0.09, boss ? 1.3 : 0.9, 4), "#d6e8ee", 0, -0.55, 0.82, true);
      blade.rotation.x = Math.PI / 2;
      part(arm, new THREE.BoxGeometry(0.028, 0.025, 0.7), glow, 0, -0.61, 0.78, false, true);
    } else if (kind !== "runner") {
      const shield = part(arm, new THREE.CylinderGeometry(0.34, 0.34, 0.09, 6), gold, -0.08, -0.36, 0.22, true);
      shield.rotation.x = Math.PI / 2;
      const face = part(arm, new THREE.CylinderGeometry(0.28, 0.28, 0.1, 6), cloth, -0.08, -0.36, 0.24, true);
      face.rotation.x = Math.PI / 2;
      box(arm, gold, -0.08, -0.36, 0.31, 0.07, 0.38, 0.035, true);
    }
  }
  sphere(body, skin, 0, 1.68, 0.02, 0.26);
  const helmet = part(body, new THREE.SphereGeometry(0.29, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.65), armor, 0, 1.7, 0, true);
  helmet.scale.z = 1.05;
  box(body, armor, 0, 1.65, 0.25, 0.49, 0.25, 0.07, true);
  box(body, "#172631", 0, 1.69, 0.291, 0.38, 0.055, 0.025);
  for (const x of [-0.1, 0.1]) part(body, new THREE.BoxGeometry(0.075, 0.025, 0.02), glow, x, 1.69, 0.309, false, true);
  box(body, gold, 0, 1.61, 0.3, 0.055, 0.28, 0.04, true);
  if (enemy) {
    for (const side of [-1, 1]) {
      const horn = part(body, new THREE.ConeGeometry(0.1, boss ? 0.65 : 0.32, 7), "#d5c6a7", side * 0.28, 1.95, 0, false);
      horn.rotation.z = side * -0.5;
    }
  } else {
    const plume = part(body, new THREE.SphereGeometry(0.2, 10, 8), "#40a6bc", 0, 2.02, -0.05);
    plume.scale.set(0.42, 0.9, 1.8);
  }
  const cape = new THREE.Group();
  cape.name = "cape";
  cape.position.set(0, 1.43, -0.23);
  body.add(cape);
  const shape = new THREE.Shape();
  shape.moveTo(-0.26, 0); shape.lineTo(0.26, 0); shape.lineTo(0.45, -1.06);
  shape.lineTo(0.18, -0.96); shape.lineTo(0, -1.1); shape.lineTo(-0.43, -1.02); shape.closePath();
  const cloak = part(cape, new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false }), cloth, 0, 0, 0);
  cloak.rotation.x = 0.18;
  box(body, gold, 0, 1.46, -0.25, 0.56, 0.05, 0.08, true);
  const health = new THREE.Group();
  health.name = "health"; health.position.y = 2.3;
  root.add(health);
  box(health, "#142b35", 0, 0, 0, 0.95, 0.085, 0.025);
  const hp = box(health, enemy ? "#ef796b" : "#77e5b3", 0, 0, 0.02, 0.88, 0.045, 0.025);
  hp.name = "hp";
  // Bake rigid armor pieces into three skinned surfaces; limbs remain real bones.
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
    const surface = material.emissiveIntensity > 0 ? 'glow' : material.metalness > 0.5 ? 'metal' : 'cloth';
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
      roughness: surface === 'metal' ? 0.32 : 0.85,
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
  const stride = walking ? Math.sin(time * 10) * 0.55 : 0;
  model.getObjectByName("leg-left")!.rotation.x = stride;
  model.getObjectByName("leg-right")!.rotation.x = walking ? -stride : 0;
  model.getObjectByName("arm-left")!.rotation.x = -stride * 0.6;
  model.getObjectByName("arm-right")!.rotation.x = attacking ? -1.2 + Math.sin(time * 22) * 0.65 : stride * 0.6;
  model.getObjectByName("cape")!.rotation.x = -0.12 + Math.sin(time * 5) * (walking ? 0.18 : 0.045);
  model.getObjectByName("body")!.position.y = walking ? Math.abs(Math.sin(time * 10)) * 0.065 : Math.sin(time * 2) * 0.018;
}
