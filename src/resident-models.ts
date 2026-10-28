import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export const MODEL_PATHS = [
  '/models/residents/character-male-d.glb', '/models/residents/character-male-a.glb',
] as const;
export type NeighborhoodModels = { residents: GLTF[] };

export async function loadNeighborhoodModels(): Promise<NeighborhoodModels> {
  const loader = new GLTFLoader();
  const models: GLTF[] = [];
  try {
    for (const path of MODEL_PATHS) models.push(await loader.loadAsync(path));
    return { residents: models };
  } catch (error) {
    disposeNeighborhoodModels({ residents: models });
    throw error;
  }
}

export function disposeNeighborhoodModels(models: NeighborhoodModels) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  for (const source of models.residents) source.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      const map = (material as THREE.MeshStandardMaterial).map;
      if (map) textures.add(map);
    }
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}

export function createResident(source: GLTF, kind: 'hero' | 'grunt' | 'runner' | 'brute' | 'boss', materials: Map<string, THREE.MeshStandardMaterial>) {
  const root = new THREE.Group(), model = clone(source.scene);
  const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
  const scale = 2.7 / (bounds.max.y - bounds.min.y);
  model.scale.multiplyScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = object.receiveShadow = true;
    object.userData.sharedAsset = true;
    if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
  });
  root.add(model);
  function box(parent: THREE.Object3D, color: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.get(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  const health = new THREE.Group(); health.name = 'health'; health.position.y = 3.05; root.add(health);
  box(health, '#27344f', 0, 0, 0, 0.95, 0.085, 0.025);
  box(health, kind === 'hero' ? '#46d6c4' : '#ff638e', 0, 0, 0.02, 0.88, 0.045, 0.025).name = 'hp';
  const friendly = kind === 'hero', heavy = kind === 'brute' || kind === 'boss';
  const armor = friendly ? '#304b52' : '#423e3d', marking = friendly ? '#72d5ce' : '#e98264';
  function gear(name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const group = new THREE.Group(); group.name = name;
    group.position.set(x, y, z); group.scale.setScalar(1 / scale); parent.add(group); return group;
  }
  const helmet = gear('helmet', model.getObjectByName('head')!, 0, 0.345, 0);
  box(helmet, armor, 0, 0.12, 0, 1.72, 0.35, 1.28);
  box(helmet, armor, 0, -0.02, 0.45, 1.85, 0.12, 0.58);
  box(helmet, marking, 0, 0.12, 0.65, 0.35, 0.09, 0.025);
  const vest = new THREE.Group(); vest.name = 'armor'; root.add(vest);
  box(vest, armor, 0, 1.03, 0.06, heavy ? 1.05 : 0.78, 0.61, 0.55);
  box(vest, marking, -0.2, 1.2, 0.35, 0.19, 0.09, 0.03);
  for (const x of [-0.25, 0, 0.25]) box(vest, armor, x, 0.83, 0.35, 0.18, 0.22, 0.12);
  if (heavy) for (const side of [-1, 1]) box(vest, armor, side * 0.56, 1.15, 0, 0.34, 0.32, 0.58);
  const rifle = gear('rifle', model.getObjectByName('arm-right')!, 0, -0.1, 0.035);
  box(rifle, '#263239', 0, -0.2, 0.32, 0.18, 0.21, 0.72);
  box(rifle, '#48555a', 0, -0.18, 0.88, 0.075, 0.085, heavy ? 0.6 : 0.43);
  box(rifle, '#263239', 0, -0.36, 0.24, 0.12, 0.25, 0.18);
  box(rifle, marking, 0, -0.05, 0.36, 0.08, 0.06, 0.18);
  if (kind === 'runner') box(vest, marking, 0, 1.1, -0.4, 0.2, 0.4, 0.15);
  if (kind === 'boss') box(helmet, marking, 0, 0.35, 0, 0.1, 0.2, 0.28);
  const gearMaterial = 'resident-gear';
  if (!materials.has(gearMaterial)) materials.set(gearMaterial,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  for (const group of [helmet, vest, rifle]) {
    const geometries: THREE.BufferGeometry[] = [];
    for (const object of [...group.children]) {
      const mesh = object as THREE.Mesh;
      mesh.updateMatrix();
      const geometry = mesh.geometry.toNonIndexed();
      geometry.applyMatrix4(mesh.matrix);
      const color = (mesh.material as THREE.MeshStandardMaterial).color.toArray();
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set(color, i);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometries.push(geometry);
      mesh.geometry.dispose(); group.remove(mesh);
    }
    const mesh = new THREE.Mesh(mergeGeometries(geometries)!, materials.get(gearMaterial));
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
  root.scale.setScalar(kind === 'boss' ? 1.65 : kind === 'brute' ? 1.25 : kind === 'runner' ? 0.88 : 1);
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(source.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  actions.get('idle')!.play();
  root.userData.kind = kind;
  root.userData.resident = { mixer, actions, state: 'idle', time: undefined };
  return root;
}

export function animateResident(model: THREE.Group, time: number, walking: boolean, attacking: boolean) {
  const animation = model.userData.resident;
  const state = attacking ? 'holding-right-shoot' : walking ? 'walk' : 'idle';
  if (state !== animation.state) {
    animation.actions.get(animation.state).fadeOut(0.12);
    animation.actions.get(state).reset().fadeIn(0.12).play();
    animation.state = state;
  }
  animation.mixer.update(animation.time === undefined ? 0 : Math.max(0, Math.min(0.1, time - animation.time)));
  animation.time = time;
}

