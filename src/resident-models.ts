import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export const MODEL_PATHS = [
  '/models/residents/character-male-d.glb', '/models/residents/character-male-a.glb',
  '/models/houses/building-type-b.glb', '/models/houses/building-type-e.glb', '/models/houses/building-type-k.glb',
] as const;
export type NeighborhoodModels = { residents: GLTF[]; houses: GLTF[] };

export async function loadNeighborhoodModels(): Promise<NeighborhoodModels> {
  const loader = new GLTFLoader();
  const models: GLTF[] = [];
  try {
    for (const path of MODEL_PATHS) models.push(await loader.loadAsync(path));
    return { residents: models.slice(0, 2), houses: models.slice(2) };
  } catch (error) {
    disposeNeighborhoodModels({ residents: models, houses: [] });
    throw error;
  }
}

export function disposeNeighborhoodModels(models: NeighborhoodModels) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  for (const source of [...models.residents, ...models.houses]) source.scene.traverse(object => {
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

export function createResident(source: GLTF, kind: 'hero' | 'grunt', materials: Map<string, THREE.MeshStandardMaterial>) {
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
  if (kind === 'hero') {
    const broom = new THREE.Group(); broom.name = 'broom';
    const arm = model.getObjectByName('arm-right')!;
    broom.position.set(0, -0.1, 0.035); broom.scale.setScalar(1 / scale); arm.add(broom);
    box(broom, '#93674e', 0, -0.15, 0.1, 0.07, 1.65, 0.07).rotation.x = -0.15;
    box(broom, '#e9b863', 0, -1.05, 0.25, 0.55, 0.35, 0.18);
    box(broom, '#b96458', 0, -0.87, 0.25, 0.58, 0.09, 0.2);
  } else {
    const sack = new THREE.Group(); sack.name = 'sack'; root.add(sack);
    if (!materials.has('#e9b863')) materials.set('#e9b863', new THREE.MeshStandardMaterial({ color: '#e9b863', roughness: 0.9 }));
    const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 1), materials.get('#e9b863'));
    bag.position.set(0, 1.5, -0.48); bag.scale.set(0.8, 1.2, 0.7); bag.castShadow = true; sack.add(bag);
  }
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(source.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  actions.get('idle')!.play();
  root.userData.kind = kind;
  root.userData.resident = { mixer, actions, state: 'idle', time: undefined };
  return root;
}

export function animateResident(model: THREE.Group, time: number, walking: boolean, attacking: boolean) {
  const animation = model.userData.resident;
  const state = attacking ? 'attack-melee-right' : walking ? 'walk' : 'idle';
  if (state !== animation.state) {
    animation.actions.get(animation.state).fadeOut(0.12);
    animation.actions.get(state).reset().fadeIn(0.12).play();
    animation.state = state;
  }
  animation.mixer.update(animation.time === undefined ? 0 : Math.max(0, Math.min(0.1, time - animation.time)));
  animation.time = time;
}

export function createHouseModel(source: GLTF, width: number) {
  const model = source.scene.clone(true);
  const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
  const scale = width / (bounds.max.x - bounds.min.x);
  model.scale.multiplyScalar(scale); model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = object.receiveShadow = true; object.userData.sharedAsset = true;
  });
  return model;
}
