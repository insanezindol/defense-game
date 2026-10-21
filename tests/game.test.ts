import { test } from "node:test";
import assert from "node:assert/strict";
import {
  build,
  DIFFICULTIES,
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

test("empty build sites stay walkable; completed towers block and allow sliding", () => {
  const s = newGame();
  s.hero = { x: -8, z: -6, cooldown: 0 };
  for (let i = 0; i < 5; i++) update(s, 0.1, { x: 1, z: 0 });
  assert.ok(Math.abs(s.hero.x + 5) < 0.01, 'empty foundation must be traversable');
  assert.equal(build(s, 0, 'arrow'), true);
  assert.ok(Math.hypot(s.hero.x + 5, s.hero.z + 6) >= 2 - 1e-8, 'construction separates an overlapping hero immediately');
  s.hero.x = -8;
  s.hero.z = -6;
  for (let i = 0; i < 20; i++) {
    update(s, 0.1, { x: 1, z: 0 });
    assert.ok(Math.hypot(s.hero.x + 5, s.hero.z + 6) >= 2 - 1e-8);
  }
  assert.ok(s.hero.x <= -7 + 1e-8, 'cannot walk through the tower');
  const before = s.hero.z;
  for (let i = 0; i < 10; i++) update(s, 0.1, { x: 1, z: 1 });
  assert.ok(s.hero.z > before + 1, 'diagonal input slides along the structure');
});

test("constructing around enemies and loading old saves clears tower overlaps", () => {
  const s = newGame();
  s.hero.x = -5; s.hero.z = -6;
  s.enemies = [{ id: 10, x: -5, z: -6, hp: 1000, maxHp: 1000, speed: 1, kind: 'boss', slow: 0, reward: 9 }];
  build(s, 0, 'cannon');
  assert.ok(Math.hypot(s.enemies[0].x + 5, s.enemies[0].z + 6) >= 2.45 - 1e-8);
  s.hero.x = -5; s.hero.z = -6;
  s.enemies[0].x = -5; s.enemies[0].z = -6;
  const loaded = restore(serialize(s))!;
  assert.ok(Math.hypot(loaded.hero.x + 5, loaded.hero.z + 6) >= 2 - 1e-8);
  assert.ok(Math.hypot(loaded.enemies[0].x + 5, loaded.enemies[0].z + 6) >= 2.45 - 1e-8);
});

test("all enemy sizes route around towers instead of clipping or getting stuck", () => {
  for (const [kind, clearance] of [['grunt', 2.1], ['runner', 1.95], ['brute', 2.3], ['boss', 2.7]] as const) {
    const s = newGame();
    s.gold = 10000;
    for (let pad = 0; pad < PADS.length; pad++) build(s, pad, 'arrow');
    startWave(s);
    s.spawned = s.total;
    s.hero.cooldown = 1000;
    s.towers.forEach(t => t.cooldown = 1000);
    const enemy: Enemy = { id: 100, x: -5, z: -10, hp: 100000, maxHp: 100000, speed: 2, kind, slow: 0, reward: 9 };
    s.enemies = [enemy];
    for (let i = 0; i < 500 && s.phase === 'battle'; i++) {
      update(s, 0.1);
      for (const pad of PADS) assert.ok(Math.hypot(enemy.x - pad.x, enemy.z - pad.z) >= clearance - 1e-8, `${kind} clips a tower`);
    }
    assert.equal(s.phase, 'ready', `${kind} must still reach the gate`);
    assert.ok(s.hp < 100, `${kind} must breach rather than disappear`);
  }
});

test("collision keeps the hero in bounds beside outer towers and cannot tunnel on a long frame", () => {
  const s = newGame();
  s.gold = 10000;
  for (let pad = 0; pad < PADS.length; pad++) build(s, pad, 'cannon');
  for (const x of [-12, 12]) {
    s.hero.x = x; s.hero.z = -3;
    for (let i = 0; i < 200; i++) {
      update(s, i === 0 ? 10 : 0.1, { x: Math.sin(i * 0.23), z: Math.cos(i * 0.17) });
      assert.ok(s.hero.x >= -12 && s.hero.x <= 12);
      assert.ok(s.hero.z >= -10 && s.hero.z <= 7.5);
      for (const pad of PADS) assert.ok(Math.hypot(s.hero.x - pad.x, s.hero.z - pad.z) >= 2.15 - 1e-8);
    }
  }
});

test("a boss between adjacent towers is separated immediately when a second tower is built", () => {
  const s = newGame();
  s.gold = 1000;
  build(s, 0, 'arrow');
  s.enemies = [{ id: 10, x: -5, z: -3.5, hp: 1000, maxHp: 1000, speed: 1, kind: 'boss', slow: 0, reward: 9 }];
  build(s, 2, 'arrow');
  for (const tower of s.towers) {
    const pad = PADS[tower.pad];
    assert.ok(Math.hypot(s.enemies[0].x - pad.x, s.enemies[0].z - pad.z) >= 2.7 - 1e-8);
  }
});

test("bosses pass the outside joints of a continuous column of towers", () => {
  for (const side of [-1, 1]) {
    const s = newGame();
    s.gold = 10000;
    for (const pad of side < 0 ? [0, 2, 4] : [1, 3, 5]) build(s, pad, 'arrow');
    startWave(s);
    s.spawned = s.total;
    s.hero.cooldown = 1000;
    s.towers.forEach(t => t.cooldown = 1000);
    const boss: Enemy = { id: 10, x: side * 8.5, z: -12, hp: 100000, maxHp: 100000, speed: 0.8, kind: 'boss', slow: 0, reward: 9 };
    s.enemies = [boss];
    for (let i = 0; i < 1500 && s.phase === 'battle'; i++) {
      update(s, 0.1);
      for (const tower of s.towers) {
        const pad = PADS[tower.pad];
        assert.ok(Math.hypot(boss.x - pad.x, boss.z - pad.z) >= 2.7 - 1e-8);
      }
    }
    assert.equal(s.phase, 'ready', 'boss must not be trapped in a clearance-circle joint');
    assert.equal(s.hp, 70);
  }
});

test("bosses escape narrow diagonal tower junctions, including an old overlapping save", () => {
  for (const side of [-1, 1]) for (const atJoint of [false, true]) {
    const s = newGame();
    s.gold = 1000;
    for (const pad of side < 0 ? [2, 6] : [3, 7]) build(s, pad, 'arrow');
    startWave(s); s.spawned = s.total; s.hero.cooldown = 1000;
    s.towers.forEach(t => t.cooldown = 1000);
    const boss: Enemy = { id: 100, x: side * (atJoint ? 7.42572186472918 : 8.5), z: atJoint ? -2.18569533817705 : -12,
      hp: 100000, maxHp: 100000, speed: 0.8, kind: 'boss', slow: 0, reward: 9 };
    s.enemies = [boss];
    for (let i = 0; i < 1500 && s.phase === 'battle'; i++) {
      update(s, 0.1);
      for (const tower of s.towers) {
        const pad = PADS[tower.pad];
        assert.ok(Math.hypot(boss.x - pad.x, boss.z - pad.z) >= 2.7 - 1e-8);
      }
    }
    assert.equal(s.phase, 'ready'); assert.equal(s.hp, 70);
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
      assert.equal(enemy.maxHp, baseHp * DIFFICULTIES[difficulty].enemyHpMultiplier);
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
      x: 0,
      z: 3,
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
      z: 8.3,
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
test("an undefended kingdom loses and a prepared kingdom can beat all 20 waves", () => {
  const lost = newGame();
  lost.hero.x = 12;
  lost.hero.z = 7;
  startWave(lost);
  for (let i = 0; i < 2000 && lost.phase === "battle"; i++) update(lost, 0.1);
  if (lost.phase === "ready") {
    startWave(lost);
    for (let i = 0; i < 2000 && String(lost.phase) === "battle"; i++)
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
    for (let pad = 0; pad < 8; pad++) build(s, pad, plan[pad]);
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
    for (let i = 0; i < 3000 && s.phase === "battle"; i++) {
      if (
        s.skillCooldown === 0 &&
        s.enemies.some((e) => Math.hypot(e.x - s.hero.x, e.z - s.hero.z) < 6)
      )
        useSkill(s);
      update(s, 0.1);
    }
    assert.notEqual(s.phase, "lost", `kingdom fell on wave ${wave}`);
    assert.notEqual(s.phase, "battle", `wave ${wave} did not complete`);
  }
  assert.equal(s.phase, "won");
  assert.equal(startWave(s), false);
});
