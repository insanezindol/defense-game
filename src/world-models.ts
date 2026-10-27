import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Enemy } from "./game";

type CharacterKind = Enemy["kind"] | "hero" | "spam";
export const MIN_ZOOM = 0.65;
export const MAX_ZOOM = 2.5;

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
  const pink = "#ff638e", yellow = "#ffe06a", teal = "#46d6c4", navy = "#27344f";
  const skin = "#dba77e";
  const human = kind === "hero" || kind === "grunt";
  const cape = namedGroup(body, "cape", 0, 1.1, -0.22);
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const name = side < 0 ? "left" : "right";
    const leg = namedGroup(body, `leg-${name}`, side * (brute || boss ? 0.32 : 0.19), human ? 0.9 : 0.66, 0);
    if (kind === "runner") {
      const foot = box(leg, navy, side * 0.17, -0.12, 0, 0.045, 0.6, 0.045);
      foot.rotation.z = side * 0.65;
    } else {
      box(leg, kind === "hero" ? "#aaa9c6" : navy, 0, human ? -0.3 : -0.2, 0, 0.24, human ? 0.73 : 0.47, 0.25);
      const shoe = namedGroup(leg, `shoe-${name}`);
      if (human) {
        box(shoe, kind === 'hero' ? '#b96458' : '#334852', 0, -0.76, 0.08, 0.28, 0.16, 0.47);
        box(shoe, '#eee3ca', 0, -0.84, 0.08, 0.29, 0.045, 0.48);
        box(shoe, kind === 'hero' ? '#e5b782' : navy, 0, -0.66, 0, 0.19, 0.09, 0.25);
      } else {
        const slipper = sphere(shoe, teal, 0, -0.49, 0.1, 0.19);
        slipper.scale.set(1, 0.55, 1.55);
      }
    }
    const arm = namedGroup(body, `arm-${name}`, side * (brute || boss ? 0.64 : 0.4), human ? 1.62 : 1.35, 0);
    arms.push(arm);
    if (kind !== "runner") {
      const sleeve = part(arm, new THREE.CylinderGeometry(0.16, 0.15, 0.3, 6), kind === "hero" ? teal : kind === "grunt" ? navy : pink, 0, -0.09, 0);
      sleeve.scale.y = 1.2;
      box(arm, skin, 0, -0.32, 0, 0.16, 0.34, 0.17);
      sphere(arm, skin, 0, -0.49, 0.04, 0.13);
    } else {
      const leg = box(arm, navy, side * 0.18, -0.15, 0, 0.035, 0.64, 0.035);
      leg.rotation.z = side * 0.7;
    }
  }
  function eyes(parent: THREE.Object3D, y: number, z: number, spread = 0.16, size = 0.14) {
    for (const side of [-1, 1]) {
      sphere(parent, "#ffffff", side * spread, y + (side === -1 ? 0.035 : 0), z, size);
      sphere(parent, navy, side * spread + 0.022, y + 0.01, z + size * 0.83, size * 0.47);
    }
  }
  if (kind === "hero" || kind === "grunt") {
    const shirt = part(body, new THREE.CylinderGeometry(0.43, 0.36, 0.8, 4), kind === "hero" ? '#398b83' : navy, 0, 1.4, 0);
    shirt.rotation.y = Math.PI / 4; shirt.scale.z = 0.8;
    const collar = namedGroup(body, 'collar');
    for (const side of [-1, 1]) box(collar, '#eee3ca', side * 0.1, 1.77, 0.19, 0.16, 0.15, 0.07).rotation.z = side * -0.45;
    const belt = namedGroup(body, 'belt');
    box(belt, '#65483e', 0, 1.02, 0, 0.54, 0.1, 0.4);
    box(belt, yellow, 0.08, 1.02, 0.215, 0.1, 0.09, 0.035);
    if (kind === "grunt") {
      for (const y of [1.2, 1.37, 1.54]) box(body, "#faf1df", 0, y, 0.25, 0.54, 0.06, 0.035);
    } else {
      box(body, '#eee3ca', -0.15, 1.46, 0.25, 0.14, 0.15, 0.03);
      for (const y of [1.2, 1.4, 1.6]) sphere(body, '#e9b863', 0.03, y, 0.28, 0.025);
    }
    part(body, new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), skin, 0, 1.88, 0);
    const head = namedGroup(body, 'head', 0, 2.13, 0);
    part(head, new THREE.CylinderGeometry(0.27, 0.23, 0.48, 8), skin, 0, 0, 0);
    for (const side of [-1, 1]) {
      sphere(head, skin, side * 0.27, 0, 0, 0.07);
      box(head, navy, side * 0.1, 0.06, 0.252, 0.045, 0.065, 0.02);
      box(head, '#65483e', side * 0.1, 0.15, 0.24, 0.085, 0.025, 0.03).rotation.z = side * -0.12;
    }
    part(head, new THREE.ConeGeometry(0.065, 0.13, 4), skin, 0, -0.025, 0.29).rotation.x = Math.PI / 2;
    box(head, '#93674e', 0.015, -0.14, 0.232, 0.09, 0.018, 0.025);
    const hair = namedGroup(head, 'hair');
    part(hair, new THREE.CylinderGeometry(0.24, 0.29, 0.18, 7), kind === 'hero' ? '#65483e' : navy, 0, 0.23, -0.02);
    box(hair, kind === 'hero' ? '#65483e' : navy, -0.13, 0.16, 0.19, 0.25, 0.15, 0.16).rotation.z = -0.18;
    box(hair, kind === 'hero' ? '#65483e' : navy, 0, 0.06, -0.23, 0.43, 0.3, 0.1);
    if (kind === "hero") {
      const broom = namedGroup(arms[1], "broom", 0, -0.49, 0.12);
      box(broom, "#b98554", 0, 0.21, 0.22, 0.075, 1.45, 0.075).rotation.x = -0.22;
      const bristles = box(broom, yellow, 0, -0.53, 0.38, 0.46, 0.35, 0.18);
      bristles.rotation.x = -0.22;
      box(broom, pink, 0, -0.38, 0.34, 0.48, 0.1, 0.2);
      for (const x of [-0.15, -0.05, 0.05, 0.15]) box(broom, "#d99f36", x, -0.58, 0.48, 0.018, 0.21, 0.025);
    } else {
      const mask = namedGroup(head, "burglar-mask");
      box(mask, navy, 0, 0.04, 0.25, 0.45, 0.13, 0.04);
      for (const side of [-1, 1]) {
        box(mask, '#faf1df', side * 0.1, 0.05, 0.277, 0.1, 0.06, 0.02);
        box(mask, navy, side * 0.1, 0.05, 0.291, 0.035, 0.045, 0.01);
      }
      const sack = namedGroup(cape, "sack", -0.11, 0.03, -0.15);
      const bag = sphere(sack, yellow, 0, 0, -0.15, 0.54);
      bag.scale.set(1, 1.16, 0.9);
      part(sack, new THREE.ConeGeometry(0.2, 0.3, 8), "#e8b84d", 0, 0.63, -0.15);
      box(sack, pink, 0, 0.49, -0.15, 0.34, 0.08, 0.28);
      // A giant stolen toothbrush sticks out of the sack.
      box(sack, teal, -0.27, 0.66, -0.12, 0.09, 0.7, 0.09).rotation.z = 0.22;
      box(sack, "#ffffff", -0.35, 1.01, -0.12, 0.22, 0.2, 0.14);
    }
  } else if (kind === "spam") {
    const phone = namedGroup(body, "spam-phone");
    box(phone, teal, 0, 1.29, 0, 0.82, 1.3, 0.32);
    for (const side of [-1, 1]) for (const y of [0.68, 1.9]) {
      sphere(phone, teal, side * 0.34, y, 0, 0.1).scale.z = 1.6;
    }
    box(phone, pink, 0, 1.29, 0.18, 0.69, 1.12, 0.055);
    box(phone, navy, 0, 1.35, 0.22, 0.58, 0.71, 0.04);
    eyes(phone, 1.54, 0.27, 0.16, 0.16);
    for (const x of [-0.12, 0, 0.12]) sphere(phone, navy, x, 1.79, 0.23, 0.035);
    part(phone, new THREE.TorusGeometry(0.085, 0.025, 6, 12), yellow, 0, 0.86, 0.23);
    const receiver = namedGroup(phone, "spam-receiver", 0, 1.12, 0.27);
    box(receiver, yellow, 0, 0, 0, 0.26, 0.045, 0.055).rotation.z = -0.3;
    for (const side of [-1, 1]) sphere(receiver, yellow, side * 0.12, side * -0.035, 0, 0.065);
    for (const side of [-1, 1]) {
      const buzz = namedGroup(cape, `phone-ring-${side}`, side * 0.57, 0.63, 0.25);
      box(buzz, yellow, 0, 0, 0, 0.055, 0.31, 0.06).rotation.z = side * -0.35;
      box(buzz, yellow, side * 0.13, 0, 0, 0.045, 0.2, 0.055).rotation.z = side * -0.35;
    }
  } else if (kind === "runner") {
    const abdomen = sphere(body, pink, 0, 1.12, -0.16, 0.33);
    abdomen.scale.set(0.82, 0.8, 1.8);
    sphere(body, yellow, 0, 1.36, 0.3, 0.29);
    eyes(body, 1.48, 0.44, 0.18, 0.18);
    const nose = namedGroup(body, "proboscis");
    const straw = part(nose, new THREE.ConeGeometry(0.045, 0.65, 6), navy, 0, 1.28, 0.83);
    straw.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const wing = namedGroup(body, side < 0 ? "wing-left" : "wing-right", side * 0.15, 1.43, -0.2);
      const shape = sphere(wing, "#c4f8ff", side * 0.47, 0, -0.15, 0.5);
      shape.scale.set(1.25, 0.08, 0.65);
      shape.rotation.y = side * -0.45;
      box(wing, "#6acfd5", side * 0.45, 0.025, -0.15, 0.7, 0.025, 0.025);
      box(body, navy, side * 0.34, 0.9, -0.37, 0.035, 0.5, 0.035).rotation.z = side * 0.7;
      const antenna = box(body, navy, side * 0.16, 1.78, 0.27, 0.035, 0.3, 0.035);
      antenna.rotation.z = side * -0.4;
      sphere(body, pink, side * 0.22, 1.93, 0.27, 0.07);
    }
  } else if (kind === "brute") {
    const speaker = namedGroup(body, "speaker");
    box(speaker, pink, 0, 1.25, 0, 1.08, 1.3, 0.6);
    box(speaker, navy, 0, 1.21, 0.32, 0.93, 1.06, 0.065);
    for (const [y, r] of [[0.99, 0.29], [1.48, 0.17]]) {
      const ring = part(speaker, new THREE.TorusGeometry(r, 0.05, 6, 16), yellow, 0, y, 0.38);
      sphere(speaker, teal, 0, y, 0.37, r * 0.64).scale.z = 0.35;
      ring.name = y < 1 ? "woofer" : "tweeter";
    }
    eyes(body, 1.96, 0.24, 0.22, 0.16);
    box(body, teal, 0, 2.12, -0.03, 0.5, 0.09, 0.18);
    for (const side of [-1, 1]) {
      const note = namedGroup(cape, `noise-${side}`, side * 0.64, 0.55, 0.17);
      box(note, yellow, 0, 0.12, 0, 0.04, 0.3, 0.05);
      sphere(note, yellow, -0.055, 0, 0, 0.09).scale.z = 0.4;
    }
  } else {
    const calendar = namedGroup(body, "monday-calendar");
    box(calendar, pink, 0, 1.3, 0, 1.13, 1.26, 0.5);
    box(calendar, "#fff8e6", 0, 1.25, 0.27, 1.0, 1.06, 0.06);
    box(calendar, teal, 0, 1.77, 0.32, 1.05, 0.23, 0.06);
    // Geometry lettering survives disposal and stays crisp at every zoom.
    const letter = (x: number, y: number, w: number, h: number, angle = 0) => {
      box(calendar, "#ffffff", x, y, 0.36, w, h, 0.035).rotation.z = angle;
    };
    for (const x of [-0.36, -0.14, 0.14, 0.36]) letter(x, 1.77, 0.035, 0.14);
    letter(-0.305, 1.79, 0.035, 0.09, 0.65); letter(-0.195, 1.79, 0.035, 0.09, -0.65);
    letter(-0.08, 1.77, 0.025, 0.14); letter(0.08, 1.77, 0.025, 0.14);
    letter(0, 1.83, 0.16, 0.025); letter(0, 1.71, 0.16, 0.025);
    letter(0.25, 1.77, 0.035, 0.18, 0.65);
    eyes(calendar, 1.49, 0.33, 0.21, 0.13);
    const clock = namedGroup(calendar, "alarm-clock", 0, 1.04, 0.34);
    const dial = part(clock, new THREE.CylinderGeometry(0.26, 0.26, 0.065, 24), yellow, 0, 0, 0);
    dial.rotation.x = Math.PI / 2;
    box(clock, navy, 0, 0.07, 0.05, 0.03, 0.17, 0.025);
    box(clock, navy, 0.065, 0, 0.05, 0.16, 0.03, 0.025).rotation.z = -0.3;
    for (const side of [-1, 1]) {
      part(calendar, new THREE.TorusGeometry(0.1, 0.035, 6, 12), navy, side * 0.31, 1.95, 0);
      const bell = sphere(calendar, yellow, side * 0.49, 2.12, 0, 0.23);
      bell.scale.set(1.2, 0.65, 0.9);
      bell.rotation.z = side * -0.4;
    }
    sphere(calendar, pink, 0, 2.13, 0, 0.08);
  }
  const health = namedGroup(root, "health", 0, human ? 2.75 : 2.46, 0);
  box(health, navy, 0, 0, 0, 0.95, 0.085, 0.025);
  box(health, enemy ? pink : teal, 0, 0, 0.02, 0.88, 0.045, 0.025).name = "hp";
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
  const stride = walking ? Math.sin(time * 10) * 0.55 : 0;
  model.getObjectByName("leg-left")!.rotation.x = stride;
  model.getObjectByName("leg-right")!.rotation.x = walking ? -stride : 0;
  model.getObjectByName("arm-left")!.rotation.x = -stride * 0.6;
  model.getObjectByName("arm-right")!.rotation.x = attacking ? -1.2 + Math.sin(time * 22) * 0.65 : stride * 0.6;
  model.getObjectByName("cape")!.rotation.x = -0.12 + Math.sin(time * 5) * (walking ? 0.18 : 0.045);
  model.getObjectByName("body")!.position.y = walking ? Math.abs(Math.sin(time * 10)) * 0.065 : Math.sin(time * 2) * 0.018;
  if (model.userData.kind === "spam") {
    model.getObjectByName("body")!.rotation.z = Math.sin(time * 35) * (attacking ? 0.11 : 0.055);
  }
  if (model.userData.kind === "runner") {
    for (const side of [-1, 1]) model.getObjectByName(side < 0 ? "wing-left" : "wing-right")!.rotation.z = side * Math.sin(time * 35) * 0.35;
    model.getObjectByName("body")!.position.y += 0.18 + Math.sin(time * 8) * 0.08;
  }
}

