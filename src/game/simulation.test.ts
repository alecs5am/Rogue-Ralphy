import { expect, test } from "bun:test";
import { createGame, setArtifact, spawnDummy, spawnWave, updateGame } from "./simulation";

const idle = { moveX: 0, moveY: 0, aimX: 900, aimY: 270, firing: false, reloadPressed: false, paused: false } as const;

test("one trigger consumes one round and creates combined orbital multishot", () => {
  let game = createGame(() => 0);
  game = setArtifact(setArtifact(game, "twinChamber", 2), "haloChamber", 3);
  game = updateGame(game, { ...idle, firing: true }, 1 / 60, 1);
  expect(game.reload.ammo).toBe(5);
  expect(game.projectiles).toHaveLength(5);
  expect(game.projectiles.every((projectile) => projectile.phase === "orbit")).toBe(true);
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

test("homing ricochet reacquires a live target and freeze survives impact", () => {
  let game = spawnDummy(spawnDummy(createGame(() => 0), { x: 700, y: 200 }), { x: 700, y: 340 });
  game = setArtifact(setArtifact(game, "ghostSight", 2), "pinball", 1);
  game = setArtifact(game, "coldcaster", 4);
  game = updateGame(game, { ...idle, firing: true }, 1 / 60, 1);
  for (let frame = 0; frame < 180; frame += 1) game = updateGame(game, idle, 1 / 60, 1 + frame / 60);
  expect(game.targets.some((target) => target.frozenUntil > 1)).toBe(true);
  expect(game.metrics.hits).toBeGreaterThan(0);
});

test("all artifacts compose and a wave spawns five non-overlapping chasers", () => {
  let game = createGame(() => 0.5);
  for (const id of ["twinChamber", "bigIron", "hollowPoint", "coldcaster", "pinball", "deadeye", "haloChamber", "ghostSight"] as const) {
    game = setArtifact(game, id, 2);
  }
  game = spawnWave(game);
  expect(game.targets.filter((target) => target.kind === "chaser")).toHaveLength(5);
  game = updateGame(game, { ...idle, firing: true }, 1 / 60, 1);
  expect(game.projectiles).toHaveLength(4);
  expect(game.projectiles.every((projectile) => projectile.damage === 34 && projectile.remainingBounces === 2)).toBe(true);
});
