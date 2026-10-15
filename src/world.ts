import * as THREE from "three";
import { PADS, TOWERS, type GameState } from "./game";
const COLORS = {
  grass: "#8fa46d",
  stone: "#d6c6a1",
  path: "#c9b88b",
  blue: "#417a92",
  dark: "#344838",
};
export class World {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera = new THREE.OrthographicCamera();
  root = new THREE.Group();
  hero = new THREE.Group();
  enemies = new Map<number, THREE.Group>();
  towers = new Map<number, { level: number; group: THREE.Group }>();
  shots = new Map<number, THREE.Group>();
  pads: THREE.Mesh[] = [];
  ring: THREE.Mesh;
  resizeObserver: ResizeObserver;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  constructor(
    public host: HTMLElement,
    public onPad: (pad: number) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#a6bbaa", 0);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D 전장. 금색 원을 눌러 건물을 건설하세요.",
    );
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.root);
    this.scene.fog = new THREE.Fog("#a3b69d", 55, 95);
    this.scene.add(new THREE.HemisphereLight("#fff5d7", "#647762", 2.7));
    const sun = new THREE.DirectionalLight("#fff0c9", 3.4);
    sun.position.set(-12, 25, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -22,
      right: 22,
      top: 22,
      bottom: -22,
      near: 1,
      far: 65,
    });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.terrain();
    this.hero = this.person("#487e9c", "#e9c38b", false);
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
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    host.addEventListener("pointerup", this.pick);
  }
  private material(color: string) {
    if (!this.materials.has(color))
      this.materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.92,
          flatShading: true,
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
    this.cylinder(g, "#435e43", 0, 1.45, 0, 0, 1.05, 1.8, 6);
    this.cylinder(g, "#56744f", 0, 2.2, 0, 0, 0.8, 1.7, 6);
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
  person(color: string, skin: string, enemy: boolean, boss = false) {
    const g = new THREE.Group();
    this.cylinder(g, color, 0, 0.68, 0, 0.36, 0.47, 0.8, 6);
    this.mesh(new THREE.IcosahedronGeometry(0.3, 0), skin, g, 0, 1.29, 0);
    this.cylinder(
      g,
      enemy ? "#65534a" : "#ccd8d0",
      0,
      1.48,
      0,
      0.31,
      0.34,
      0.29,
      6,
    );
    this.box(g, enemy ? "#564f43" : "#24495b", 0, 0.85, -0.28, 0.65, 0.8, 0.16);
    for (const x of [-0.21, 0.21])
      this.box(g, "#3f493e", x, 0.18, 0, 0.2, 0.4, 0.25);
    this.box(g, "#c8cfbb", 0.55, 0.9, 0.18, 0.1, 0.8, 0.12).rotation.z = -0.5;
    this.cylinder(
      g,
      enemy ? "#876a50" : "#dcbd77",
      -0.48,
      0.83,
      0.1,
      0.27,
      0.27,
      0.1,
      6,
    ).rotation.x = Math.PI / 2;
    if (boss) {
      this.cylinder(g, "#d6b76b", 0, 1.77, 0, 0.34, 0.28, 0.3, 5);
      g.scale.setScalar(1.9);
    }
    const bg = this.box(g, "#4d4136", 0, 1.95, 0, 1, 0.1, 0.08);
    bg.name = "hp-bg";
    const hp = this.box(
      g,
      enemy ? "#d88f73" : "#9cc894",
      0,
      1.95,
      0.05,
      1,
      0.1,
      0.08,
    );
    hp.name = "hp";
    g.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.castShadow = false;
    });
    return g;
  }
  tower(kind: keyof typeof TOWERS, level: number) {
    const g = new THREE.Group();
    this.cylinder(g, "#c9c4a5", 0, 0.6, 0, 0.8, 1.08, 1.2, 8);
    this.cylinder(g, "#dcd4b4", 0, 1.35, 0, 1, 0.85, 0.3, 8);
    if (kind === "arrow") {
      for (const x of [-0.55, 0.55])
        this.box(g, "#786c4b", x, 1.95, 0, 0.18, 1, 0.3);
      this.cylinder(g, "#5e7e67", 0, 2.55, 0, 0, 1.28, 1, 4).rotation.y =
        Math.PI / 4;
      this.box(g, "#d0af66", 0, 1.95, 0.35, 1.3, 0.13, 0.25);
      this.box(g, "#766448", 0, 1.95, 0.65, 0.13, 0.15, 1.1);
    } else if (kind === "cannon") {
      this.box(g, "#6e6450", 0, 1.7, 0, 1.1, 0.5, 0.9);
      this.cylinder(g, "#455957", 0, 1.95, -0.6, 0.4, 0.46, 1.4, 8).rotation.x =
        Math.PI / 2;
      this.cylinder(
        g,
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
      this.mesh(new THREE.OctahedronGeometry(0.65), "#a6e0dd", g, 0, 2.65, 0);
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
  pick = (event: PointerEvent) => {
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
    const aspect = width / Math.max(height, 1),
      size = Math.max(18, 18 / aspect);
    Object.assign(this.camera, {
      left: -size * aspect,
      right: size * aspect,
      top: size,
      bottom: -size,
      near: 0.1,
      far: 110,
    });
    this.camera.position.set(0, 30, 26);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  private remove(g: THREE.Group) {
    g.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
    this.root.remove(g);
  }
  draw(s: GameState, selected: number | null) {
    this.hero.position.set(s.hero.x, 0.12, s.hero.z);
    this.ring.position.set(s.hero.x, 0.15, s.hero.z);
    this.hero.rotation.y = Math.sin(s.time * 0.8) * 0.12;
    this.hero.position.y = 0.12 + Math.sin(s.time * 3) * 0.025;
    for (const [id, g] of this.enemies)
      if (!s.enemies.some((e) => e.id === id)) {
        this.remove(g);
        this.enemies.delete(id);
      }
    for (const e of s.enemies) {
      let g = this.enemies.get(e.id);
      if (!g) {
        g = this.person(
          e.kind === "boss"
            ? "#67517c"
            : e.kind === "brute"
              ? "#826a57"
              : "#af7058",
          "#d5b383",
          true,
          e.kind === "boss",
        );
        this.enemies.set(e.id, g);
        this.root.add(g);
        if (e.kind === "runner") g.scale.setScalar(0.8);
      }
      g.position.set(
        e.x,
        0.09 + Math.abs(Math.sin(s.time * e.speed * 7 + e.id)) * 0.08,
        e.z,
      );
      g.rotation.y = Math.atan2(-e.x, 10 - e.z);
      g.getObjectByName("hp")!.scale.x = Math.max(0, e.hp / e.maxHp);
    }
    for (const [pad, item] of this.towers)
      if (!s.towers.some((t) => t.pad === pad)) {
        this.remove(item.group);
        this.towers.delete(pad);
      }
    for (const t of s.towers) {
      const old = this.towers.get(t.pad);
      if (!old || old.level !== t.level) {
        if (old) this.remove(old.group);
        const g = this.tower(t.kind, t.level),
          p = PADS[t.pad];
        g.position.set(p.x, 0.15, p.z);
        this.root.add(g);
        this.towers.set(t.pad, { level: t.level, group: g });
        this.renderer.shadowMap.needsUpdate = true;
      }
    }
    this.pads.forEach((pad, i) => {
      pad.scale.setScalar(
        selected === i ? 1.15 + Math.sin(s.time * 4) * 0.06 : 1,
      );
    });
    for (const [id, g] of this.shots)
      if (!s.shots.some((p) => p.id === id)) {
        this.remove(g);
        this.shots.delete(id);
      }
    for (const p of s.shots) {
      let g = this.shots.get(p.id);
      if (!g) {
        g = new THREE.Group();
        this.root.add(g);
        this.shots.set(p.id, g);
        if (p.life > 0.3) {
          const ring = this.mesh(
            new THREE.TorusGeometry(1, 0.08, 5, 50),
            "#bde3d3",
            g,
          );
          ring.rotation.x = Math.PI / 2;
          g.userData.burst = true;
        } else {
          const points = [
            new THREE.Vector3(p.x, 1.5, p.z),
            new THREE.Vector3(p.tx, 1, p.tz),
          ];
          const tube = new THREE.TubeGeometry(
            new THREE.LineCurve3(points[0], points[1]),
            1,
            p.kind === "cannon" ? 0.12 : 0.045,
            4,
            false,
          );
          this.mesh(
            tube,
            p.kind === "frost"
              ? "#b3ebe7"
              : p.kind === "hero"
                ? "#fff4bf"
                : "#e8bc78",
            g,
          );
          this.mesh(
            new THREE.IcosahedronGeometry(0.22),
            "#ffe5a0",
            g,
            p.tx,
            1,
            p.tz,
          );
        }
      }
      if (g.userData.burst) {
        g.position.set(p.x, 0.3, p.z);
        g.scale.setScalar((0.75 - p.life) * 14);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.host.removeEventListener("pointerup", this.pick);
    this.renderer.setAnimationLoop(null);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
    this.materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
