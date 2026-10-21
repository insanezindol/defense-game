import * as THREE from "three";

// Fixed GPU buffers keep large battles from allocating a new mesh for every spark.
export class BattleParticles {
  readonly geometry = new THREE.BufferGeometry();
  readonly material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `attribute vec3 tint; attribute float size; attribute float alpha;
      varying vec3 vTint; varying float vAlpha; uniform float pixelRatio;
      void main() { vTint = tint; vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(80.0, size * pixelRatio * 230.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vTint; varying float vAlpha;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0 || vAlpha <= 0.0) discard;
        gl_FragColor = vec4(vTint, pow(1.0 - d, 1.7) * vAlpha); }`,
  });
  readonly points = new THREE.Points(this.geometry, this.material);
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private velocities: Float32Array;
  private lives: Float32Array;
  private lifetimes: Float32Array;
  private cursor = 0;
  constructor(private capacity = 768) {
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.lives = new Float32Array(capacity);
    this.lifetimes = new Float32Array(capacity);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("tint", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.points.frustumCulled = false;
  }
  emit(x: number, y: number, z: number, color: THREE.ColorRepresentation, count: number, power = 3, life = 0.7) {
    const tint = new THREE.Color(color);
    for (let n = 0; n < Math.min(count, this.capacity); n++) {
      const i = this.cursor++ % this.capacity, j = i * 3;
      this.positions.set([x, y, z], j);
      const angle = Math.random() * Math.PI * 2, speed = (0.3 + Math.random()) * power;
      this.velocities.set([Math.cos(angle) * speed, (0.3 + Math.random()) * power, Math.sin(angle) * speed], j);
      this.colors.set([tint.r, tint.g, tint.b], j);
      this.sizes[i] = 0.4 + Math.random() * 1.1;
      this.lives[i] = this.lifetimes[i] = life * (0.6 + Math.random() * 0.4);
      this.alphas[i] = 1;
    }
    for (const attribute of Object.values(this.geometry.attributes)) attribute.needsUpdate = true;
  }
  update(dt: number) {
    for (let i = 0; i < this.capacity; i++) {
      if (this.lives[i] <= 0) continue;
      this.lives[i] = Math.max(0, this.lives[i] - dt);
      this.alphas[i] = this.lives[i] / this.lifetimes[i];
      const j = i * 3;
      this.velocities[j + 1] -= dt * 5;
      for (let axis = 0; axis < 3; axis++) this.positions[j + axis] += this.velocities[j + axis] * dt;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
