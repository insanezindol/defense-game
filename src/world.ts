import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createCharacter, animateCharacter, createDefense, projectilePosition } from "./world-models";
import { createNeighborhood } from "./neighborhood";
import { loadNeighborhoodModels, createResident, disposeNeighborhoodModels, type NeighborhoodModels } from './resident-models';
import { BattleParticles } from "./world-particles";
import { PADS, TOWERS, towerStats, type TowerBranch, type GameState } from "./game";
import { CameraControls } from "./camera-controls";
import { ROAD_POINTS, ROAD_LENGTH, ROAD_HALF_WIDTH, roadPoint, nearestRoadDistance, HOME } from "./battlefield";
export class World {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
  root = new THREE.Group();
  hero = new THREE.Group();
  enemies = new Map<number, THREE.Group>();
  towers = new Map<number, { level: number; branch?: TowerBranch; group: THREE.Group }>();
  shots = new Map<number, THREE.Group>();
  pads: THREE.Mesh[] = [];
  ring: THREE.Mesh;
  resizeObserver: ResizeObserver;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private composer: EffectComposer;
  private ambientOcclusion: SSAOPass;
  private bloom: UnrealBloomPass;
  private environment: THREE.WebGLRenderTarget;
  private particles = new BattleParticles();
  private effects: { group: THREE.Group; age: number; life: number; frost: boolean }[] = [];
  private lastTime = 0;
  private lastHp = 100;
  private lastWave = 0;
  private heroPosition = new THREE.Vector2();
  private controls: CameraControls;
  private shake = 0;
  private neighborhood = new THREE.Group();
  private models?: NeighborhoodModels;
  private disposed = false;
  private lastShadowTime = -Infinity;
  constructor(
    public host: HTMLElement,
    public onPad: (pad: number) => void,
    onZoom?: (zoom: number) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#aebdc2", 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D 전장. 금색 원을 눌러 건물을 건설하세요.",
    );
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.root);
    this.scene.background = new THREE.Color('#aebdc2');
    this.scene.add(new THREE.HemisphereLight("#dbe9fa", "#6c7150", 0.75));
    const sun = new THREE.DirectionalLight("#ffe6bd", 2.6);
    sun.position.set(-30, 48, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -40,
      right: 40,
      top: 48,
      bottom: -48,
      near: 1,
      far: 110,
    });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight("#a8ddff", 0.7);
    rim.position.set(12, 8, -14);
    this.scene.add(rim);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.28;
    room.dispose();
    pmrem.dispose();
    this.terrain();
    this.details();
    this.neighborhood.removeFromParent();
    this.batchTerrain();
    this.batchTerrain(this.neighborhood);
    this.root.add(this.neighborhood);
    this.sign('ARMORY', 8, 3.35, 29.82, '#304b52');
    this.sign('LOGISTICS', 18, 3.35, 29.82, '#304b52');
    this.sign('HQ', HOME.x, 2.1, HOME.z + 2.91, '#304b52', 1.4, 0.45);
    this.scene.add(this.particles.points);
    this.hero = createCharacter("hero", this.materials);
    this.root.add(this.hero);
    this.ring = this.mesh(
      new THREE.RingGeometry(0.65, 0.82, 40),
      "#f4df9b",
      this.root,
      0,
      0.06,
      2,
    );
    this.ring.rotation.x = -Math.PI / 2;
    const aura = this.mesh(
      new THREE.RingGeometry(7.7, 7.74, 80),
      "#e5dfb0",
      this.hero,
      0,
      -0.01,
      0,
    );
    aura.rotation.x = -Math.PI / 2;
    aura.name = 'attack-range';
    (aura.material as THREE.MeshStandardMaterial).transparent = true;
    (aura.material as THREE.MeshStandardMaterial).opacity = 0.2;
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples: Math.min(4, this.renderer.capabilities.maxSamples),
    });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ambientOcclusion = new SSAOPass(this.scene, this.camera, 1, 1, 8);
    this.ambientOcclusion.kernelRadius = 1.4;
    this.ambientOcclusion.minDistance = 0.001;
    this.ambientOcclusion.maxDistance = 0.04;
    this.composer.addPass(this.ambientOcclusion);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.4, 1.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.controls = new CameraControls(this.camera, this.renderer.domElement, this.pick, onZoom);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    void loadNeighborhoodModels().then(models => {
      if (this.disposed) { disposeNeighborhoodModels(models); return; }
      this.models = models;
      this.remove(this.neighborhood);
      this.neighborhood = createNeighborhood(this.materials, models.houses);
      this.batchTerrain(this.neighborhood);
      this.root.add(this.neighborhood);
      const hero = createResident(models.residents[0], 'hero', this.materials);
      hero.position.copy(this.hero.position); hero.quaternion.copy(this.hero.quaternion);
      hero.add(this.hero.getObjectByName('attack-range')!);
      this.remove(this.hero); this.hero = hero; this.root.add(hero);
      for (const [id, enemy] of this.enemies) {
        this.remove(enemy); this.enemies.delete(id);
      }
      this.renderer.shadowMap.needsUpdate = true;
    }).catch(error => { if (!this.disposed) console.warn('3D models unavailable; using local fallback geometry.', error); });
  }

  private material(color: string) {
    if (!this.materials.has(color))
      this.materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.78,
          metalness: 0.08,
        }),
      );
    return this.materials.get(color)!;
  }
  private sign(text: string, x: number, y: number, z: number, color: string, width = 5.4, height = 0.65) {
    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fff0d3'; context.font = 'bold 76px system-ui, sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 40);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
    this.materials.set(`sign-${text}`, material);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    sign.position.set(x, y, z); this.root.add(sign);
  }
  mesh(
    geo: THREE.BufferGeometry,
    color: string,
    parent: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const mesh = new THREE.Mesh(geo, this.material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  box(
    parent: THREE.Object3D,
    color: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), color, parent, x, y, z);
  }
  cylinder(
    parent: THREE.Object3D,
    color: string,
    x: number,
    y: number,
    z: number,
    rt: number,
    rb: number,
    h: number,
    n = 8,
  ) {
    return this.mesh(
      new THREE.CylinderGeometry(rt, rb, h, n),
      color,
      parent,
      x,
      y,
      z,
    );
  }
  private glow(geometry: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.4),
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.userData.effectMaterial = true;
    parent.add(mesh);
    return mesh;
  }
  private impact(x: number, z: number, frost: boolean, large: boolean) {
    if (this.effects.length >= 32) {
      this.remove(this.effects.shift()!.group);
    }
    const group = new THREE.Group();
    group.position.set(x, 0.2, z);
    group.userData.radius = frost && large ? 8.8 : large ? 2.8 : 1.2;
    this.root.add(group);
    const color = frost ? '#72dcff' : '#ffac53';
    const ring = this.glow(new THREE.TorusGeometry(1, 0.035, 5, 48), color, group);
    ring.rotation.x = Math.PI / 2;
    if (frost) {
      const inner = this.glow(new THREE.RingGeometry(0.83, 0.88, 48), '#c6f7ff', group, 0, 0.03, 0);
      inner.rotation.x = -Math.PI / 2;
      for (let i = 0; i < (large ? 16 : 6); i++) {
        const angle = i * Math.PI * 2 / (large ? 16 : 6);
        const spike = this.glow(new THREE.SphereGeometry(0.07 + (i % 3) * 0.04, 8, 6), color, group,
          Math.cos(angle) * 0.8, 0.1, Math.sin(angle) * 0.8);
        spike.rotation.z = Math.cos(angle) * -0.3;
      }
    } else if (large) {
      const fireball = this.glow(new THREE.IcosahedronGeometry(0.5, 1), '#ffcc66', group, 0, 0.35, 0);
      fireball.scale.y = 1.6;
      for (let i = 0; i < 5; i++) {
        const smoke = this.glow(new THREE.BoxGeometry(0.15, 0.08, 0.25), ['#da9d68', '#747e80', '#c4bc9b'][i % 3], group,
          Math.sin(i * 2.4) * 0.35, 0.5 + i * 0.17, Math.cos(i * 2.4) * 0.35);
        (smoke.material as THREE.MeshBasicMaterial).blending = THREE.NormalBlending;
      }
    }
    this.particles.emit(x, 0.8, z, color, large ? 65 : 10, large ? 5 : 1.8, frost && large ? 1.3 : 0.6);
    this.effects.push({ group, age: 0, life: frost && large ? 1.1 : large ? 0.6 : 0.3, frost });
    if (large) this.shake = frost ? 0.12 : 0.2;
  }
  private details() {
    for (let i = 0; i < 130; i++) {
      const x = Math.sin(i * 17.81) * 22, z = Math.cos(i * 9.17) * 32;
      const point = roadPoint(nearestRoadDistance({ x, z }));
      if (Math.hypot(point.x - x, point.z - z) < 3.7 || PADS.some(p => Math.hypot(p.x - x, p.z - z) < 2.2) || Math.hypot(x - HOME.x, z - HOME.z) < 6) continue;
      this.mesh(new THREE.IcosahedronGeometry(0.45, 0), '#68795e', this.root, x, 0.22, z).scale.y = 0.65;

    }
    this.neighborhood = createNeighborhood(this.materials);
    this.root.add(this.neighborhood);
  }

  private batchTerrain(parent = this.root) {
    parent.updateMatrixWorld(true);
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    parent.traverse(obj => {
      if (!(obj instanceof THREE.Mesh) || !(obj.material instanceof THREE.MeshStandardMaterial) ||
        this.pads.includes(obj) || obj.userData.sharedAsset) return;
      const list = batches.get(obj.material) ?? [];
      list.push(obj);
      batches.set(obj.material, list);
    });
    for (const [material, meshes] of batches) {
      const geometries = meshes.map(mesh => {
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return geometry.applyMatrix4(mesh.matrixWorld);
      });
      const geometry = mergeGeometries(geometries);
      geometries.forEach(geo => geo.dispose());
      if (!geometry) continue;
      const batch = new THREE.Mesh(geometry, material);
      batch.castShadow = true; batch.receiveShadow = true;
      for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      parent.add(batch);
    }
  }
  terrain() {
    this.box(this.root, '#93674e', 0, -0.65, 0, 80, 1.2, 84);
    this.box(this.root, '#78856c', 0, -0.06, 0, 80, 0.25, 84);
    for (const side of [-1, 1]) {
      this.box(this.root, '#b9b5a0', side * 24.3, 0.08, 0, 6.6, 0.16, 68);
      for (let z = -33; z < 34; z += 2) this.box(this.root, '#9a9b8a', side * 24.3, 0.165, z, 6.6, 0.012, 0.025);
    }
    this.box(this.root, '#b9b5a0', 0, 0.08, -26, 46, 0.16, 2.2);
    // Rendering and movement share the road samples.
    for (const [width, y, color] of [[ROAD_HALF_WIDTH + 0.4, 0.09, '#d1c9b4'], [ROAD_HALF_WIDTH, 0.12, '#65757b']] as const) {
      const positions: number[] = [], indices: number[] = [];
      ROAD_POINTS.forEach((p, i) => {
        const before = ROAD_POINTS[Math.max(0, i - 1)], after = ROAD_POINTS[Math.min(ROAD_POINTS.length - 1, i + 1)];
        const length = Math.hypot(after.x - before.x, after.z - before.z);
        const nx = -(after.z - before.z) / length * width, nz = (after.x - before.x) / length * width;
        positions.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz);
        if (i) { const n = i * 2; indices.push(n - 2, n, n - 1, n - 1, n, n + 1); }
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
      this.mesh(geometry, color, this.root);
    }
    for (let d = 1; d < ROAD_LENGTH - 2; d += 3) {
      const p = roadPoint(d);
      this.box(this.root, '#fff5dc', p.x, 0.135, p.z, 0.12, 0.02, 1).rotation.y = Math.atan2(p.dx, p.dz);
    }
    PADS.forEach(p => {
      this.cylinder(this.root, '#627e70', p.x, 0.16, p.z, 1.42, 1.55, 0.22, 32);
      const ring = this.mesh(new THREE.RingGeometry(1.08, 1.28, 40), '#fff3ac', this.root, p.x, 0.29, p.z);
      ring.rotation.x = -Math.PI / 2; this.pads.push(ring);
      this.box(this.root, '#fff8dc', p.x, 0.29, p.z, 0.65, 0.03, 0.12);
      this.box(this.root, '#fff8dc', p.x, 0.29, p.z, 0.12, 0.03, 0.65);
    });
    for (let d = 0; d < ROAD_LENGTH; d += 1.1) {
      const p = roadPoint(d);
      for (const side of [-1, 1]) {
        this.box(this.root, '#d1c9b4', p.x - p.dz * side * (ROAD_HALF_WIDTH + 0.18), 0.16,
          p.z + p.dx * side * (ROAD_HALF_WIDTH + 0.18), 0.28, 0.16, 0.95).rotation.y = Math.atan2(p.dx, p.dz);
      }
    }
  }

  tower(kind: keyof typeof TOWERS, level: number, branch?: TowerBranch) { return createDefense(kind, level, this.materials, branch); }
  setZoom(value: number) { this.controls.setZoom(value); }
  resetView() { this.controls.reset(); }
  screenInput(x: number, z: number) { const v = this.controls.screenInput(x, z); return { x: v.x, z: v.y }; }
  private pick = (clientX: number, clientY: number) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      (-(clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);
    const point = new THREE.Vector3();
    if (
      ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2),
        point,
      )
    ) {
      const index = PADS.findIndex(
        (p) => Math.hypot(p.x - point.x, p.z - point.z) < 1.6,
      );
      if (index >= 0) this.onPad(index);
    }
  };
  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const pixelRatio = Math.min(devicePixelRatio, 3, Math.sqrt(3_000_000 / (width * height)));
    this.controls.resize(width, height);
    for (const material of [this.ambientOcclusion.ssaoMaterial, this.ambientOcclusion.depthRenderMaterial]) {
      material.uniforms.cameraNear.value = this.camera.near;
      material.uniforms.cameraFar.value = this.camera.far;
    }
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.ambientOcclusion.enabled = width >= 700;
    this.bloom.enabled = width >= 700;
    this.particles.material.uniforms.pixelRatio.value = this.renderer.getPixelRatio();
  }
  private remove(g: THREE.Group) {
    this.renderer.shadowMap.needsUpdate = true;
    if (g.userData.resident) {
      const mixer = g.userData.resident.mixer as THREE.AnimationMixer;
      mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot());
    }
    g.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (!obj.userData.sharedAsset) obj.geometry.dispose();
        if (obj instanceof THREE.SkinnedMesh) obj.skeleton.dispose();
        if (obj.userData.effectMaterial) (obj.material as THREE.Material).dispose();
      }
    });
    this.root.remove(g);
  }
  draw(s: GameState, selected: number | null) {
    const reset = s.time < this.lastTime || (s.wave === 0 && this.lastWave > 0);
    const dt = reset ? 0 : Math.min(0.1, Math.max(0, s.time - this.lastTime));
    this.lastTime = s.time;
    this.lastWave = s.wave;
    if (reset) {
      for (const effect of this.effects) this.remove(effect.group);
      this.effects = [];
      this.particles.update(10);
      this.shake = 0;
    }
    const moving = dt === 0 ? Boolean(this.hero.userData.walking) : Math.hypot(s.hero.x - this.heroPosition.x, s.hero.z - this.heroPosition.y) > 0.001;
    this.hero.userData.walking = moving;
    const target = s.enemies.filter(e => Math.hypot(e.x - s.hero.x, e.z - s.hero.z) < 7.8)
      .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))[0];
    if (moving && dt > 0) this.hero.rotation.y = Math.atan2(s.hero.x - this.heroPosition.x, s.hero.z - this.heroPosition.y);
    else if (!moving && target) this.hero.rotation.y = Math.atan2(target.x - s.hero.x, target.z - s.hero.z);
    this.heroPosition.set(s.hero.x, s.hero.z);
    this.hero.position.set(s.hero.x, 0.12, s.hero.z);
    this.ring.position.set(s.hero.x, 0.15, s.hero.z);
    animateCharacter(this.hero, s.time, moving, Boolean(target && s.hero.cooldown > 0.28));
    this.hero.getObjectByName('health')!.quaternion.copy(this.hero.quaternion.clone().invert().multiply(this.camera.quaternion));
    for (const [id, group] of this.enemies) {
      if (!s.enemies.some(e => e.id === id)) {
        if (!reset) this.particles.emit(group.position.x, 0.8, group.position.z, '#e8a666', 18, 2.4);
        this.remove(group);
        this.enemies.delete(id);
      }
    }
    for (const e of s.enemies) {
      let group = this.enemies.get(e.id);
      if (!group) {
        group = this.models ? createResident(this.models.residents[1], e.kind, this.materials) :
          createCharacter(e.kind, this.materials);
        this.enemies.set(e.id, group);
        this.root.add(group);
        this.renderer.shadowMap.needsUpdate = true;
      }
      if (group.userData.hp !== undefined && e.hp < group.userData.hp) {
        this.particles.emit(e.x, 1, e.z, e.slow > 0 ? '#70dfff' : '#ffcc7d', 7, 1.6, 0.4);
      }
      if (!group.userData.positioned) group.rotation.y = Math.atan2(roadPoint(e.progress ?? 0).dx, roadPoint(e.progress ?? 0).dz);
      else if (Math.hypot(e.x - group.position.x, e.z - group.position.z) > 1e-6) {
        group.rotation.y = Math.atan2(e.x - group.position.x, e.z - group.position.z);
      }
      group.userData.positioned = true;
      group.userData.hp = e.hp;
      group.position.set(e.x, 0.12, e.z);
      animateCharacter(group, s.time * e.speed * (e.slow > 0 ? 0.45 : 1) + e.id, true, (e.progress ?? 0) > ROAD_LENGTH - 3);
      group.getObjectByName('health')!.quaternion.copy(group.quaternion.clone().invert().multiply(this.camera.quaternion));
      const hp = group.getObjectByName('hp')!;
      hp.scale.x = Math.max(0, e.hp / e.maxHp);
      hp.position.x = -(1 - hp.scale.x) * 0.44;
    }
    for (const [pad, item] of this.towers) {
      if (!s.towers.some(t => t.pad === pad)) {
        this.remove(item.group);
        this.towers.delete(pad);
      }
    }
    for (const tower of s.towers) {
      const old = this.towers.get(tower.pad), pad = PADS[tower.pad];
      if (!old || old.level !== tower.level || old.branch !== tower.branch) {
        if (old) this.remove(old.group);
        const group = this.tower(tower.kind, tower.level, tower.branch);
        group.position.set(pad.x, 0.15, pad.z);
        this.root.add(group);
        this.towers.set(tower.pad, { level: tower.level, branch: tower.branch, group });
        this.renderer.shadowMap.needsUpdate = true;
        if (!reset) this.particles.emit(pad.x, 0.5, pad.z, '#ffd28c', 24, 2);
      }
      const group = this.towers.get(tower.pad)!.group;
      const barrels = group.getObjectByName('barrels');
      if (barrels) barrels.rotation.z = s.time * 12;
      const turret = group.getObjectByName('turret');
      const enemy = s.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - pad.x, e.z - pad.z) <= towerStats(s, tower).range)
        .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))[0];
      if (turret && enemy) turret.rotation.y = Math.atan2(enemy.x - pad.x, enemy.z - pad.z);
    }
    this.pads.forEach((pad, i) => {
      pad.scale.setScalar(selected === i ? 1.12 + Math.sin(s.time * 4) * 0.06 : 1);
      pad.visible = !s.towers.some(t => t.pad === i) || selected === i;
    });
    for (const [id, group] of this.shots) {
      if (!s.shots.some(p => p.id === id)) {
        if (!reset && !group.userData.burst) {
          const end = group.userData.end as THREE.Vector3;
          this.impact(end.x, end.z, group.userData.kind === 'frost', group.userData.kind === 'cannon');
        }
        this.remove(group);
        this.shots.delete(id);
      }
    }
    for (const shot of s.shots) {
      let group = this.shots.get(shot.id);
      if (!group) {
        group = new THREE.Group();
        this.root.add(group);
        this.shots.set(shot.id, group);
        group.userData.kind = shot.kind;
        // Skill origin and target coincide; unlike remaining life this survives a slow frame.
        group.userData.burst = shot.kind === 'frost' && shot.x === shot.tx && shot.z === shot.tz;
        if (group.userData.burst) {
          this.impact(shot.x, shot.z, true, false);
        } else {
          const color = shot.kind === 'frost' ? '#78deff' : shot.kind === 'cannon' ? '#ff9b42' : '#ffe4a1';
          if (shot.kind === 'cannon') {
            this.mesh(new THREE.SphereGeometry(0.16, 8, 6), '#34494f', group).scale.z = 1.6;
          } else if (shot.kind === 'arrow') {
            this.box(group, '#ffe06a', 0, 0, 0, 0.12, 0.12, 0.4);
          } else this.glow(new THREE.SphereGeometry(0.12, 8, 6), color, group);
          for (let i = 0; i < 5; i++) {
            const trail = this.glow(new THREE.SphereGeometry(0.075 * (1 - i / 7), 6, 4), color, group);
            trail.name = `trail-${i}`;
          }
          group.userData.start = new THREE.Vector3(shot.x, shot.kind === 'frost' ? 1.7 : 1.3, shot.z);
          group.userData.end = new THREE.Vector3(shot.tx, 0.85, shot.tz);
          this.particles.emit(shot.x, shot.kind === 'frost' ? 1.7 : 1.3, shot.z, color, 4, 0.8, 0.25);
        }
      }
      if (!group.userData.burst) {
        const t = 1 - shot.life / 0.25;
        const start = group.userData.start as THREE.Vector3, end = group.userData.end as THREE.Vector3;
        const point = projectilePosition(start, end, t, shot.kind === 'cannon');
        group.position.copy(point);
        group.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
        for (let i = 0; i < 5; i++) group.getObjectByName(`trail-${i}`)!.position.copy(
          projectilePosition(start, end, t - (i + 1) * 0.035, shot.kind === 'cannon').sub(point));
      }
    }
    for (const effect of this.effects) {
      effect.age += dt;
      const t = Math.min(1, effect.age / effect.life);
      effect.group.scale.setScalar(0.2 + t * effect.group.userData.radius);
      effect.group.rotation.y += dt * 0.7;
      effect.group.traverse(obj => {
        if (obj instanceof THREE.Mesh) (obj.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8;
      });
    }
    this.effects = this.effects.filter(effect => {
      if (effect.age < effect.life) return true;
      this.remove(effect.group);
      return false;
    });
    this.particles.update(dt);
    if (!reset && s.hp < this.lastHp) { this.shake = 0.28; this.impact(HOME.x, HOME.z - 4, false, true); }
    this.lastHp = s.hp;
    this.shake = Math.max(0, this.shake - dt);
    this.controls.apply();
    if (this.shake > 0) this.camera.position.x += Math.sin(s.time * 70) * this.shake * 0.5;
    // SSAOPass refreshes projection only on resize; gestures also change it.
    this.ambientOcclusion.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    this.ambientOcclusion.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    // Reuse static shadows; refresh moving actors at 30Hz, once across all composer passes.
    if (s.time < this.lastShadowTime || s.time - this.lastShadowTime + 1e-6 >= 1 / 30) {
      this.renderer.shadowMap.needsUpdate = true;
      this.lastShadowTime = s.time;
    }
    this.composer.render();
  }
  dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.setAnimationLoop(null);
    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        if (!obj.userData.sharedAsset) obj.geometry.dispose();
        if (obj instanceof THREE.SkinnedMesh) obj.skeleton.dispose();
        if (obj.userData.effectMaterial) (obj.material as THREE.Material).dispose();
      }
    });
    this.materials.forEach(material => { material.map?.dispose(); material.dispose(); });
    if (this.models) disposeNeighborhoodModels(this.models);
    this.particles.dispose();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
