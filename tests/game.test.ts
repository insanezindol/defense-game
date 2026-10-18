import { test } from "node:test";
import assert from "node:assert/strict";
import {
  build,
  DIFFICULTIES,
  heroUpgradeCost,
  newGame,
  repair,
  restore,
  serialize,
  startWave,
  towerUpgradeCost,
  update,
  upgradeHero,
  upgradeTower,
  useSkill,
} from "../src/game";

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
