import { test } from "node:test";
import assert from "node:assert/strict";
import {
  build,
  TOWERS,
  heroUpgradeCost,
  newGame,
  PADS,
  repair,
  restore,
  serialize,
  startWave,
  towerUpgradeCost,
  update,
  upgradeHero,
  upgradeTower,
  useSkill,
  type Enemy,
} from "../src/game";
import { ROAD_LENGTH, ROAD_HALF_WIDTH, roadPoint, nearestRoadDistance, MAP_BOUNDS, HOME } from "../src/battlefield";

test('interior towers attack both adjacent roads at level one, including outer lanes', () => {
  for (let pad = 6; pad < PADS.length; pad++) {
    for (const kind of ['arrow', 'cannon', 'frost'] as const) {
      for (const side of [-1, 1]) {
        for (const lane of [-0.35, 0, 0.35]) {
          const s = newGame();
          build(s, pad, kind); startWave(s); s.spawned = s.total;
          s.hero.cooldown = 100;
          const p = PADS[pad];
          const progress = nearestRoadDistance({ x: p.x, z: p.z + side * 5 });
          const position = roadPoint(progress, lane);
          s.enemies = [{ id: 100, ...position, progress, lane,
            hp: 1000, maxHp: 1000, speed: 1, kind: 'grunt', slow: 0, reward: 9 }];
          update(s, 0);
          assert.equal(s.enemies[0].hp, 1000 - TOWERS[kind].damage, `${kind} pad ${pad} side ${side}`);
          assert.ok(s.shots.some(shot => shot.kind === kind));
        }
      }
    }
  }
});

test('version two saves project active enemies onto the compact map without changing their HP', () => {
  const old = { ...newGame(), version: 2, gold: 321, wave: 7, phase: 'battle',
    hero: { x: 0, z: 1, cooldown: 0 },
    towers: [{ pad: 8, kind: 'arrow', level: 3, cooldown: 1 }],
    enemies: [{ id: 100, x: 0, z: -10, progress: 75, lane: 0,
      hp: 77, maxHp: 100, speed: 1, kind: 'grunt', slow: 0, reward: 9 }] };
  const s = restore(JSON.stringify(old))!;
  assert.equal(s.version, 3);
  assert.equal(s.enemies[0].x, 0);
  assert.equal(s.enemies[0].z, -7);
  assert.equal(s.enemies[0].hp, 77);
  assert.equal(s.gold, 321);
  assert.equal(s.wave, 7);
  assert.deepEqual(s.towers, old.towers);
  assert.deepEqual(restore(serialize(s)), s);
});

test('empty sites are walkable and construction immediately separates the resident', () => {
  const s = newGame(), pad = PADS[8];
  s.hero = { x: pad.x - 3, z: pad.z, cooldown: 0 };
  for (let i = 0; i < 5; i++) update(s, 0.1, { x: 1, z: 0 });
  assert.ok(Math.hypot(s.hero.x - pad.x, s.hero.z - pad.z) < 0.01);
  assert.equal(build(s, 8, 'arrow'), true);
  assert.ok(Math.hypot(s.hero.x - pad.x, s.hero.z - pad.z) >= 2.15 - 1e-8);
  s.hero.x = pad.x - 3; s.hero.z = pad.z;
  for (let i = 0; i < 20; i++) update(s, 0.1, { x: 1, z: 0 });
  assert.ok(s.hero.x <= pad.x - 2.15 + 1e-8);
  const before = s.hero.z;
  for (let i = 0; i < 10; i++) update(s, 0.1, { x: 1, z: 1 });
  assert.ok(s.hero.z > before + 1);
});

