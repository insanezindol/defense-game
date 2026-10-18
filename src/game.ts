export type TowerKind = "arrow" | "cannon" | "frost";
export type Phase = "ready" | "battle" | "won" | "lost";
// Balance tuning: only enemy HP scales, keeping rewards and pacing unchanged.
export const DIFFICULTIES = {
  easy: { label: "Easy", enemyHpMultiplier: 2 },
  normal: { label: "Normal", enemyHpMultiplier: 3 },
  hard: { label: "Hard", enemyHpMultiplier: 4 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const DEFAULT_DIFFICULTY: Difficulty = "easy";
export const TOWERS = {
  arrow: {
    name: "궁수탑",
    subtitle: "빠른 단일 공격",
    cost: 70,
    damage: 15,
    range: 7.2,
    rate: 0.65,
    color: "#d8b66a",
    icon: "➶",
  },
  cannon: {
    name: "대포탑",
    subtitle: "강력한 범위 공격",
    cost: 110,
    damage: 24,
    range: 6.7,
    rate: 1.8,
    color: "#df9875",
    icon: "◉",
  },
  frost: {
    name: "서리탑",
    subtitle: "이동 속도 55% 감소",
    cost: 95,
    damage: 7,
    range: 7,
    rate: 1.1,
    color: "#8ccbd2",
    icon: "❄",
  },
} as const;
export const PADS = [
  { x: -5, z: -6 },
  { x: 5, z: -6 },
  { x: -5, z: -1 },
  { x: 5, z: -1 },
  { x: -5, z: 4 },
  { x: 5, z: 4 },
  { x: -10, z: -3 },
  { x: 10, z: -3 },
];
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
  version: 1;
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
export function newGame(difficulty: Difficulty = DEFAULT_DIFFICULTY): GameState {
  return {
    version: 1,
    difficulty,
    phase: "ready",
    wave: 0,
    gold: 200,
    hp: 100,
    maxHp: 100,
    heroLevel: 1,
    hero: { x: 0, z: 2, cooldown: 0 },
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
  if (length > 0) {
    s.hero.x = Math.max(
      -12,
      Math.min(12, s.hero.x + (input.x / Math.max(1, length)) * dt * 6),
    );
    s.hero.z = Math.max(
      -10,
      Math.min(7.5, s.hero.z + (input.z / Math.max(1, length)) * dt * 6),
    );
  }
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
      x: Math.sin(id * 73.13) * 8.5,
      z: -12,
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
      .sort((a, b) => b.z - a.z)[0];
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
    const dx = -e.x,
      dz = 10 - e.z,
      distance = Math.hypot(dx, dz);
    e.x += (dx / distance) * speed;
    e.z += (dz / distance) * speed;
    if (e.z >= 8.2) {
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
    // Saves created before difficulty selection continue with the Easy preset.
    s.difficulty ??= DEFAULT_DIFFICULTY;
    if (
      s.version !== 1 ||
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
    s.shots = [];
    return s;
  } catch {
    return null;
  }
}
