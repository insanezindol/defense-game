import { PADS, ROAD_LENGTH, roadPoint, nearestRoadDistance, MAP_BOUNDS, HOME } from "./battlefield";
export { PADS } from "./battlefield";

export type TowerKind = "arrow" | "cannon" | "frost";
export type Phase = "ready" | "battle" | "won" | "lost";
// Balance tuning: only enemy HP scales, keeping rewards and pacing unchanged.
export const DIFFICULTIES = {
  easy: { label: "Easy", enemyHpMultiplier: 20 },
  normal: { label: "Normal", enemyHpMultiplier: 30 },
  hard: { label: "Hard", enemyHpMultiplier: 40 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const DEFAULT_DIFFICULTY: Difficulty = "easy";
export const TOWERS = {
  arrow: {
    name: "빨래집게 발사대",
    subtitle: "집게 맛 좀 볼래?",
    cost: 70,
    damage: 15,
    range: 7.2,
    rate: 0.65,
    color: "#d8b66a",
    icon: "➶",
  },
  cannon: {
    name: "택배 상자 대포",
    subtitle: "반품 불가! 광역 배송",
    cost: 110,
    damage: 24,
    range: 6.7,
    rate: 1.8,
    color: "#df9875",
    icon: "◉",
  },
  frost: {
    name: "초강력 선풍기",
    subtitle: "맞바람에 느려져요",
    cost: 95,
    damage: 7,
    range: 7,
    rate: 1.1,
    color: "#8ccbd2",
    icon: "❄",
  },
} as const;
export interface Tower {
  pad: number;
  kind: TowerKind;
  level: number;
  cooldown: number;
}
export interface Enemy {
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  speed: number;
  kind: "grunt" | "runner" | "brute" | "boss";
  slow: number;
  reward: number;
  progress?: number;
  lane?: number;
}
export interface Shot {
  id: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  kind: TowerKind | "hero";
  life: number;
}
export interface GameState {
  version: 3;
  difficulty: Difficulty;
  phase: Phase;
  wave: number;
  gold: number;
  hp: number;
  maxHp: number;
  heroLevel: number;
  hero: { x: number; z: number; cooldown: number };
  towers: Tower[];
  enemies: Enemy[];
  shots: Shot[];
  kills: number;
  spawned: number;
  total: number;
  timer: number;
  time: number;
  nextId: number;
  skillCooldown: number;
}
export const SAVE_KEY = "emberhold-save-v1";
const TOWER_RADIUS = 1.35;
const CHARACTER_RADIUS = { hero: 0.8, grunt: 0.75, runner: 0.6, brute: 0.95, boss: 1.35 };

function separateFromTowers(position: { x: number; z: number }, towers: Tower[], radius: number, hero = false) {
  if (hero) {
    position.x = Math.max(MAP_BOUNDS.minX + 2, Math.min(MAP_BOUNDS.maxX - 2, position.x));
    position.z = Math.max(MAP_BOUNDS.minZ + 2, Math.min(HOME.z - 3.8, position.z));
  }
  const clearance = TOWER_RADIUS + radius;
  if (towers.every(t => Math.hypot(position.x - PADS[t.pad].x, position.z - PADS[t.pad].z) >= clearance - 1e-8)) return;
  let bestX = position.x, bestZ = position.z, bestDistance = Infinity;
  const offer = (x: number, z: number) => {
    if (hero && (x < MAP_BOUNDS.minX + 2 || x > MAP_BOUNDS.maxX - 2 || z < MAP_BOUNDS.minZ + 2 || z > HOME.z - 3.8)) return;
    if (towers.some(t => Math.hypot(x - PADS[t.pad].x, z - PADS[t.pad].z) < clearance - 1e-8)) return;
    const distance = (x - position.x) ** 2 + (z - position.z) ** 2;
    if (distance < bestDistance) { bestX = x; bestZ = z; bestDistance = distance; }
  };
  for (let i = 0; i < towers.length; i++) {
    const pad = PADS[towers[i].pad];
    const dx = position.x - pad.x, dz = position.z - pad.z, distance = Math.hypot(dx, dz);
    offer(pad.x + (distance > 1e-8 ? dx / distance : pad.x < 0 ? 1 : -1) * clearance,
      pad.z + (distance > 1e-8 ? dz / distance : 0) * clearance);
    if (hero) {
      for (const edge of [MAP_BOUNDS.minX + 2, MAP_BOUNDS.maxX - 2]) {
        if (Math.abs(edge - pad.x) > clearance) continue;
        const offset = Math.sqrt(Math.max(0, clearance ** 2 - (edge - pad.x) ** 2));
        offer(edge, pad.z + offset); offer(edge, pad.z - offset);
      }
      for (const edge of [MAP_BOUNDS.minZ + 2, HOME.z - 3.8]) {
        if (Math.abs(edge - pad.z) > clearance) continue;
        const offset = Math.sqrt(Math.max(0, clearance ** 2 - (edge - pad.z) ** 2));
        offer(pad.x + offset, edge); offer(pad.x - offset, edge);
      }
    }
    // Circle intersections clear large units from two adjacent towers without pushing them back and forth.
    for (let j = i + 1; j < towers.length; j++) {
      const other = PADS[towers[j].pad], ax = other.x - pad.x, az = other.z - pad.z;
      const spacing = Math.hypot(ax, az);
      if (spacing > clearance * 2) continue;
      const h = Math.sqrt(Math.max(0, clearance ** 2 - spacing ** 2 / 4));
      const mx = (pad.x + other.x) / 2, mz = (pad.z + other.z) / 2;
      offer(mx - az / spacing * h, mz + ax / spacing * h);
      offer(mx + az / spacing * h, mz - ax / spacing * h);
    }
  }
  position.x = bestX;
  position.z = bestZ;
}

function placeEnemyOnRoad(enemy: Enemy) {
  enemy.progress = Math.max(0, Math.min(ROAD_LENGTH, enemy.progress ?? nearestRoadDistance(enemy)));
  enemy.lane = Math.max(-0.35, Math.min(0.35, enemy.lane ?? 0));
  const point = roadPoint(enemy.progress, enemy.lane);
  enemy.x = point.x; enemy.z = point.z;
}

function clearStructureOverlaps(s: GameState) {
  separateFromTowers(s.hero, s.towers, CHARACTER_RADIUS.hero, true);
  for (const enemy of s.enemies) placeEnemyOnRoad(enemy);
}

function moveCharacter(s: GameState, position: { x: number; z: number }, dx: number, dz: number, radius: number) {
  separateFromTowers(position, s.towers, radius, position === s.hero);
  position.x += dx;
  position.z += dz;
  separateFromTowers(position, s.towers, radius, position === s.hero);
}

export function newGame(difficulty: Difficulty = DEFAULT_DIFFICULTY): GameState {
  return {
    version: 3,
    difficulty,
    phase: "ready",
    wave: 0,
    gold: 200,
    hp: 100,
    maxHp: 100,
    heroLevel: 1,
    hero: { x: HOME.x + 4, z: HOME.z - 5, cooldown: 0 },
    towers: [],
    enemies: [],
    shots: [],
    kills: 0,
    spawned: 0,
    total: 0,
    timer: 0,
    time: 0,
    nextId: 1,
    skillCooldown: 0,
  };
}
export function towerUpgradeCost(t: Tower) {
  return Math.round(TOWERS[t.kind].cost * (0.65 + t.level * 0.35));
}
export function heroUpgradeCost(s: GameState) {
  return 65 + s.heroLevel * 35;
}
export function build(s: GameState, pad: number, kind: TowerKind) {
  if (
    s.phase === "won" ||
    s.phase === "lost" ||
    !PADS[pad] ||
    !TOWERS[kind] ||
    s.towers.some((t) => t.pad === pad) ||
    s.gold < TOWERS[kind].cost
  )
    return false;
  s.gold -= TOWERS[kind].cost;
  s.towers.push({ pad, kind, level: 1, cooldown: 0 });
  clearStructureOverlaps(s);
  return true;
}
export function upgradeTower(s: GameState, pad: number) {
  const t = s.towers.find((x) => x.pad === pad);
  if (
    !t ||
    t.level >= 5 ||
    s.gold < towerUpgradeCost(t) ||
    ["won", "lost"].includes(s.phase)
  )
    return false;
  s.gold -= towerUpgradeCost(t);
  t.level++;
  return true;
}
export function upgradeHero(s: GameState) {
  if (
    s.heroLevel >= 10 ||
    s.gold < heroUpgradeCost(s) ||
    ["won", "lost"].includes(s.phase)
  )
    return false;
  s.gold -= heroUpgradeCost(s);
  s.heroLevel++;
  return true;
}
export function repair(s: GameState) {
  if (s.gold < 60 || s.hp >= s.maxHp || ["won", "lost"].includes(s.phase))
    return false;
  s.gold -= 60;
  s.hp = Math.min(s.maxHp, s.hp + 35);
  return true;
}
export function startWave(s: GameState) {
  if (s.phase !== "ready" || s.wave >= 20) return false;
  s.wave++;
  s.phase = "battle";
  s.spawned = 0;
  s.total = 10 + s.wave * 3;
  s.timer = 0.5;
  return true;
}
function hit(s: GameState, e: Enemy, damage: number) {
  if (e.hp <= 0) return;
  e.hp -= damage;
  if (e.hp <= 0) {
    s.gold += e.reward;
    s.kills++;
  }
}
function shoot(
  s: GameState,
  x: number,
  z: number,
  target: Enemy,
  kind: Shot["kind"],
  damage: number,
) {
  s.shots.push({
    id: s.nextId++,
    x,
    z,
    tx: target.x,
    tz: target.z,
    kind,
    life: 0.25,
  });
  if (kind === "cannon")
    for (const e of s.enemies) {
      if (Math.hypot(e.x - target.x, e.z - target.z) < 2.5) hit(s, e, damage);
    }
  else hit(s, target, damage);
  if (kind === "frost") target.slow = 2.5;
}
export function useSkill(s: GameState) {
  if (s.phase !== "battle" || s.skillCooldown > 0) return false;
  for (const e of s.enemies) {
    if (Math.hypot(e.x - s.hero.x, e.z - s.hero.z) < 9) {
      hit(s, e, 65 + s.heroLevel * 22);
      e.slow = 3;
    }
  }
  s.shots.push({
    id: s.nextId++,
    x: s.hero.x,
    z: s.hero.z,
    tx: s.hero.x,
    tz: s.hero.z,
    kind: "frost",
    life: 0.7,
  });
  s.skillCooldown = 18;
  return true;
}
export function update(s: GameState, dt: number, input = { x: 0, z: 0 }) {
  if (s.phase === "won" || s.phase === "lost") return;
  dt = Math.min(0.1, Math.max(0, dt));
  s.time += dt;
  const length = Math.hypot(input.x, input.z);
  moveCharacter(s, s.hero, input.x / Math.max(1, length) * dt * 6,
    input.z / Math.max(1, length) * dt * 6, CHARACTER_RADIUS.hero);
  s.skillCooldown = Math.max(0, s.skillCooldown - dt);
  s.shots = s.shots.filter((p) => (p.life -= dt) > 0);
  if (s.phase !== "battle") return;
  if (s.spawned < s.total && (s.timer -= dt) <= 0) {
    const boss = s.wave % 5 === 0 && s.spawned === s.total - 1;
    const kind: Enemy["kind"] = boss
      ? "boss"
      : s.spawned % 7 === 5
        ? "brute"
        : s.spawned % 4 === 2
          ? "runner"
          : "grunt";
    const hp =
      (24 + s.wave * 7) *
      (kind === "boss"
        ? 13
        : kind === "brute"
          ? 2.5
          : kind === "runner"
            ? 0.7
            : 1) * DIFFICULTIES[s.difficulty].enemyHpMultiplier;
    const id = s.nextId++;
    s.enemies.push({
      id,
      x: roadPoint(0).x,
      z: roadPoint(0).z,
      progress: 0,
      lane: Math.sin(id * 73.13) * 0.35,
      hp,
      maxHp: hp,
      kind,
      speed:
        kind === "boss"
          ? 0.8
          : kind === "runner"
            ? 2.2
            : kind === "brute"
              ? 0.85
              : 1.25,
      slow: 0,
      reward: kind === "boss" ? 110 : kind === "brute" ? 17 : 9,
    });
    s.spawned++;
    s.timer = Math.max(0.22, 0.85 - s.wave * 0.025);
  }
  const target = (x: number, z: number, range: number) =>
    s.enemies
      .filter((e) => e.hp > 0 && Math.hypot(e.x - x, e.z - z) <= range)
      .sort((a, b) => (b.progress ?? nearestRoadDistance(b)) - (a.progress ?? nearestRoadDistance(a)))[0];
  s.hero.cooldown -= dt;
  const heroTarget = target(s.hero.x, s.hero.z, 7.8);
  if (s.hero.cooldown <= 0 && heroTarget) {
    shoot(
      s,
      s.hero.x,
      s.hero.z,
      heroTarget,
      "hero",
      18 + (s.heroLevel - 1) * 11,
    );
    s.hero.cooldown = 0.46;
  }
  for (const t of s.towers) {
    t.cooldown -= dt;
    const stats = TOWERS[t.kind],
      pos = PADS[t.pad],
      e = target(pos.x, pos.z, stats.range + (t.level - 1) * 0.3);
    if (t.cooldown <= 0 && e) {
      shoot(
        s,
        pos.x,
        pos.z,
        e,
        t.kind,
        stats.damage * (1 + (t.level - 1) * 0.7),
      );
      t.cooldown = stats.rate / (1 + (t.level - 1) * 0.13);
    }
  }
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    e.slow = Math.max(0, e.slow - dt);
    const speed = e.speed * (e.slow > 0 ? 0.45 : 1) * dt;
    e.progress = Math.min(ROAD_LENGTH, (e.progress ?? nearestRoadDistance(e)) + speed);
    placeEnemyOnRoad(e);
    if (e.progress! >= ROAD_LENGTH) {
      s.hp = Math.max(
        0,
        s.hp - (e.kind === "boss" ? 30 : e.kind === "brute" ? 10 : 5),
      );
      e.hp = 0;
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
  if (s.hp <= 0) {
    s.phase = "lost";
    return;
  }
  if (s.spawned === s.total && s.enemies.length === 0) {
    s.gold += 45 + s.wave * 5;
    s.phase = s.wave === 20 ? "won" : "ready";
    s.skillCooldown = 0;
  }
}
export function serialize(s: GameState) {
  return JSON.stringify({ ...s, shots: [] });
}
export function restore(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as GameState;
    const legacy = (s.version as number) === 1;
    const oldMap = (s.version as number) === 2;
    // Saves created before difficulty selection continue with the Easy preset.
    s.difficulty ??= DEFAULT_DIFFICULTY;
    if (
      (!legacy && !oldMap && s.version !== 3) ||
      !Object.hasOwn(DIFFICULTIES, s.difficulty) ||
      !["ready", "battle", "won", "lost"].includes(s.phase) ||
      !Number.isInteger(s.wave) ||
      s.wave < 0 ||
      s.wave > 20 ||
      !Array.isArray(s.towers) ||
      !Array.isArray(s.enemies)
    )
      return null;
    const numbers = [
      s.gold,
      s.hp,
      s.maxHp,
      s.heroLevel,
      s.hero?.x,
      s.hero?.z,
      s.hero?.cooldown,
      s.kills,
      s.spawned,
      s.total,
      s.timer,
      s.time,
      s.nextId,
      s.skillCooldown,
    ];
    if (
      !numbers.every(Number.isFinite) ||
      s.gold < 0 ||
      s.hp < 0 ||
      s.hp > 100 ||
      s.heroLevel < 1 ||
      s.heroLevel > 10 ||
      s.towers.length > PADS.length ||
      s.enemies.length > 100
    )
      return null;
    const used = new Set<number>();
    for (const t of s.towers) {
      if (
        !PADS[t.pad] ||
        (legacy && t.pad >= 8) ||
        used.has(t.pad) ||
        !TOWERS[t.kind] ||
        !Number.isInteger(t.level) ||
        t.level < 1 ||
        t.level > 5 ||
        !Number.isFinite(t.cooldown)
      )
        return null;
      used.add(t.pad);
    }
    for (const e of s.enemies)
      if (
        ![e.id, e.x, e.z, e.hp, e.maxHp, e.speed, e.slow, e.reward].every(
          Number.isFinite,
        ) ||
        !["grunt", "runner", "brute", "boss"].includes(e.kind)
      )
        return null;
    if (s.enemies.some(e => (e.progress !== undefined && !Number.isFinite(e.progress)) || (e.lane !== undefined && !Number.isFinite(e.lane)))) return null;
    if (legacy) {
      s.towers.forEach(t => { t.pad *= 3; });
      const oldHero = roadPoint(Math.max(0, Math.min(1, (s.hero.z + 12) / 20.2)) * ROAD_LENGTH);
      s.hero.x = oldHero.x; s.hero.z = oldHero.z;
      for (const e of s.enemies) {
        e.progress = Math.max(0, Math.min(1, (e.z + 12) / 20.2)) * ROAD_LENGTH;
        e.lane = Math.sign(e.x) * 0.25;
      }
    }
    if (oldMap) {
      s.hero.z = (s.hero.z + 2) * 0.625 - 2;
      for (const e of s.enemies) {
        // Reproject old coordinates instead of reusing distances from the longer road.
        const centerZ = e.z + 2;
        e.progress = nearestRoadDistance({ x: e.x, z: centerZ * 0.625 - 2 });
      }
    }
    s.version = 3;
    s.shots = [];
    clearStructureOverlaps(s);
    return s;
  } catch {
    return null;
  }
}