test('every enemy size stays on the S road with all 24 structures and reaches only the final door', () => {
  for (const kind of ['grunt', 'runner', 'brute', 'boss'] as const) {
    const s = newGame(); s.gold = 10000;
    for (let pad = 0; pad < PADS.length; pad++) build(s, pad, 'arrow');
    startWave(s); s.spawned = s.total; s.hero.cooldown = 10000;
    s.towers.forEach(t => t.cooldown = 10000);
    const start = roadPoint(0);
    const enemy: Enemy = { id: 100, x: start.x, z: start.z, progress: 0, lane: 0.35,
      hp: 100000, maxHp: 100000, speed: 2, kind, slow: 0, reward: 9 };
    s.enemies = [enemy];
    for (let i = 0; i < 6000 && s.phase === 'battle'; i++) {
      update(s, 0.1);
      const center = roadPoint(nearestRoadDistance(enemy));
      assert.ok(Math.hypot(enemy.x - center.x, enemy.z - center.z) <= 0.36);
      for (const pad of PADS) assert.ok(Math.hypot(enemy.x - pad.x, enemy.z - pad.z) >= 2.7 - 1e-8);
      if (enemy.progress! < ROAD_LENGTH) assert.equal(s.hp, 100);
    }
    assert.equal(s.phase, 'ready');
    assert.equal(s.hp, kind === 'boss' ? 70 : kind === 'brute' ? 90 : 95);
  }
});

test('targeting follows road progress even when two enemies share a Z coordinate', () => {
  const s = newGame(); startWave(s); s.spawned = s.total;
  s.hero.x = -6; s.hero.z = -24;
  s.enemies = [6, 10].map((progress, i) => ({ id: 100 + i, ...roadPoint(progress), progress,
    hp: 1000, maxHp: 1000, speed: 1, kind: 'grunt' as const, slow: 0, reward: 9 }));
  update(s, 0);
  assert.equal(s.shots[0].tx, roadPoint(10).x);
});

test('legacy saves keep money, waves, tower levels and active enemies on the new map', () => {
  const old = { ...newGame(), version: 1, gold: 321, wave: 7, phase: 'battle',
    hero: { x: -5, z: 2, cooldown: 0 },
    towers: [{ pad: 0, kind: 'arrow', level: 3, cooldown: 1 }, { pad: 7, kind: 'cannon', level: 2, cooldown: 0 }],
    enemies: [{ id: 10, x: 5, z: 0, hp: 77, maxHp: 100, speed: 0.8, kind: 'boss', slow: 0, reward: 110 }] };
  const s = restore(JSON.stringify(old))!;
  assert.ok(s); assert.equal(s.version, 3); assert.equal(s.gold, 321); assert.equal(s.wave, 7);
  assert.deepEqual(s.towers.map(t => [t.pad, t.level]), [[0, 3], [21, 2]]);
  assert.equal(s.enemies[0].hp, 77);
  const center = roadPoint(nearestRoadDistance(s.enemies[0]));
  assert.ok(Math.hypot(s.enemies[0].x - center.x, s.enemies[0].z - center.z) < ROAD_HALF_WIDTH);
  assert.deepEqual(restore(serialize(s)), s);
});

test('movement and new structures keep the resident within the larger neighborhood', () => {
  const s = newGame(); s.gold = 10000;
  for (let pad = 0; pad < PADS.length; pad++) build(s, pad, 'cannon');
  for (let i = 0; i < 800; i++) {
    update(s, i === 0 ? 10 : 0.1, { x: Math.sin(i * 0.23), z: Math.cos(i * 0.17) });
    assert.ok(s.hero.x >= MAP_BOUNDS.minX + 2 && s.hero.x <= MAP_BOUNDS.maxX - 2);
    assert.ok(s.hero.z >= MAP_BOUNDS.minZ + 2 && s.hero.z <= HOME.z - 3.8);
    for (const pad of PADS) assert.ok(Math.hypot(s.hero.x - pad.x, s.hero.z - pad.z) >= 2.15 - 1e-8);
  }
});

