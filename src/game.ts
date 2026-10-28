import { PADS, ROAD_LENGTH, roadPoint, nearestRoadDistance, MAP_BOUNDS, HOME } from "./battlefield";
export { PADS } from "./battlefield";

export type TowerKind = "arrow" | "cannon" | "frost";
export type TowerBranch = "primary" | "secondary";
export type TacticId = "overclock" | "bounty" | "explosive" | "cryo" | "fieldRepair" | "command";
export type Phase = "ready" | "battle" | "won" | "lost";
export const DIFFICULTIES = {
  easy: { label: "Easy", enemyHpMultiplier: 1 },
  normal: { label: "Normal", enemyHpMultiplier: 1.4 },
  hard: { label: "Hard", enemyHpMultiplier: 2 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const DEFAULT_DIFFICULTY: Difficulty = "easy";
export const TOWERS = {
  arrow: {
    name: "기관포",
    subtitle: "빠른 단일 표적 제압",
    cost: 70,
    damage: 15,
    range: 7.2,
    rate: 0.65,
    color: "#d8b66a",
    icon: "➶",
  },
  cannon: {
    name: "박격포",
    subtitle: "밀집 병력 광역 포격",
    cost: 110,
    damage: 24,
    range: 6.7,
    rate: 1.8,
    color: "#df9875",
    icon: "◉",
  },
  frost: {
    name: "냉각포",
    subtitle: "진격 속도 억제",
    cost: 95,
    damage: 7,
    range: 7,
    rate: 1.1,
    color: "#8ccbd2",
    icon: "❄",
  },
} as const;
export const BRANCHES: Record<TowerKind, Record<TowerBranch, { name: string; description: string }>> = {
  arrow: {
    primary: { name: "관통탄", description: "표적 주변 2.5m 내 적 최대 2기에 65% 관통 피해" },
    secondary: { name: "속사 장치", description: "발사 간격 45% 감소, 발당 피해 20% 감소" },
  },
  cannon: {
    primary: { name: "확산 포탄", description: "폭발 반경 2.5m → 4m" },
    secondary: { name: "소이탄", description: "명중한 적에게 3초 동안 초당 직격 피해의 25% 화상" },
  },
  frost: {
    primary: { name: "심층 냉각", description: "3.5초 동안 이동 속도 75% 감소" },
    secondary: { name: "취약 표식", description: "3초 동안 받는 모든 피해 30% 증가" },
  },
};
export const TACTICS: Record<TacticId, { name: string; description: string }> = {
  overclock: { name: "과충전", description: "모든 포탑 공격 속도 12% 증가" },
  bounty: { name: "보급 회수", description: "처치 보상 20% 증가" },
  explosive: { name: "폭약 증량", description: "박격포 폭발 반경 20% 증가" },
  cryo: { name: "냉각 사격", description: "감속된 적에게 주는 피해 15% 증가" },
  fieldRepair: { name: "긴급 보급", description: "즉시 기지 내구도 25 회복 및 자원 100 획득" },
  command: { name: "현장 지휘", description: "지휘관과 스킬 피해 20% 증가, 스킬 대기 2초 감소" },
};
export interface Tower {
  pad: number;
  kind: TowerKind;
  level: number;
  cooldown: number;
  branch?: TowerBranch;
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
  slowFactor?: number;
  vulnerable?: number;
  burn?: number;
  burnDamage?: number;
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
  version: 5;
  tactics: TacticId[];
  pendingTactic: boolean;
  runSeed: number;
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
    version: 5,
    tactics: [],
    pendingTactic: false,
    runSeed: Math.floor(Math.random() * 0x100000000),
    difficulty,
    phase: "ready",
    wave: 0,
    gold: 300,
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
export function towerSellValue(t: Tower): number {
  let invested = TOWERS[t.kind].cost;
  for (let level = 1; level < t.level; level++) invested += towerUpgradeCost({ ...t, level });
  return Math.floor(invested * 0.75);
}
export function sellTower(s: GameState, pad: number): boolean {
  const index = s.towers.findIndex(t => t.pad === pad);
  if (index < 0 || s.phase === "won" || s.phase === "lost") return false;
  s.gold += towerSellValue(s.towers[index]);
  s.towers.splice(index, 1);
  return true;
}
export function specializeTower(s: GameState, pad: number, branch: TowerBranch): boolean {
  const t = s.towers.find(t => t.pad === pad);
  if (!t || t.level < 3 || t.branch || !["primary", "secondary"].includes(branch) || s.phase === "won" || s.phase === "lost") return false;
  t.branch = branch;
  return true;
}
function tacticCount(s: GameState, id: TacticId) { return s.tactics.filter(t => t === id).length; }
export function towerStats(s: GameState, t: Tower): { damage: number; range: number; rate: number } {
  const base = TOWERS[t.kind], rapid = t.kind === "arrow" && t.branch === "secondary";
  return {
    damage: base.damage * (1 + (t.level - 1) * 0.7) * (rapid ? 0.8 : 1),
    range: base.range + (t.level - 1) * 0.3,
    rate: base.rate / (1 + (t.level - 1) * 0.13) / (1 + tacticCount(s, "overclock") * 0.12) * (rapid ? 0.55 : 1),
  };
}
export function tacticsOffered(s: GameState): TacticId[] {
  if (!s.pendingTactic || s.phase !== "ready" || s.tactics.length >= 6) return [];
  const ids = (Object.keys(TACTICS) as TacticId[]).filter(id => tacticCount(s, id) < 3);
  let seed = (s.runSeed ^ (Math.floor(s.wave / 3) * 0x9e3779b9)) >>> 0;
  for (let i = ids.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, 3);
}
export function chooseTactic(s: GameState, id: TacticId): boolean {
  if (!tacticsOffered(s).includes(id)) return false;
  s.tactics.push(id);
  s.pendingTactic = false;
  if (id === "fieldRepair") { s.hp = Math.min(s.maxHp, s.hp + 25); s.gold += 100; }
  return true;
}
export function wavePlan(wave: number): { name: string; description: string; count: number } {
  const index = (Math.max(1, Math.min(20, Math.floor(wave))) - 1) % 5;
  const profiles = [
    { name: "군집 공세", description: "일반 병력 다수. 광역 포격으로 밀집 대형을 저지하십시오.", count: 24 },
    { name: "고속 침투", description: "정찰병 중심. 빠른 연사와 감속으로 돌파를 차단하십시오.", count: 30 },
    { name: "장갑 진격", description: "중장갑 병력 중심. 집중 화력과 취약 표식을 활용하십시오.", count: 38 },
    { name: "복합 공세", description: "일반·정찰·중장갑 혼성 부대가 교대로 진격합니다.", count: 46 },
    { name: "지휘 개체", description: "호위 병력 뒤에 지휘 개체 1기가 출현합니다. 스킬을 비축하십시오.", count: 60 },
  ];
  const plan = profiles[index];
  return { ...plan, count: plan.count + Math.floor((Math.max(1, Math.min(20, wave)) - 1) / 5) * 18 };
}
export function waveReward(wave: number): number { return 80 + wave * 10; }
function spawnKind(s: GameState): Enemy["kind"] {
  const i = s.spawned;
  switch (s.wave % 5) {
    case 1: return i % 8 === 7 ? "runner" : "grunt";
    case 2: return i % 5 === 4 ? "grunt" : "runner";
    case 3: return i % 3 === 2 ? "grunt" : "brute";
    case 4: return (["grunt", "runner", "brute"] as const)[i % 3];
    default: return i === s.total - 1 ? "boss" : (["grunt", "runner", "grunt", "brute"] as const)[i % 4];
  }
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
  if (s.phase !== "ready" || s.wave >= 20 || s.pendingTactic) return false;
  s.wave++;
  s.phase = "battle";
  s.spawned = 0;
  s.total = wavePlan(s.wave).count;
  s.timer = 0.5;
  return true;
}
function hit(s: GameState, e: Enemy, damage: number) {
  if (e.hp <= 0) return;
  e.hp -= damage * ((e.vulnerable ?? 0) > 0 ? 1.3 : 1) * (e.slow > 0 ? 1 + tacticCount(s, "cryo") * 0.15 : 1);
  if (e.hp <= 0) {
    s.gold += Math.round(e.reward * (1 + tacticCount(s, "bounty") * 0.2));
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
  branch?: TowerBranch,
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
  if (kind === "cannon") {
    const radius = (branch === "primary" ? 4 : 2.5) * (1 + tacticCount(s, "explosive") * 0.2);
    for (const e of s.enemies) {
      if (Math.hypot(e.x - target.x, e.z - target.z) < radius) {
        hit(s, e, damage);
        if (branch === "secondary") {
          e.burn = 3;
          e.burnDamage = Math.max(e.burnDamage ?? 0, damage * 0.25);
        }
      }
    }
  } else {
    hit(s, target, damage);
    if (kind === "arrow" && branch === "primary") {
      const nearby = s.enemies.filter(e => e !== target && e.hp > 0 && Math.hypot(e.x - target.x, e.z - target.z) <= 2.5)
        .sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z));
      for (const e of nearby.slice(0, 2)) hit(s, e, damage * 0.65);
    }
  }
  if (kind === "frost") {
    target.slow = Math.max(target.slow, branch === "primary" ? 3.5 : 2.5);
    target.slowFactor = Math.min(target.slowFactor ?? 0.45, branch === "primary" ? 0.25 : 0.45);
    if (branch === "secondary") target.vulnerable = 3;
  }
}
export function useSkill(s: GameState) {
  if (s.phase !== "battle" || s.skillCooldown > 0) return false;
  for (const e of s.enemies) {
    if (Math.hypot(e.x - s.hero.x, e.z - s.hero.z) < 9) {
      hit(s, e, (65 + s.heroLevel * 22) * (1 + tacticCount(s, "command") * 0.2));
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
  s.skillCooldown = 18 - tacticCount(s, "command") * 2;
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
  if (s.spawned < s.total && s.enemies.filter(e => e.hp > 0).length < 32 && (s.timer -= dt) <= 0) {
    const kind = spawnKind(s);
    const hp =
      (18 + s.wave * 4) *
      (kind === "boss"
        ? 20
        : kind === "brute"
          ? 3
          : kind === "runner"
            ? 0.65
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
      reward: kind === "boss" ? 160 + s.wave * 4 : kind === "brute" ? 24 : kind === "runner" ? 16 : 14,
    });
    s.spawned++;
    s.timer = Math.max(0.16, [0.38, 0.25, 0.3, 0.65, 0.4][s.wave % 5] - Math.floor(s.wave / 5) * 0.02);
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
      (18 + (s.heroLevel - 1) * 11) * (1 + tacticCount(s, "command") * 0.2),
    );
    s.hero.cooldown = 0.46;
  }
  for (const t of s.towers) {
    t.cooldown -= dt;
    const stats = towerStats(s, t),
      pos = PADS[t.pad],
      e = target(pos.x, pos.z, stats.range);
    if (t.cooldown <= 0 && e) {
      shoot(
        s,
        pos.x,
        pos.z,
        e,
        t.kind,
        stats.damage,
        t.branch,
      );
      t.cooldown = stats.rate;
    }
  }
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    if ((e.burn ?? 0) > 0) {
      hit(s, e, (e.burnDamage ?? 0) * Math.min(dt, e.burn!));
      e.burn = Math.max(0, e.burn! - dt);
      if (e.hp <= 0) continue;
    }
    if (e.vulnerable !== undefined) e.vulnerable = Math.max(0, e.vulnerable - dt);
    e.slow = Math.max(0, e.slow - dt);
    const speed = e.speed * (e.slow > 0 ? e.slowFactor ?? 0.45 : 1) * dt;
    if (e.slow === 0) delete e.slowFactor;
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
    s.gold += waveReward(s.wave);
    s.phase = s.wave === 20 ? "won" : "ready";
    s.pendingTactic = s.wave < 20 && s.wave % 3 === 0 && s.tactics.length < 6;
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
    const previousMap = (s.version as number) === 3;
    const oldRules = [1, 2, 3, 4].includes(s.version as number);
    const shortenedMap = legacy || oldMap || previousMap;
    const padLimit = legacy ? 8 : shortenedMap ? 24 : PADS.length;
    // Saves created before difficulty selection continue with the Easy preset.
    s.difficulty ??= DEFAULT_DIFFICULTY;
    if (oldRules) {
      s.tactics ??= [];
      s.pendingTactic ??= false;
      // A deterministic migration seed keeps reloading the same old save reproducible.
      s.runSeed ??= ((s.wave * 2654435761) ^ s.nextId) >>> 0;
    }
    if (
      (!oldRules && s.version !== 5) ||
      !Object.hasOwn(DIFFICULTIES, s.difficulty) ||
      !["ready", "battle", "won", "lost"].includes(s.phase) ||
      !Number.isInteger(s.wave) ||
      s.wave < 0 ||
      s.wave > 20 ||
      !Array.isArray(s.towers) ||
      !Array.isArray(s.enemies) ||
      !Array.isArray(s.tactics) || s.tactics.length > 6 ||
      s.tactics.some(id => !Object.hasOwn(TACTICS, id) || tacticCount(s, id) > 3) ||
      typeof s.pendingTactic !== "boolean" ||
      (s.pendingTactic && (s.phase !== "ready" || s.wave === 0 || s.wave % 3 !== 0 || s.wave > 18 || s.tactics.length >= 6)) ||
      !Number.isInteger(s.runSeed) || s.runSeed < 0 || s.runSeed > 0xffffffff
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
      s.towers.length > padLimit ||
      s.enemies.length > 100
    )
      return null;
    const used = new Set<number>();
    for (const t of s.towers) {
      if (
        !Number.isInteger(t.pad) || t.pad < 0 || t.pad >= padLimit ||
        used.has(t.pad) ||
        !Object.hasOwn(TOWERS, t.kind) ||
        !Number.isInteger(t.level) ||
        t.level < 1 ||
        t.level > 5 ||
        !Number.isFinite(t.cooldown) ||
        (t.branch !== undefined && (t.level < 3 || !["primary", "secondary"].includes(t.branch)))
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
    if (s.enemies.some(e => [e.slowFactor, e.vulnerable, e.burn, e.burnDamage].some(n => n !== undefined && (!Number.isFinite(n) || n < 0)) || (e.slowFactor !== undefined && e.slowFactor > 1))) return null;
    // The removed straight and 64-segment semicircle preceded the retained road.
    const removedLength = 26 + 64 * 10 * Math.sin(Math.PI / 128);
    if (legacy) {
      s.towers.forEach(t => { t.pad *= 3; });
      const oldProgress = (z: number) => Math.max(0, Math.min(1, (z + 12) / 20.2)) * (ROAD_LENGTH + removedLength) - removedLength;
      const oldHero = roadPoint(oldProgress(s.hero.z));
      s.hero.x = oldHero.x; s.hero.z = oldHero.z;
      for (const e of s.enemies) {
        e.progress = oldProgress(e.z);
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
    if (previousMap) {
      for (const e of s.enemies) {
        // Translating stored progress also preserves lane offsets at bend vertices.
        e.progress = e.progress === undefined ? nearestRoadDistance(e) : Math.max(0, e.progress - removedLength);
      }
    }
    if (shortenedMap) {
      s.towers = s.towers.filter(t => {
        if (t.pad >= 6) { t.pad -= 6; return true; }
        s.gold += TOWERS[t.kind].cost;
        for (let level = 1; level < t.level; level++) s.gold += towerUpgradeCost({ ...t, level });
        return false;
      });
    }
    s.version = 5;
    s.shots = [];
    clearStructureOverlaps(s);
    return s;
  } catch {
    return null;
  }
}
