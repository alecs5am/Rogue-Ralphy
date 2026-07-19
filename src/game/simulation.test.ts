import { expect, test } from "bun:test";
import { clearTargets, createGame, setArtifact, spawnChaser, spawnDummy, spawnWave, updateGame } from "./simulation";

const idle = { moveX: 0, moveY: 0, aimX: 900, aimY: 270, firing: false, reloadPressed: false, paused: false } as const;
const heading = (velocity: { vx: number; vy: number }) => Math.atan2(velocity.vy, velocity.vx);

test("uses a 13 by 7 tile field inside one-tile walls", () => {
  const game = createGame(() => 0);
  expect(game.room).toEqual({ width: 960, height: 576, minX: 64, maxX: 896, minY: 64, maxY: 512 });
  expect(game.room.maxX - game.room.minX).toBe(13 * 64);
  expect(game.room.maxY - game.room.minY).toBe(7 * 64);
  expect(game.player).toMatchObject({ x: 480, y: 288 });
});

test("one trigger consumes one round and orbiters release toward the current aim", () => {
  let game = createGame(() => 0);
  game = setArtifact(setArtifact(game, "twinChamber", true), "haloChamber", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  expect(game.reload.ammo).toBe(5);
  expect(game.projectiles).toHaveLength(2);
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

test("reload intent inside the Deadeye window refills ammo and applies its fire-rate buff", () => {
  let game = setArtifact(createGame(() => 0), "deadeye", true);
  const baseFireRate = game.weapon.fireRate;
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  game = updateGame(game, { ...idle, reloadPressed: true }, 0, 1.1);
  const activeAt = (game.reload.sweetStart + game.reload.sweetEnd) / 2;

  game = updateGame(game, { ...idle, reloadPressed: true }, 0, activeAt);

  expect(game.reload).toMatchObject({ ammo: 6, reloading: false, fireRateBuff: 0.2 });
  expect(game.weapon.fireRate).toBeCloseTo(baseFireRate * 1.2);
});

test("reload intent outside the Deadeye window leaves normal reload intact", () => {
  let game = setArtifact(createGame(() => 0), "deadeye", true);
  const baseFireRate = game.weapon.fireRate;
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  game = updateGame(game, { ...idle, reloadPressed: true }, 0, 1.1);
  const completesAt = game.reload.completesAt;

  game = updateGame(game, { ...idle, reloadPressed: true }, 0, game.reload.sweetStart - 0.01);
  expect(game.reload).toMatchObject({ ammo: 5, reloading: true, completesAt, fireRateBuff: 0 });

  game = updateGame(game, idle, 0, completesAt);
  expect(game.reload).toMatchObject({ ammo: 6, reloading: false, fireRateBuff: 0 });
  expect(game.weapon.fireRate).toBe(baseFireRate);
});

test("one homing ricochet reacquires, loses its target, and records two impacts once for accuracy", () => {
  let game = spawnDummy(createGame(() => 0), { x: 600, y: 270 });
  game = setArtifact(setArtifact(game, "ghostSight", true), "pinball", true);
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

test("Pinball wall bounce retains 90% damage and cleanup consumes the depleted projectile", () => {
  let game = setArtifact(createGame(() => 0), "pinball", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);

  game = updateGame(game, idle, 0.63, 1.63);
  expect(game.projectiles).toHaveLength(1);
  expect(game.projectiles[0]).toMatchObject({ remainingBounces: 0, damage: 18, everHit: false });
  expect(game.projectiles[0]!.vx).toBeLessThan(0);
  expect(game.telemetry.misses).toBe(0);

  game = updateGame(game, idle, 1.34, 2.97);
  expect(game.projectiles).toHaveLength(0);
  expect(game.telemetry).toMatchObject({ successfulProjectiles: 0, misses: 1, accuracy: 0 });
});

test("clearing targets drops per-target metrics but preserves global damage", () => {
  let game = spawnDummy(createGame(() => 0), { x: 600, y: 270 });
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  game = { ...game, projectiles: game.projectiles.map((projectile) => ({ ...projectile, x: 573, y: 270 })) };
  game = updateGame(game, idle, 0.001, 1.001);
  expect(game.telemetry.totalDamage).toBe(20);
  expect(Object.keys(game.telemetry.targets)).toEqual(["dummy-1"]);

  game = clearTargets(game);
  expect(game.telemetry.totalDamage).toBe(20);
  expect(game.telemetry.targets).toEqual({});
});

test("a fatal hit keeps its coordinates after the chaser is removed", () => {
  let game = spawnChaser(createGame(() => 0), { x: 600, y: 270 });
  game = { ...game, targets: game.targets.map((target) => ({ ...target, health: 20, speed: 0 })) };
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  game = { ...game, projectiles: game.projectiles.map((projectile) => ({ ...projectile, x: 577, y: 270 })) };

  game = updateGame(game, idle, 0.001, 1.001);

  expect(game.targets).toHaveLength(0);
  expect(game.metrics.hitEvents.at(-1)).toMatchObject({ targetId: "chaser-1", x: 600, y: 270 });
  expect(game.telemetry).toMatchObject({ totalDamage: 20, kills: 1, targets: {} });
});

test("freeze stops a chaser until its status expires", () => {
  let game = spawnChaser(createGame(() => 0), { x: 600, y: 270 });
  game = setArtifact(game, "coldcaster", true);
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
  for (const target of game.targets) {
    expect(target.x - target.radius).toBeGreaterThanOrEqual(game.room.minX);
    expect(target.x + target.radius).toBeLessThanOrEqual(game.room.maxX);
    expect(target.y - target.radius).toBeGreaterThanOrEqual(game.room.minY);
    expect(target.y + target.radius).toBeLessThanOrEqual(game.room.maxY);
  }
});

test("artifact setter rejects legacy numeric values without changing valid ownership behavior", () => {
  const game = createGame(() => 0);
  expect(() => setArtifact(game, "twinChamber", 2 as unknown as boolean)).toThrow("artifact enabled must be boolean");
  expect(setArtifact(game, "twinChamber", true).artifacts).toEqual({ twinChamber: true });
  expect(setArtifact(setArtifact(game, "twinChamber", true), "twinChamber", false).artifacts).toEqual({});
});

test("player movement clamps its circle within every room boundary", () => {
  const game = createGame(() => 0);
  const cases = [
    { input: { moveX: -1, moveY: 0 }, axis: "x", bound: game.room.minX + game.player.radius },
    { input: { moveX: 1, moveY: 0 }, axis: "x", bound: game.room.maxX - game.player.radius },
    { input: { moveX: 0, moveY: -1 }, axis: "y", bound: game.room.minY + game.player.radius },
    { input: { moveX: 0, moveY: 1 }, axis: "y", bound: game.room.maxY - game.player.radius },
  ] as const;

  for (const { input, axis, bound } of cases) {
    const moved = updateGame(game, { ...idle, ...input }, 10, 10);
    expect(moved.player[axis]).toBe(bound);
  }
});

test("all artifacts compose on every projectile", () => {
  let game = createGame(() => 0.5);
  for (const id of ["twinChamber", "bigIron", "hollowPoint", "coldcaster", "pinball", "deadeye", "haloChamber", "ghostSight"] as const) {
    game = setArtifact(game, id, true);
  }
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  expect(game.projectiles).toHaveLength(2);
  expect(game.projectiles.every((projectile) => projectile.damage === 27 && projectile.remainingBounces === 1)).toBe(true);
});

test("taking an owned artifact again cannot strengthen it", () => {
  let game = setArtifact(createGame(() => 0), "hollowPoint", true);
  const damage = game.weapon.damage;
  game = setArtifact(game, "hollowPoint", true);
  expect(game.weapon.damage).toBe(damage);
  expect(game.artifacts).toEqual({ hollowPoint: true });

  game = setArtifact(game, "hollowPoint", false);
  expect(game.weapon.damage).toBe(20);
  expect(game.artifacts).toEqual({});
});

test("pause preserves simulation state", () => {
  const game = createGame(() => 0);
  const paused = updateGame(game, { ...idle, moveX: 1, firing: true, paused: true }, 2, 100);
  expect(paused).toMatchObject({ player: game.player, reload: game.reload, metrics: game.metrics, time: game.time, paused: true });
  expect(paused.projectiles).toEqual([]);
  expect(updateGame(paused, { ...idle, paused: true }, 2, 102)).toBe(paused);
});

test("chaser contact damage respects the half-second invulnerability window", () => {
  let game = spawnChaser(createGame(() => 0), { x: 517, y: 288 });
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
