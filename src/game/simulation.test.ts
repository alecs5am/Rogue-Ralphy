import { expect, test } from "bun:test";
import { clearTargets, createGame, setArtifact, spawnChaser, spawnDummy, spawnWave, updateGame } from "./simulation";

const idle = { moveX: 0, moveY: 0, aimX: 900, aimY: 270, firing: false, reloadPressed: false, paused: false } as const;
const heading = (velocity: { vx: number; vy: number }) => Math.atan2(velocity.vy, velocity.vx);

test("one trigger consumes one round and orbiters release toward the current aim", () => {
  let game = createGame(() => 0);
  game = setArtifact(setArtifact(game, "twinChamber", 2), "haloChamber", 3);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  expect(game.reload.ammo).toBe(5);
  expect(game.projectiles).toHaveLength(5);
  expect(game.projectiles.every((projectile) => projectile.phase === "orbit")).toBe(true);

  game = updateGame(game, idle, 0.89, 1.89);
  expect(game.projectiles.every((projectile) => projectile.phase === "orbit")).toBe(true);
  game = updateGame(game, idle, 0.02, 1.91);
  expect(game.projectiles.every((projectile) => projectile.phase === "flight" && projectile.vx > 0)).toBe(true);
});

test("empties six rounds then starts automatic reload", () => {
  let game = createGame(() => 0);
  for (let shot = 0; shot < 6; shot += 1) {
    game = updateGame(game, { ...idle, firing: true }, 1 / 60, shot);
    game = updateGame(game, idle, 0.34, shot + 0.34);
  }
  expect(game.reload.ammo).toBe(0);
  expect(game.reload.reloading).toBe(true);
});

test("one homing ricochet reacquires, loses its target, and records two impacts once for accuracy", () => {
  let game = spawnDummy(createGame(() => 0), { x: 600, y: 270 });
  game = setArtifact(setArtifact(game, "ghostSight", 2), "pinball", 1);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const projectileId = game.projectiles[0]!.id;
  game = { ...game, projectiles: game.projectiles.map((projectile) => ({ ...projectile, x: 573, y: 270, vx: 620, vy: 0 })) };

  game = updateGame(game, idle, 0.001, 1.001);
  expect(game.metrics.hits).toBe(1);
  expect(game.projectiles).toHaveLength(1);
  expect(game.projectiles[0]).toMatchObject({ id: projectileId, remainingBounces: 0, damage: 18, everHit: true });

  const reflectedHeading = heading(game.projectiles[0]!);
  game = updateGame(game, idle, 1 / 60, 1.02);
  const reacquiredHeading = heading(game.projectiles[0]!);
  expect(reacquiredHeading).not.toBeCloseTo(reflectedHeading, 5);

  game = clearTargets(game);
  game = updateGame(game, idle, 1 / 60, 1.04);
  expect(heading(game.projectiles[0]!)).toBeCloseTo(reacquiredHeading, 10);

  game = spawnDummy(game, { x: 700, y: 270 });
  game = { ...game, projectiles: game.projectiles.map((projectile) => ({ ...projectile, x: 673, y: 270, vx: 620, vy: 0 })) };
  game = updateGame(game, idle, 0.001, 1.041);
  expect(game.projectiles).toHaveLength(0);
  expect(game.telemetry).toMatchObject({ hits: 2, successfulProjectiles: 1, misses: 0, accuracy: 1 });
});

test("freeze stops a chaser until its status expires", () => {
  let game = spawnChaser(createGame(() => 0), { x: 600, y: 270 });
  game = setArtifact(game, "coldcaster", 4);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  game = { ...game, projectiles: game.projectiles.map((projectile) => ({ ...projectile, x: 577, y: 270, vx: 620, vy: 0 })) };
  game = updateGame(game, idle, 0.001, 1.001);

  const frozen = game.targets[0]!;
  expect(frozen.frozenUntil).toBeGreaterThan(1.001);
  game = updateGame(game, idle, 0.5, 1.5);
  expect(game.targets[0]!.x).toBeCloseTo(frozen.x, 10);
  game = updateGame(game, idle, 0.1, frozen.frozenUntil + 0.01);
  expect(game.targets[0]!.x).toBeLessThan(frozen.x);
});

test("wave uses one RNG sample and creates five non-overlapping chasers", () => {
  let rngCalls = 0;
  const rng = () => { rngCalls += 1; return 0.5; };
  expect(spawnChaser(createGame(rng), { x: 100, y: 270 }).targets).toHaveLength(1);
  expect(rngCalls).toBe(0);

  let game = createGame(rng);
  game = spawnWave(game);
  expect(rngCalls).toBe(1);
  expect(game.targets).toHaveLength(5);
  for (let first = 0; first < game.targets.length; first += 1) {
    for (let second = first + 1; second < game.targets.length; second += 1) {
      const a = game.targets[first]!;
      const b = game.targets[second]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius);
    }
  }
});

test("all artifacts compose on every projectile", () => {
  let game = createGame(() => 0.5);
  for (const id of ["twinChamber", "bigIron", "hollowPoint", "coldcaster", "pinball", "deadeye", "haloChamber", "ghostSight"] as const) {
    game = setArtifact(game, id, 2);
  }
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  expect(game.projectiles).toHaveLength(4);
  expect(game.projectiles.every((projectile) => projectile.damage === 34 && projectile.remainingBounces === 2)).toBe(true);
});

test("pause preserves simulation state", () => {
  const game = createGame(() => 0);
  const paused = updateGame(game, { ...idle, moveX: 1, firing: true, paused: true }, 2, 100);
  expect(paused).toMatchObject({ player: game.player, reload: game.reload, metrics: game.metrics, time: game.time, paused: true });
  expect(paused.projectiles).toEqual([]);
  expect(updateGame(paused, { ...idle, paused: true }, 2, 102)).toBe(paused);
});

test("chaser contact damage respects the half-second invulnerability window", () => {
  let game = spawnChaser(createGame(() => 0), { x: 517, y: 270 });
  game = updateGame(game, idle, 0.02, 1);
  expect(game.player).toMatchObject({ health: 90, invulnerableUntil: 1.5 });
  game = updateGame(game, idle, 0, 1.2);
  expect(game.player.health).toBe(90);
  game = updateGame(game, idle, 0, 1.5);
  expect(game.player.health).toBe(80);
});

test("an active projectile is not a miss until lifetime cleanup resolves it", () => {
  let game = updateGame(createGame(() => 0), { ...idle, firing: true }, 0, 1);
  expect(game.projectiles).toHaveLength(1);
  expect(game.telemetry).toMatchObject({ successfulProjectiles: 0, misses: 0, accuracy: 0 });

  game = updateGame(game, idle, 0, 9);
  expect(game.projectiles).toHaveLength(0);
  expect(game.telemetry).toMatchObject({ successfulProjectiles: 0, misses: 1, accuracy: 0 });
});