test("difficulty scales every enemy kind including bosses without extra rewards", () => {
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    const baseline = newGame();
    const scaled = newGame(difficulty);
    baseline.wave = scaled.wave = 4;
    startWave(baseline);
    startWave(scaled);
    const kinds = new Set<string>();
    for (let spawn = 0; spawn < scaled.total; spawn++) {
      baseline.timer = scaled.timer = 0;
      update(baseline, 0.01);
      update(scaled, 0.01);
      const original = baseline.enemies.at(-1)!;
      const enemy = scaled.enemies.at(-1)!;
      kinds.add(enemy.kind);
      const baseHp = (24 + scaled.wave * 7) *
        ({ grunt: 1, runner: 0.7, brute: 2.5, boss: 13 }[enemy.kind]);
      assert.equal(enemy.maxHp, baseHp * { easy: 5, normal: 10, hard: 20 }[difficulty]);
      assert.equal(enemy.hp, enemy.maxHp);
      assert.equal(enemy.speed, original.speed);
      assert.equal(enemy.reward, original.reward);
    }
    assert.equal(kinds.size, 4);
    assert.equal(restore(serialize(scaled))?.difficulty, difficulty);
  }
});

test("legacy saves default to Easy and unknown difficulties are rejected", () => {
  const legacy = JSON.parse(serialize(newGame()));
  delete legacy.difficulty;
  assert.equal(restore(JSON.stringify(legacy))?.difficulty, "easy");
  legacy.difficulty = "extreme";
  assert.equal(restore(JSON.stringify(legacy)), null);
  legacy.difficulty = "toString";
  assert.equal(restore(JSON.stringify(legacy)), null);
});

