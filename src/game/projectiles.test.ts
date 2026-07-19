import { expect, test } from "bun:test";
import { createGame, setArtifact, spawnDummy, updateGame } from "./simulation";
import { splitProjectile } from "./projectiles";
import { segmentCircleHitTime } from "./room";

const idle = { moveX: 0, moveY: 0, aimX: 900, aimY: 270, firing: false, reloadPressed: false, paused: false } as const;

test("segmentCircleHitTime finds a swept hit and rejects a miss", () => {
  expect(segmentCircleHitTime({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 2 }, 3)).toBeCloseTo(0.3882, 3);
  expect(segmentCircleHitTime({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 5 }, 3)).toBeNull();
});

test("Shotgun splits into eight 35 percent pellets with a 128 pixel range", () => {
  let game = setArtifact(createGame(() => 0.9), "shotgun", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const parent = { ...game.projectiles[0]!, travelled: 160 };

  const children = splitProjectile(parent, Array.from({ length: 8 }, (_, index) => `pellet-${index}`));

  expect(children).toHaveLength(8);
  expect(children.every((child) => child.damage === 7 && child.maxTravel === 128 && child.travelled === 0)).toBe(true);
  expect(children.every((child) => child.behaviors.split === undefined)).toBe(true);
  expect(new Set(children.map((child) => Math.round(Math.atan2(child.vy, child.vx) * 1e6))).size).toBe(8);
});

test("Shotgun children inherit compatible effects but cannot split recursively", () => {
  let game = createGame(() => 0.9);
  for (const id of ["spectralBullets", "ghostSight", "coldcaster", "pinball", "teslaBullets", "shotgun"] as const) {
    game = setArtifact(game, id, true);
  }
  game = updateGame(game, { ...idle, firing: true }, 0, 1);

  const children = splitProjectile(game.projectiles[0]!, Array.from({ length: 8 }, (_, index) => `pellet-${index}`));

  expect(children.every((child) =>
    child.penetration?.obstacles === true && child.penetration.targets === true &&
    child.behaviors.homing?.turnRate === 3 * Math.PI && child.behaviors.homing.radius === 96 && child.freezeChance > 0 &&
    child.remainingBounces === 1 && child.behaviors.tesla !== undefined && child.behaviors.split === undefined
  )).toBe(true);
});

test("Halo keeps its muzzle origin, expands 48 pixels per second, and expires at four seconds", () => {
  let game = setArtifact(createGame(() => 0.9), "haloChamber", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const projectile = game.projectiles[0]!;

  game = updateGame(game, idle, 0.1, 1.1);

  expect(projectile.spiralOrigin).toEqual(game.projectiles[0]?.spiralOrigin);
  expect(game.projectiles[0]?.spiralRadius).toBeCloseTo(28.8);
  expect(game.projectiles[0]!.spiralAngle! - projectile.spiralAngle!).toBeCloseTo(Math.PI * 0.3);
  expect(projectile.lifetime).toBe(4);
});

test("Ghost Sight acquires across the swept segment and retains the lock", () => {
  let game = spawnDummy(setArtifact(createGame(() => 0.9), "ghostSight", true), { x: 320, y: 395 });
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  game = {
    ...game,
    projectiles: game.projectiles.map((projectile) => ({ ...projectile, x: 200, y: 300, vx: 620, vy: 0 })),
  };

  game = updateGame(game, idle, 0.2, 1.2);

  expect(game.projectiles[0]?.homingTargetId).toBe("dummy-1");
  expect(Math.atan2(game.projectiles[0]!.vy, game.projectiles[0]!.vx)).toBeGreaterThan(0);
  game = { ...game, targets: game.targets.map((target) => ({ ...target, x: 700, y: 400 })) };
  game = updateGame(game, idle, 0.01, 1.21);
  expect(game.projectiles[0]?.homingTargetId).toBe("dummy-1");
});

test("Halo Shotgun children start together and vary their spiral angular speeds", () => {
  let game = setArtifact(setArtifact(createGame(() => 0.9), "haloChamber", true), "shotgun", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const parent = game.projectiles[0]!;

  const children = splitProjectile(parent, Array.from({ length: 8 }, (_, index) => `pellet-${index}`));

  expect(children.every((child) =>
    child.x === parent.x && child.y === parent.y && child.spiralOrigin === parent.spiralOrigin
  )).toBe(true);
  expect(new Set(children.map((child) => child.spiralAngularSpeed)).size).toBe(8);
});