export function createDefense(kind: "arrow" | "cannon" | "frost", level: number, materials = new Map<string, THREE.MeshStandardMaterial>()) {
  const root = new THREE.Group();
  const { part, box, sphere } = toyParts(materials);
  const teal = "#46d6c4", pink = "#ff638e", yellow = "#ffe06a", navy = "#27344f";
  part(root, new THREE.CylinderGeometry(0.74, 0.84, 0.19, 24), teal, 0, 0.14, 0);
  for (let i = 0; i < Math.min(3, Math.max(1, level)); i++) sphere(root, yellow, (i - (Math.min(3, Math.max(1, level)) - 1) / 2) * 0.25, 0.27, 0.65, 0.08);
  if (kind === "arrow") {
    part(root, new THREE.CylinderGeometry(0.24, 0.32, 0.77, 12), pink, 0, 0.59, 0);
    const turret = namedGroup(root, "turret", 0, 1.12, 0);
    const pin = namedGroup(turret, "clothespin");
    for (const side of [-1, 1]) {
      const jaw = box(pin, yellow, side * 0.15, 0, 0.12, 0.22, 0.26, 1.35);
      jaw.rotation.y = side * 0.12;
      box(pin, "#c69152", side * 0.15, 0.14, -0.11, 0.17, 0.025, 0.75);
    }
    const spring = part(pin, new THREE.TorusGeometry(0.21, 0.055, 6, 12), navy, 0, 0.04, -0.16);
    spring.rotation.y = Math.PI / 2;
    box(turret, "#b98554", 0, 0.07, 0.4, 0.07, 0.07, 1.1);
    part(turret, new THREE.ConeGeometry(0.14, 0.28, 8), pink, 0, 0.07, 1.01).rotation.x = Math.PI / 2;
    box(turret, teal, 0, 0.07, -0.08, 0.32, 0.06, 0.2);
  } else if (kind === "cannon") {
    for (const side of [-1, 1]) {
      const wheel = part(root, new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12), pink, side * 0.55, 0.48, 0);
      wheel.rotation.z = Math.PI / 2;
      sphere(root, yellow, side * 0.65, 0.48, 0, 0.12);
    }
    const turret = namedGroup(root, "turret", 0, 0.93, 0);
    const parcel = namedGroup(turret, "parcel-launcher");
    box(parcel, "#d5a16a", 0, 0.01, 0, 0.95, 0.76, 0.92);
    box(parcel, yellow, 0, 0.4, 0, 0.22, 0.035, 0.95);
    box(parcel, yellow, 0, 0.03, 0.47, 0.22, 0.77, 0.025);
    const barrel = part(parcel, new THREE.CylinderGeometry(0.27, 0.27, 0.74, 12), teal, 0, 0.13, 0.55);
    barrel.rotation.x = Math.PI / 2;
    const hole = part(parcel, new THREE.CylinderGeometry(0.19, 0.19, 0.02, 12), navy, 0, 0.13, 0.93);
    hole.rotation.x = Math.PI / 2;
    box(parcel, "#fff8e6", -0.26, 0.05, 0.475, 0.24, 0.29, 0.025);
    box(parcel, pink, -0.26, 0.05, 0.495, 0.14, 0.045, 0.015).rotation.z = 0.5;
    for (const side of [-1, 1]) {
      const flap = box(parcel, "#e5b782", side * 0.54, 0.43, 0, 0.35, 0.04, 0.86);
      flap.rotation.z = side * 0.4;
    }
  } else {
    box(root, "#fff8e6", 0, 0.67, 0, 0.24, 0.98, 0.25);
    const fan = namedGroup(root, "household-fan", 0, 1.55, 0);
    part(fan, new THREE.TorusGeometry(0.67, 0.07, 8, 24), pink, 0, 0, 0);
    const blades = namedGroup(fan, "blades");
    for (let i = 0; i < 4; i++) {
      const blade = namedGroup(blades, `blade-${i}`);
      blade.rotation.z = i * Math.PI / 2;
      const paddle = sphere(blade, teal, 0.27, 0.1, 0, 0.3);
      paddle.scale.set(1.1, 0.48, 0.13);
      paddle.rotation.z = 0.4;
    }
    for (let i = 0; i < 6; i++) {
      const wire = box(fan, "#fff8e6", 0, 0, 0.11, 1.29, 0.025, 0.025);
      wire.rotation.z = i * Math.PI / 6;
    }
    sphere(fan, yellow, 0, 0, 0.15, 0.14).scale.z = 0.6;
    box(root, pink, 0, 0.3, 0.43, 0.25, 0.1, 0.13);
  }
  // Merge each rigid group into one vertex-colored mesh; aiming and fan blades remain independent.
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
    const key = "toy-defense";
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true }));
    const mesh = new THREE.Mesh(mergeGeometries(geometries)!, materials.get(key));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
  batch(root);
  return root;
}
