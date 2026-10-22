import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createCharacter, animateCharacter, createDefense, projectilePosition } from "./world-models";
import { BattleParticles } from "./world-particles";
import { PADS, TOWERS, type GameState } from "./game";
import { CameraControls } from "./camera-controls";
import { ROAD_POINTS, ROAD_LENGTH, ROAD_HALF_WIDTH, roadPoint, nearestRoadDistance, HOME } from "./battlefield";
export class World {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
  root = new THREE.Group();
  hero = new THREE.Group();
  enemies = new Map<number, THREE.Group>();
  towers = new Map<number, { level: number; group: THREE.Group }>();
  shots = new Map<number, THREE.Group>();
  pads: THREE.Mesh[] = [];
  ring: THREE.Mesh;
  resizeObserver: ResizeObserver;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private composer: EffectComposer;
  private environment: THREE.WebGLRenderTarget;
  private particles = new BattleParticles();
  private effects: { group: THREE.Group; age: number; life: number; frost: boolean }[] = [];
  private lastTime = 0;
  private lastHp = 100;
  private lastWave = 0;
  private heroPosition = new THREE.Vector2();
  private controls: CameraControls;
  private shake = 0;
  constructor(
    public host: HTMLElement,
    public onPad: (pad: number) => void,
    onZoom?: (zoom: number) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, host.clientWidth < 700 ? 1.25 : 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#c4eafa", 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D 전장. 금색 원을 눌러 건물을 건설하세요.",
    );
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.root);
    this.scene.background = new THREE.Color('#c4eafa');
    this.scene.add(new THREE.HemisphereLight("#fff9e9", "#82b29a", 1.1));
    const sun = new THREE.DirectionalLight("#fff0db", 1.6);
    sun.position.set(-25, 45, 25);
    sun.castShadow = true;
    const shadowSize = host.clientWidth < 700 ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
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
    this.scene.environmentIntensity = 0.45;
    room.dispose();
    pmrem.dispose();
    this.terrain();
    this.details();
    this.batchTerrain();
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
    (aura.material as THREE.MeshStandardMaterial).transparent = true;
    (aura.material as THREE.MeshStandardMaterial).opacity = 0.2;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.45, 1.3));
    this.composer.addPass(new OutputPass());
    this.controls = new CameraControls(this.camera, this.renderer.domElement, this.pick, onZoom);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
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
        const smoke = this.glow(new THREE.BoxGeometry(0.15, 0.08, 0.25), ['#ff99bb', '#86dfea', '#fff296'][i % 3], group,
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
      this.cylinder(this.root, '#69b779', x, 0.14, z, 0.5, 0.65, 0.25, 8);
      this.mesh(new THREE.SphereGeometry(0.14, 6, 4), ['#fff3a6', '#ff9bc4', '#ffffff'][i % 3], this.root, x, 0.35, z);
    }
    for (let i = 0; i < 12; i++) {
      const x = i % 2 ? 22.5 : -22.5, z = -29 + Math.floor(i / 2) * 11;
      this.cylinder(this.root, '#b58b64', x, 0.9, z, 0.16, 0.24, 1.8);
      this.mesh(new THREE.SphereGeometry(1.2, 10, 8), i % 3 ? '#70c48d' : '#ffb8bc', this.root, x, 2.3, z);
    }
  }
  private batchTerrain() {
    this.root.updateMatrixWorld(true);
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    this.root.traverse(obj => {
      if (!(obj instanceof THREE.Mesh) || !(obj.material instanceof THREE.MeshStandardMaterial) ||
        this.pads.includes(obj)) return;
      const list = batches.get(obj.material) ?? [];
      list.push(obj);
      batches.set(obj.material, list);
    });
    for (const [material, meshes] of batches) {
      const geometries = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
      const geometry = mergeGeometries(geometries);
      geometries.forEach(geo => geo.dispose());
      if (!geometry) continue;
      const batch = new THREE.Mesh(geometry, material);
      batch.castShadow = true; batch.receiveShadow = true;
      for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      this.root.add(batch);
    }
  }
  terrain() {
    this.box(this.root, '#c4a682', 0, -0.65, 0, 48, 1.2, 68);
    this.box(this.root, '#a8d898', 0, -0.06, 0, 48, 0.25, 68);
    // Rendering and movement share the road samples.
    for (const [width, y, color] of [[ROAD_HALF_WIDTH + 0.25, 0.09, '#fff0d1'], [ROAD_HALF_WIDTH, 0.12, '#b3bdce']] as const) {
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
      this.cylinder(this.root, '#6caca2', p.x, 0.16, p.z, 1.42, 1.55, 0.22, 32);
      const ring = this.mesh(new THREE.RingGeometry(1.08, 1.28, 40), '#fff3ac', this.root, p.x, 0.29, p.z);
      ring.rotation.x = -Math.PI / 2; this.pads.push(ring);
      this.box(this.root, '#fff8dc', p.x, 0.29, p.z, 0.65, 0.03, 0.12);
      this.box(this.root, '#fff8dc', p.x, 0.29, p.z, 0.12, 0.03, 0.65);
    });
    const house = new THREE.Group(); house.position.set(HOME.x, 0, HOME.z); this.root.add(house);
    this.box(house, '#ffeed7', 0, 2.2, 0, 6.4, 4.4, 5);
    this.box(house, '#ffd3b6', 0, 0.4, 0, 6.7, 0.7, 5.3);
    this.cylinder(house, '#f08e98', 0, 5.1, 0, 0, 5, 2.4, 4).rotation.y = Math.PI / 4;
    this.box(house, '#77c5c4', 0, 1.3, -2.54, 1.3, 2.6, 0.12);
    this.mesh(new THREE.SphereGeometry(0.08, 8, 6), '#ffe38c', house, 0.4, 1.2, -2.64);
    for (const x of [-2, 2]) {
      this.box(house, '#ffffff', x, 2.3, -2.55, 1.45, 1.65, 0.12);
      this.box(house, '#87d8ec', x, 2.3, -2.63, 1.15, 1.35, 0.06);
      this.box(house, '#ffffff', x, 2.3, -2.68, 0.07, 1.4, 0.04);
    }
    this.box(house, '#fff5db', 0, 0.15, -3.2, 2.5, 0.3, 1.4);
    this.box(house, '#ec9fb1', 0, 3.05, -3, 2.1, 0.18, 1.1).rotation.x = 0.12;
    this.box(house, '#c79762', 4.1, 0.45, -2, 1, 0.9, 0.85);
    this.box(house, '#fff2c5', 4.1, 0.92, -2, 0.16, 0.04, 0.86);
    this.cylinder(house, '#dfaf84', -4.1, 0.7, -2, 0.08, 0.08, 1.4);
    this.box(house, '#ef96aa', -4.1, 1.5, -2, 0.8, 0.6, 0.7);
    for (let i = 0; i < 9; i++) this.box(house, '#fff9e9', -5 + i * 1.25, 0.65, 3.15, 0.16, 1.3, 0.12);
    this.box(house, '#fff9e9', 0, 0.8, 3.15, 10, 0.12, 0.12);
    for (let i = 0; i < 6; i++) {
      const x = i % 2 ? 30 : -30, z = -24 + Math.floor(i / 2) * 23;
      this.box(this.root, ['#ffcaaf', '#c7c4ef', '#f8e4ac'][i % 3], x, 2, z, 6, 4, 6);
      this.cylinder(this.root, '#88b9c1', x, 4.8, z, 0, 4.8, 2, 4).rotation.y = Math.PI / 4;
    }
  }
  tower(kind: keyof typeof TOWERS, level: number) { return createDefense(kind, level, this.materials); }
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
    this.controls.resize(width, height);
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.particles.material.uniforms.pixelRatio.value = this.renderer.getPixelRatio();
  }
  private remove(g: THREE.Group) {
    g.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
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
    if (target) this.hero.rotation.y = Math.atan2(target.x - s.hero.x, target.z - s.hero.z);
    else if (moving && dt > 0) this.hero.rotation.y = Math.atan2(s.hero.x - this.heroPosition.x, s.hero.z - this.heroPosition.y);
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
        group = createCharacter(e.kind === 'grunt' && e.id % 3 === 0 ? 'spam' : e.kind, this.materials);
        this.enemies.set(e.id, group);
        this.root.add(group);
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
      if (!old || old.level !== tower.level) {
        if (old) this.remove(old.group);
        const group = this.tower(tower.kind, tower.level);
        group.position.set(pad.x, 0.15, pad.z);
        this.root.add(group);
        this.towers.set(tower.pad, { level: tower.level, group });
        if (!reset) this.particles.emit(pad.x, 0.5, pad.z, '#ffd28c', 24, 2);
      }
      const group = this.towers.get(tower.pad)!.group;
      const blades = group.getObjectByName('blades');
      if (blades) blades.rotation.z = s.time * 12;
      const turret = group.getObjectByName('turret');
      const enemy = s.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - pad.x, e.z - pad.z) <= TOWERS[tower.kind].range + (tower.level - 1) * 0.3)
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
          this.impact(shot.x, shot.z, true, true);
        } else {
          const color = shot.kind === 'frost' ? '#78deff' : shot.kind === 'cannon' ? '#ff9b42' : '#ffe4a1';
          if (shot.kind === 'cannon') {
            this.box(group, '#d5a16a', 0, 0, 0, 0.35, 0.3, 0.35);
            this.box(group, '#fff0b8', 0, 0.16, 0, 0.09, 0.02, 0.36);
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
    this.composer.render();
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.setAnimationLoop(null);
    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj instanceof THREE.SkinnedMesh) obj.skeleton.dispose();
        if (obj.userData.effectMaterial) (obj.material as THREE.Material).dispose();
      }
    });
    this.materials.forEach(material => material.dispose());
    this.particles.dispose();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
