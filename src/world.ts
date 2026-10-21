import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createCharacter, animateCharacter, fitCamera, projectilePosition } from "./world-models";
import { BattleParticles } from "./world-particles";
import { PADS, TOWERS, type GameState } from "./game";
const COLORS = {
  grass: "#304f45",
  stone: "#d6c6a1",
  path: "#766d62",
  blue: "#417a92",
  dark: "#344838",
};
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
  private torches: THREE.PointLight[] = [];
  private banners: THREE.Mesh[] = [];
  private lastTime = 0;
  private lastHp = 100;
  private lastWave = 0;
  private heroPosition = new THREE.Vector2();
  private cameraPosition = new THREE.Vector3();
  private pointerStart = new THREE.Vector2();
  private shake = 0;
  constructor(
    public host: HTMLElement,
    public onPad: (pad: number) => void,
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
    this.renderer.setClearColor("#132a37", 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D 전장. 금색 원을 눌러 건물을 건설하세요.",
    );
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.root);
    this.scene.fog = new THREE.FogExp2("#132a37", 0.008);
    this.scene.background = new THREE.Color('#08151f');
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 direction; void main(){ direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 direction;
        void main(){ float h = normalize(direction).y;
          vec3 horizon = vec3(0.045, 0.105, 0.135);
          vec3 zenith = vec3(0.006, 0.015, 0.035);
          gl_FragColor = vec4(mix(horizon, zenith, smoothstep(0.0, 0.75, h)), 1.0); }`,
    }));
    sky.userData.effectMaterial = true;
    this.scene.add(sky);
    this.scene.add(new THREE.HemisphereLight("#b2d8f6", "#273b38", 0.85));
    const sun = new THREE.DirectionalLight("#ffdbad", 2.1);
    sun.position.set(-15, 24, 8);
    sun.castShadow = true;
    const shadowSize = host.clientWidth < 700 ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, {
      left: -22,
      right: 22,
      top: 22,
      bottom: -22,
      near: 1,
      far: 65,
    });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight("#66baff", 1.6);
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
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 1.15));
    this.composer.addPass(new OutputPass());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    host.addEventListener("pointerdown", this.pointerDown);
    host.addEventListener("pointerup", this.pick);
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
  tree(x: number, z: number, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    this.root.add(g);
    this.cylinder(g, "#7e6e4d", 0, 0.6, 0, 0.16, 0.22, 1.2, 5);
    this.cylinder(g, "#193e3c", 0, 1.35, 0, 0.15, 1.1, 1.8, 9);
    this.cylinder(g, "#28574b", 0, 2.05, 0, 0.08, 0.9, 1.7, 9);
    this.cylinder(g, "#39765d", 0, 2.75, 0, 0, 0.62, 1.5, 9);
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
        const spike = this.glow(new THREE.ConeGeometry(0.045, 0.3 + (i % 3) * 0.13, 5), color, group,
          Math.cos(angle) * 0.8, 0.1, Math.sin(angle) * 0.8);
        spike.rotation.z = Math.cos(angle) * -0.3;
      }
    } else if (large) {
      const fireball = this.glow(new THREE.IcosahedronGeometry(0.5, 1), '#ffcc66', group, 0, 0.35, 0);
      fireball.scale.y = 1.6;
      for (let i = 0; i < 5; i++) {
        const smoke = this.glow(new THREE.IcosahedronGeometry(0.25, 1), '#746d72', group,
          Math.sin(i * 2.4) * 0.35, 0.5 + i * 0.17, Math.cos(i * 2.4) * 0.35);
        (smoke.material as THREE.MeshBasicMaterial).blending = THREE.NormalBlending;
      }
    }
    this.particles.emit(x, 0.8, z, color, large ? 65 : 10, large ? 5 : 1.8, frost && large ? 1.3 : 0.6);
    this.effects.push({ group, age: 0, life: frost && large ? 1.1 : large ? 0.6 : 0.3, frost });
    if (large) this.shake = frost ? 0.12 : 0.2;
  }
  private details() {
    // Stable placement keeps the landscape identical after loading a saved game.
    const random = (n: number) => THREE.MathUtils.euclideanModulo(Math.sin(n * 127.1 + 31.7) * 43758.5453, 1);
    for (let z = -12; z < 8; z += 1.15) {
      for (let x = -2; x <= 2; x += 1) {
        const n = (z + 13) * 11 + x;
        const tile = this.box(this.root, ['#727b76', '#85887c', '#626f6c'][Math.floor(random(n) * 3)],
          x + (Math.floor(z) % 2) * 0.12, 0.13, z, 0.89, 0.12, 1.02);
        tile.rotation.y = (random(n + 1) - 0.5) * 0.1;
      }
    }
    for (let i = 0; i < 650; i++) {
      const x = random(i * 3) * 30 - 15, z = random(i * 3 + 1) * 26 - 13;
      if (Math.abs(x) < 3 || z > 7 || PADS.some(p => Math.hypot(p.x - x, p.z - z) < 1.65)) continue;
      const blade = this.mesh(new THREE.ConeGeometry(0.06, 0.18 + random(i + 7) * 0.24, 3),
        i % 2 ? '#4f7758' : '#688266', this.root, x, 0.17, z);
      blade.rotation.z = (random(i + 9) - 0.5) * 0.6;
      if (i % 17 === 0) this.mesh(new THREE.SphereGeometry(0.07, 5, 4), '#d6a772', this.root, x, 0.35, z);
    }
    for (let i = 0; i < 35; i++) {
      const side = i % 2 ? -1 : 1, z = -13 + (i / 35) * 27;
      const rock = this.mesh(new THREE.DodecahedronGeometry(0.6 + random(i) * 0.7, 1),
        i % 3 ? '#455659' : '#65706b', this.root, side * (15.2 + random(i + 10) * 0.7), -0.5, z);
      rock.scale.set(1, 0.8 + random(i + 4), 1.3);
      rock.rotation.set(random(i), random(i + 2) * 3, 0);
    }
    const ridge = new THREE.PlaneGeometry(110, 40, 55, 20);
    ridge.rotateX(-Math.PI / 2);
    const vertices = ridge.attributes.position;
    const ridgeColors = new Float32Array(vertices.count * 3);
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), z = vertices.getZ(i);
      const ridgeHeight = Math.max(0, 1 - Math.abs(z + 3) / 22);
      const height = ridgeHeight * (5 + Math.abs(Math.sin(x * 0.14)) * 10 + Math.sin(x * 0.41 + z * 0.3) * 2 + random(i) * 1.4);
      vertices.setY(i, height);
      const tint = new THREE.Color().lerpColors(new THREE.Color('#17323c'), new THREE.Color('#49646b'), height / 20);
      ridgeColors.set(tint.toArray(), i * 3);
    }
    ridge.setAttribute('color', new THREE.BufferAttribute(ridgeColors, 3));
    ridge.computeVertexNormals();
    const mountains = this.mesh(ridge, '#ffffff', this.root, 0, -4, -39);
    const ridgeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    this.materials.set('mountain-ridge', ridgeMaterial);
    mountains.material = ridgeMaterial;
    // Raised parapets, buttresses, stone courses and gold roof ridges.
    for (const x of [-11, -8, -5, 5, 8, 11]) {
      this.box(this.root, '#7b8681', x, 0.8, 8.43, 0.38, 1.8, 0.65);
      for (const y of [0.4, 0.9, 1.4]) this.box(this.root, '#8d9690', x, y, 8.51, 2.8, 0.035, 0.03);
    }
    for (const x of [-3.3, 3.3]) {
      this.cylinder(this.root, '#9aa49b', x, 0.25, 9.2, 1.2, 1.3, 0.35, 12);
      this.cylinder(this.root, '#b2b8a7', x, 3.25, 9.2, 1.12, 1.12, 0.2, 12);
      this.cylinder(this.root, '#c7a969', x, 4.7, 9.2, 0.035, 0.08, 0.7, 8);
    }
    for (const x of [-2, 2]) {
      this.cylinder(this.root, '#929c95', x, 3.6, 12, 0.68, 0.8, 4, 12);
      this.cylinder(this.root, '#234f63', x, 6.1, 12, 0, 1, 1.3, 12);
      this.cylinder(this.root, '#dbb775', x, 6.9, 12, 0.02, 0.05, 0.45, 8);
    }
    this.box(this.root, '#45555a', 0, 0.9, 13.56, 1, 1.8, 0.08);
    for (const x of [-0.62, 0.62]) this.box(this.root, '#abb19f', x, 0.9, 13.65, 0.22, 1.8, 0.28);
    this.box(this.root, '#abb19f', 0, 1.86, 13.65, 1.46, 0.22, 0.28);
    for (let i = 0; i < 3; i++) this.box(this.root, '#7e8a83', 0, 0.1 + i * 0.03, 14.2 - i * 0.23, 1.5 - i * 0.1, 0.17, 0.25);
    for (const x of [-5.5, 5.5, -11.7, 11.7]) {
      const z = Math.abs(x) > 10 ? 1 : 7.8;
      this.cylinder(this.root, '#45505a', x, 0.85, z, 0.09, 0.15, 1.7, 8);
      this.cylinder(this.root, '#9c7950', x, 1.75, z, 0.23, 0.12, 0.25, 8);
      const flame = this.glow(new THREE.SphereGeometry(0.15, 8, 6), '#ffad55', this.root, x, 2, z);
      flame.scale.y = 1.8;
      const light = new THREE.PointLight('#ffab5c', 8, 7, 2);
      light.position.set(x, 2, z);
      this.root.add(light);
      this.torches.push(light);
    }
    for (const x of [-8, 8]) {
      const banner = this.box(this.root, '#235c79', x + 0.5, 3.5, 8.1, 0.9, 1.2, 0.04);
      this.box(this.root, '#d9b76a', x + 0.5, 3.5, 8.06, 0.12, 0.6, 0.03);
      this.banners.push(banner);
    }
    for (const pad of PADS) {
      const ring = this.glow(new THREE.TorusGeometry(1.3, 0.025, 5, 40), '#d0ad65', this.root, pad.x, 0.23, pad.z);
      ring.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        this.box(this.root, '#9e967d', pad.x + Math.cos(a) * 1.5, 0.24, pad.z + Math.sin(a) * 1.5, 0.27, 0.28, 0.27);
      }
    }
  }
  private batchTerrain() {
    this.root.updateMatrixWorld(true);
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    this.root.traverse(obj => {
      if (!(obj instanceof THREE.Mesh) || !(obj.material instanceof THREE.MeshStandardMaterial) ||
        this.pads.includes(obj) || this.banners.includes(obj)) return;
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
    this.box(this.root, "#667755", 0, -0.65, 0, 32, 1.2, 29);
    this.box(this.root, COLORS.grass, 0, -0.08, 0, 32, 0.25, 29);
    this.box(this.root, "#b6a17c", 0, -1.4, 0, 30.6, 0.5, 27.6);
    this.box(this.root, COLORS.path, 0, 0.065, -1, 5.6, 0.08, 23);
    this.box(this.root, "#d3c299", 0, 0.07, 5.9, 23, 0.08, 4);
    for (let i = 0; i < 90; i++) {
      const x = Math.sin(i * 17.8) * 14.7,
        z = Math.cos(i * 9.18) * 12.8;
      if (Math.abs(x) < 3.4 || z > 7) continue;
      const color =
        i % 3 === 0 ? "#a8b67a" : i % 3 === 1 ? "#82965e" : "#99aa6f";
      this.cylinder(
        this.root,
        color,
        x,
        0.065,
        z,
        0.12 + (i % 4) * 0.1,
        0.16,
        0.04,
        5,
      );
    }
    for (let i = 0; i < 22; i++) {
      this.tree(-14 + (i % 2) * 1.2, -12 + i * 1.1, 0.75 + (i % 3) * 0.2);
      this.tree(14 - (i % 2) * 0.9, -12 + i * 1.1, 0.8 + (i % 4) * 0.15);
    }
    for (let i = 0; i < 8; i++) {
      this.tree(-12 + i * 3.4, -13, 0.7 + (i % 3) * 0.15);
    }
    for (let i = 0; i < 20; i++) {
      const x = Math.sin(i * 31) * 12,
        z = Math.cos(i * 6) * 10;
      if (Math.abs(x) > 8)
        this.mesh(
          new THREE.DodecahedronGeometry(0.3 + (i % 3) * 0.15, 0),
          "#a6ab8b",
          this.root,
          x,
          0.18,
          z,
        );
    }
    // The keep and its crenellated curtain wall.
    for (const x of [-11, -8, -5, 5, 8, 11]) {
      this.box(this.root, "#b6b49b", x, 0.95, 9.1, 2.9, 1.9, 1.15);
      for (const dx of [-0.9, 0, 0.9])
        this.box(this.root, "#d5cfb0", x + dx, 2.1, 9.1, 0.52, 0.5, 1.2);
    }
    for (const x of [-3.3, 3.3]) {
      this.cylinder(this.root, "#cac6a8", x, 1.7, 9.2, 1, 1.12, 3.4, 8);
      this.cylinder(this.root, "#517a7b", x, 3.9, 9.2, 0, 1.4, 1.5, 8);
      this.box(this.root, "#384d44", x, 1.9, 10.23, 0.33, 0.7, 0.05);
    }
    this.box(this.root, "#756447", 0, 1, 9.4, 4.4, 2, 0.65);
    for (let x = -1.8; x < 2; x += 0.5)
      this.box(this.root, "#a08a58", x, 1.1, 9, 0.14, 2, 0.1);
    this.box(this.root, "#c4bea0", 0, 1.7, 12, 5, 3.4, 3);
    this.cylinder(this.root, "#476c71", 0, 4.1, 12, 0, 3.9, 2, 4).rotation.y =
      Math.PI / 4;
    for (const x of [-1.3, 1.3])
      this.box(this.root, "#5b6a57", x, 2, 13.52, 0.5, 0.85, 0.05);
    for (const x of [-8, 8]) {
      this.cylinder(this.root, "#7a694b", x, 2.1, 8.2, 0.07, 0.07, 4.2, 6);
      this.box(this.root, "#d5b569", x + 0.5, 3.5, 8.2, 1, 0.95, 0.06);
      this.box(this.root, "#43656a", x + 0.5, 3.5, 8.15, 0.25, 0.65, 0.03);
    }
    PADS.forEach((p, i) => {
      this.cylinder(this.root, "#b9ae85", p.x, 0.09, p.z, 1.4, 1.5, 0.2, 12);
      const pad = this.mesh(
        new THREE.RingGeometry(1.12, 1.22, 40),
        "#f6dfa0",
        this.root,
        p.x,
        0.21,
        p.z,
      );
      pad.rotation.x = -Math.PI / 2;
      this.pads.push(pad);
      this.box(this.root, "#f6dfa0", p.x, 0.22, p.z, 0.65, 0.035, 0.13);
      this.box(this.root, "#f6dfa0", p.x, 0.22, p.z, 0.13, 0.035, 0.65);
      // Small foundation stones distinguish each build site from the path.
      if (i < 6)
        this.box(
          this.root,
          "#b6a37c",
          p.x > 0 ? 3.1 : -3.1,
          0.09,
          p.z,
          0.7,
          0.06,
          0.65,
        );
    });
  }
  tower(kind: keyof typeof TOWERS, level: number) {
    const g = new THREE.Group();
    this.cylinder(g, "#c9c4a5", 0, 0.6, 0, 0.8, 1.08, 1.2, 8);
    this.cylinder(g, "#dcd4b4", 0, 1.35, 0, 1, 0.85, 0.3, 8);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      this.box(g, '#a7aea1', Math.cos(angle) * 0.85, 1.56, Math.sin(angle) * 0.85, 0.25, 0.35, 0.25);
    }
    const turret = new THREE.Group();
    turret.name = 'turret';
    g.add(turret);
    if (kind === "arrow") {
      for (const x of [-0.55, 0.55])
        this.box(g, "#786c4b", x, 1.95, 0, 0.18, 1, 0.3);
      this.cylinder(g, "#5e7e67", 0, 2.55, 0, 0, 1.28, 1, 4).rotation.y =
        Math.PI / 4;
      this.box(turret, "#d0af66", 0, 1.95, -0.35, 1.3, 0.13, 0.25);
      this.box(turret, "#766448", 0, 1.95, -0.65, 0.13, 0.15, 1.1);
    } else if (kind === "cannon") {
      this.box(turret, "#6e6450", 0, 1.7, 0, 1.1, 0.5, 0.9);
      this.cylinder(turret, "#455957", 0, 1.95, -0.6, 0.4, 0.46, 1.4, 12).rotation.x =
        Math.PI / 2;
      this.cylinder(
        turret,
        "#263d37",
        0,
        1.95,
        -1.32,
        0.29,
        0.29,
        0.04,
        8,
      ).rotation.x = Math.PI / 2;
    } else {
      this.cylinder(g, "#6a8e8b", 0, 1.8, 0, 0.3, 0.5, 0.9, 6);
      this.glow(new THREE.OctahedronGeometry(0.65), "#7adeff", g, 0, 2.65, 0).name = 'crystal';
      const ring = this.mesh(
        new THREE.TorusGeometry(0.75, 0.06, 5, 20),
        "#e3d28e",
        g,
        0,
        2.4,
        0,
      );
      ring.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < level; i++)
      this.box(g, "#f1d58d", -0.5 + i * 0.25, 0.9, 1, 0.12, 0.18, 0.07);
    return g;
  }
  private pointerDown = (event: PointerEvent) => { this.pointerStart.set(event.clientX, event.clientY); };
  pick = (event: PointerEvent) => {
    if (event.button !== 0 || this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 12) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
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
    fitCamera(this.camera, width / height);
    this.cameraPosition.copy(this.camera.position);
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
      .sort((a, b) => b.z - a.z)[0];
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
        group = createCharacter(e.kind, this.materials);
        this.enemies.set(e.id, group);
        this.root.add(group);
      }
      if (group.userData.hp !== undefined && e.hp < group.userData.hp) {
        this.particles.emit(e.x, 1, e.z, e.slow > 0 ? '#70dfff' : '#ffcc7d', 7, 1.6, 0.4);
      }
      group.userData.hp = e.hp;
      group.position.set(e.x, 0.12, e.z);
      group.rotation.y = Math.atan2(-e.x, 10 - e.z);
      animateCharacter(group, s.time * e.speed * (e.slow > 0 ? 0.45 : 1) + e.id, true, e.z > 7);
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
      const crystal = group.getObjectByName('crystal');
      if (crystal) {
        crystal.rotation.y = s.time * 1.4;
        crystal.position.y = 2.65 + Math.sin(s.time * 2.5) * 0.14;
      }
      const turret = group.getObjectByName('turret');
      const enemy = s.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - pad.x, e.z - pad.z) <= TOWERS[tower.kind].range + (tower.level - 1) * 0.3)
        .sort((a, b) => b.z - a.z)[0];
      if (turret && enemy) turret.rotation.y = Math.atan2(pad.x - enemy.x, pad.z - enemy.z);
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
          this.glow(new THREE.SphereGeometry(shot.kind === 'cannon' ? 0.19 : 0.1, 8, 6), color, group);
          for (let i = 0; i < 5; i++) {
            const trail = this.glow(new THREE.SphereGeometry(0.075 * (1 - i / 7), 6, 4), color, group);
            trail.name = `trail-${i}`;
          }
          group.userData.start = new THREE.Vector3(shot.x, shot.kind === 'hero' ? 1.25 : 2.2, shot.z);
          group.userData.end = new THREE.Vector3(shot.tx, 0.85, shot.tz);
          this.particles.emit(shot.x, shot.kind === 'hero' ? 1.3 : 2.3, shot.z, color, 4, 0.8, 0.25);
        }
      }
      if (!group.userData.burst) {
        const t = 1 - shot.life / 0.25;
        const start = group.userData.start as THREE.Vector3, end = group.userData.end as THREE.Vector3;
        const point = projectilePosition(start, end, t, shot.kind === 'cannon');
        group.position.copy(point);
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
    if (dt > 0 && Math.floor(s.time * 16) !== Math.floor((s.time - dt) * 16)) {
      for (const light of this.torches) this.particles.emit(light.position.x, light.position.y, light.position.z, '#ffb45e', 1, 0.35, 0.8);
    }
    this.torches.forEach((light, i) => { light.intensity = 8 + Math.sin(s.time * 9 + i) * 2; });
    this.banners.forEach((banner, i) => { banner.rotation.y = Math.sin(s.time * 2 + i) * 0.16; });
    if (!reset && s.hp < this.lastHp) { this.shake = 0.28; this.impact(0, 8.7, false, true); }
    this.lastHp = s.hp;
    this.shake = Math.max(0, this.shake - dt);
    this.camera.position.copy(this.cameraPosition);
    if (this.shake > 0) this.camera.position.x += Math.sin(s.time * 70) * this.shake * 0.5;
    this.composer.render();
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.host.removeEventListener('pointerdown', this.pointerDown);
    this.host.removeEventListener('pointerup', this.pick);
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
