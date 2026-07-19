import { expect, test } from "bun:test";
import { createGame, setArtifact, updateGame } from "./simulation";
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
    child.homingTurnRate > 0 && child.homingRadius > 0 && child.freezeChance > 0 &&
    child.remainingBounces === 1 && child.behaviors.tesla !== undefined && child.behaviors.split === undefined
  )).toBe(true);
});