test("building spends gold exactly once and rejects duplicate/insufficient purchases", () => {
  const s = newGame();
  assert.equal(build(s, 0, "cannon"), true);
  assert.equal(s.gold, 90);
  assert.equal(build(s, 0, "arrow"), false);
  assert.equal(build(s, 1, "frost"), false);
  assert.equal(s.gold, 90);
  assert.equal(build(s, 1, "arrow"), true);
  assert.equal(upgradeTower(s, 1), false);
  assert.equal(s.gold, 20);
});
test("kills reward gold once; breaches damage the gate without rewarding a kill", () => {
  const s = newGame();
  startWave(s);
  s.spawned = s.total;
  s.gold = 0;
  s.enemies = [
    {
      id: 100,
      x: s.hero.x,
      z: s.hero.z,
      hp: 1,
      maxHp: 1,
      speed: 1,
      kind: "grunt",
      slow: 0,
      reward: 9,
    },
  ];
  update(s, 0.05);
  assert.equal(s.kills, 1);
  assert.equal(s.gold, 59);
  assert.equal(s.phase, "ready");
  startWave(s);
  s.spawned = s.total;
  s.hero.cooldown = 100;
  s.enemies = [
    {
      id: 101,
      x: 0,
      z: 26,
      progress: ROAD_LENGTH - 0.01,
      hp: 100,
      maxHp: 100,
      speed: 1,
      kind: "boss",
      slow: 0,
      reward: 110,
    },
  ];
  const gold = s.gold;
  update(s, 0.05);
  assert.equal(s.hp, 70);
  assert.equal(s.kills, 1);
  assert.equal(s.gold, gold + 55);
});
test("skill has a cooldown and pauses progression through final states", () => {
  const s = newGame();
  assert.equal(useSkill(s), false);
  startWave(s);
  assert.equal(useSkill(s), true);
  assert.equal(useSkill(s), false);
  update(s, 0.1);
  assert.ok(s.skillCooldown < 18);
  s.phase = "lost";
  const before = serialize(s);
  update(s, 0.1, { x: 1, z: 0 });
  assert.equal(serialize(s), before);
});
test("saving preserves an active battle and rejects corrupted or incompatible saves", () => {
  const s = newGame();
  build(s, 0, "arrow");
  startWave(s);
  for (let i = 0; i < 30; i++) update(s, 0.1);
  const restored = restore(serialize(s));
  assert.ok(restored);
  assert.deepEqual(restored.enemies, s.enemies);
  assert.equal(restored.wave, 1);
  assert.equal(restored.gold, s.gold);
  assert.equal(restore("{bad"), null);
  assert.equal(restore("{}"), null);
  assert.equal(restore(serialize({ ...s, gold: -1 })), null);
  assert.equal(
    restore(serialize({ ...s, towers: [...s.towers, ...s.towers] })),
    null,
  );
});
test("an undefended kingdom loses and a prepared kingdom can beat all 20 Easy waves", () => {
  const lost = newGame();
  lost.hero.x = 22;
  lost.hero.z = -32;
  startWave(lost);
  for (let i = 0; i < 6000 && lost.phase === "battle"; i++) update(lost, 0.1);
  if (lost.phase === "ready") {
    startWave(lost);
    for (let i = 0; i < 6000 && String(lost.phase) === "battle"; i++)
      update(lost, 0.1);
  }
  assert.equal(lost.phase, "lost");
  const s = newGame();
  s.hero.z = -1;
  const plan = [
    "arrow",
    "arrow",
    "cannon",
    "frost",
    "cannon",
    "arrow",
    "arrow",
    "arrow",
  ] as const;
  for (let wave = 1; wave <= 20; wave++) {
    // This strategy uses only earned gold; construction and upgrades happen between waves.
    for (let pad = 0; pad < PADS.length; pad++) build(s, pad, plan[pad % plan.length]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of [...s.towers].sort((a, b) => a.level - b.level))
        if (t.level < 5 && s.gold >= towerUpgradeCost(t)) {
          upgradeTower(s, t.pad);
          changed = true;
          break;
        }
    }
    if (s.gold >= heroUpgradeCost(s)) upgradeHero(s);
    if (s.hp < 80) repair(s);
    assert.equal(startWave(s), true, `could not start wave ${wave}`);
    for (let i = 0; i < 6000 && s.phase === "battle"; i++) {
      if (
        s.skillCooldown === 0 &&
        s.enemies.some((e) => Math.hypot(e.x - s.hero.x, e.z - s.hero.z) < 6)
      )
        useSkill(s);
      update(s, 0.1);
    }
    assert.notEqual(s.phase, 'lost', `kingdom fell on wave ${wave}`);
    assert.notEqual(s.phase, "battle", `wave ${wave} did not complete`);
  }
  assert.equal(s.phase, "won");
  assert.equal(startWave(s), false);
});

test('clearing the final wave wins and prevents additional waves', () => {
  const s = newGame(); s.wave = 19;
  startWave(s); s.spawned = s.total;
  const position = roadPoint(ROAD_LENGTH - 5);
  s.hero.x = position.x; s.hero.z = position.z;
  s.enemies = [{ id: 100, ...position, progress: ROAD_LENGTH - 5,
    hp: 1, maxHp: 1, speed: 1, kind: 'boss', slow: 0, reward: 110 }];
  update(s, 0);
  assert.equal(s.kills, 1);
  assert.equal(s.phase, 'won');
  assert.equal(startWave(s), false);
});


test('front boundary construction and restore separate the resident from a tower', () => {
  const s = newGame(); s.hero.x = PADS[0].x; s.hero.z = MAP_BOUNDS.minZ + 2;
  assert.equal(build(s, 0, 'arrow'), true);
  assert.ok(Math.hypot(s.hero.x - PADS[0].x, s.hero.z - PADS[0].z) >= 2.15 - 1e-8);
  assert.ok(s.hero.z >= MAP_BOUNDS.minZ + 2);
  s.hero.x = PADS[0].x; s.hero.z = MAP_BOUNDS.minZ + 2;
  const loaded = restore(serialize(s))!;
  assert.ok(Math.hypot(loaded.hero.x - PADS[0].x, loaded.hero.z - PADS[0].z) >= 2.15 - 1e-8);
});
