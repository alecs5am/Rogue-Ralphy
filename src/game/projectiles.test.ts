import { expect, test } from "bun:test";
import { createGame, setArtifact, spawnDummy, updateGame } from "./simulation";
import { advanceTrajectory, buildTeslaLinks, splitProjectile, type ProjectileState, type TeslaBehavior } from "./projectiles";
import { segmentCircleHitTime } from "./room";

const idle = { moveX: 0, moveY: 0, aimX: 900, aimY: 270, firing: false, reloadPressed: false, paused: false } as const;

const teslaProjectile = (
  id: string,
  x: number,
  y: number,
  damage: number,
  triggerId = id,
  tesla: TeslaBehavior = { radius: 96, neighbors: 2, damageScale: 0.25, cooldown: 0.15 },
): ProjectileState => ({
  id, triggerId, x, y, damage, vx: 0, vy: 0, speed: 0, radius: 6, lifetime: 8, bornAt: 0,
  remainingBounces: 0, bounceRetention: 1, freezeChance: 0, freezeDuration: 0,
  behaviors: { tesla },
  hitTargetIds: [], everHit: false, travelled: 0,
});

test("Tesla links each projectile to at most two nearest neighbors within 96 pixels", () => {
  const links = buildTeslaLinks([
    teslaProjectile("a", 0, 0, 20, "first"),
    teslaProjectile("b", 30, 0, 20, "second"),
    teslaProjectile("c", 60, 0, 10, "third"),
    teslaProjectile("d", 200, 0, 20, "fourth"),
  ]);
  const degrees = new Map<string, number>();
  for (const { a, b } of links) {
    degrees.set(a, (degrees.get(a) ?? 0) + 1);
    degrees.set(b, (degrees.get(b) ?? 0) + 1);
  }

  expect(links.every(({ distance }) => distance <= 96)).toBe(true);
  expect(new Set(links.map(({ id }) => id)).size).toBe(links.length);
  expect([...degrees.values()].every((degree) => degree <= 2)).toBe(true);
  expect(links.some(({ a, b }) => a === "d" || b === "d")).toBe(false);
  expect(links.map(({ id }) => id)).toEqual(["a:b", "b:c", "a:c"]);
});

test("Tesla links use endpoint radii, neighbor caps, damage scale, and cooldown", () => {
  const behavior = (overrides: Partial<TeslaBehavior>): TeslaBehavior => ({
    radius: 100, neighbors: 3, damageScale: 0.4, cooldown: 0.1, ...overrides,
  });
  expect(buildTeslaLinks([
    teslaProjectile("short", 0, 0, 20, "short", behavior({ radius: 50 })),
    teslaProjectile("far", 60, 0, 20, "far", behavior({ radius: 100 })),
  ])).toEqual([]);

  const links = buildTeslaLinks([
    teslaProjectile("a", 0, 0, 20, "a", behavior({ neighbors: 1, damageScale: 0.4, cooldown: 0.1 })),
    teslaProjectile("b", 10, 0, 20, "b", behavior({ damageScale: 0.2, cooldown: 0.35 })),
    teslaProjectile("c", 20, 0, 20, "c", behavior({ damageScale: 0.3, cooldown: 0.2 })),
  ]);

  expect(links.map(({ id }) => id)).toEqual(["a:b", "b:c"]);
  expect(links[0]).toMatchObject({ damageScale: 0.2, cooldown: 0.35 });
});

test("segmentCircleHitTime finds a swept hit and rejects a miss", () => {
  expect(segmentCircleHitTime({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 2 }, 3)).toBeCloseTo(0.3882, 3);
  expect(segmentCircleHitTime({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 5 }, 3)).toBeNull();
});

test("Shotgun splits into eight smaller pellets across a 48 degree forward cone", () => {
  let game = setArtifact(createGame(() => 0.9), "shotgun", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const parent = { ...game.projectiles[0]!, travelled: 160 };
  const children = splitProjectile(parent, Array.from({ length: 8 }, (_, index) => `pellet-${index}`));
  const degrees = Math.PI / 180;
  const parentHeading = Math.atan2(parent.vy, parent.vx);

  expect(children).toHaveLength(8);
  children.forEach((child, index) => {
    const childHeading = Math.atan2(child.vy, child.vx);
    const relative = Math.atan2(Math.sin(childHeading - parentHeading), Math.cos(childHeading - parentHeading));
    expect(relative).toBeCloseTo((-24 + index * 48 / 7) * degrees);
    expect(Math.cos(relative)).toBeGreaterThan(0);
    expect(child).toMatchObject({ damage: 5, radius: 2.75, maxTravel: 320, travelled: 0 });
    expect(child.behaviors.split).toBeUndefined();
  });
});

const pelletFor = (ids: readonly ("shotgun" | "bigIron" | "hollowPoint")[]) => {
  let game = createGame(() => 0.9);
  for (const id of ids) game = setArtifact(game, id, true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  return splitProjectile(game.projectiles[0]!, ["pellet"])[0]!;
};

test.each([
  [["shotgun"], 2.75, 5],
  [["shotgun", "bigIron"], 3.4375, 5],
  [["shotgun", "hollowPoint"], 2.75, 6.75],
] as const)("Shotgun scales the current parent for %o", (ids, radius, damage) => {
  const pellet = pelletFor(ids);
  expect(pellet.radius).toBeCloseTo(radius);
  expect(pellet.damage).toBeCloseTo(damage);
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

test("Shotgun children identify each splitting parent and keep its fixed split origin", () => {
  let game = setArtifact(createGame(() => 0.9), "shotgun", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const firstParent = game.projectiles[0]!;
  const secondParent = { ...firstParent, id: "projectile-other", x: firstParent.x + 12, y: firstParent.y + 8 };

  const children = [firstParent, secondParent].flatMap((parent, parentIndex) =>
    splitProjectile(parent, Array.from({ length: 8 }, (_, index) => `pellet-${parentIndex}-${index}`))
  );

  expect(new Set(children.map(({ splitParentId }) => splitParentId))).toEqual(
    new Set([firstParent.id, secondParent.id]),
  );
  expect(children.slice(0, 8).every(({ splitOrigin }) =>
    splitOrigin?.x === firstParent.x && splitOrigin.y === firstParent.y
  )).toBe(true);
  expect(children.slice(8).every(({ splitOrigin }) =>
    splitOrigin?.x === secondParent.x && splitOrigin.y === secondParent.y
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

test("Ghost Sight breaks equal-distance acquisition ties by stable target ID", () => {
  let game = setArtifact(createGame(() => 0.9), "ghostSight", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const projectile = { ...game.projectiles[0]!, x: 200, y: 300, vx: 620, vy: 0 };

  const acquired = advanceTrajectory(projectile, [
    { id: "dummy-z", x: 300, y: 350, health: 1 },
    { id: "dummy-a", x: 300, y: 250, health: 1 },
  ], 0.2);

  expect(acquired.homingTargetId).toBe("dummy-a");
});

test("Ghost Sight shows a brief acquisition marker without dropping its lock", () => {
  let game = setArtifact(createGame(() => 0.9), "ghostSight", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const target = { id: "dummy-1", x: 300, y: 250, health: 1 };
  const projectile = { ...game.projectiles[0]!, x: 200, y: 300, vx: 620, vy: 0 };

  const acquired = advanceTrajectory(projectile, [target], 0.1);
  const settled = advanceTrajectory(acquired, [target], 0.2);

  expect(acquired.homingMarkerRemaining).toBeGreaterThan(0);
  expect(settled.homingMarkerRemaining).toBe(0);
  expect(settled.homingTargetId).toBe(target.id);
});

test("Halo Shotgun launches a forward cone before resuming the fixed-origin spiral", () => {
  let game = setArtifact(setArtifact(createGame(() => 0.9), "haloChamber", true), "shotgun", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const parent = game.projectiles[0]!;
  const children = splitProjectile(parent, Array.from({ length: 8 }, (_, index) => `pellet-${index}`));
  const parentHeading = Math.atan2(parent.vy, parent.vx);
  const relative = (heading: number) =>
    Math.atan2(Math.sin(heading - parentHeading), Math.cos(heading - parentHeading));

  expect(children.every((child) =>
    child.x === parent.x && child.y === parent.y && child.spiralOrigin === parent.spiralOrigin
  )).toBe(true);
  children.forEach((child, index) => {
    expect(relative(Math.atan2(child.vy, child.vx)))
      .toBeCloseTo((-24 + index * 48 / 7) * Math.PI / 180);
  });
  expect(new Set(children.map((child) => child.spiralAngularSpeed)).size).toBe(8);

  const advanced = children.map((child) => advanceTrajectory(child, [], 0.01));
  advanced.forEach((child, index) => {
    const dx = child.x - children[index]!.x;
    const dy = child.y - children[index]!.y;
    expect(relative(Math.atan2(dy, dx)))
      .toBeCloseTo((-24 + index * 48 / 7) * Math.PI / 180);
    expect(child.spiralOrigin).toBe(parent.spiralOrigin);
  });

  const continued = advanced.map((child) => advanceTrajectory(child, [], 0.01));
  expect(continued.every((child, index) =>
    child.spiralOrigin === parent.spiralOrigin && child.spiralRadius! > advanced[index]!.spiralRadius!
  )).toBe(true);
});

test("Halo physical position stays on its stored spiral radius and angle", () => {
  let game = setArtifact(createGame(() => 0.9), "haloChamber", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);

  game = updateGame(game, idle, 0.1, 1.1);

  const projectile = game.projectiles[0]!;
  expect(projectile.x - projectile.spiralOrigin!.x).toBeCloseTo(Math.cos(projectile.spiralAngle!) * projectile.spiralRadius!);
  expect(projectile.y - projectile.spiralOrigin!.y).toBeCloseTo(Math.sin(projectile.spiralAngle!) * projectile.spiralRadius!);
});

test("Ghost Sight reacquires when its locked target is removed or dead", () => {
  let game = spawnDummy(setArtifact(createGame(() => 0.9), "ghostSight", true), { x: 320, y: 395 });
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  game = {
    ...game,
    projectiles: game.projectiles.map((projectile) => ({ ...projectile, x: 200, y: 300, vx: 620, vy: 0 })),
  };
  game = updateGame(game, idle, 0.2, 1.2);
  expect(game.projectiles[0]?.homingTargetId).toBe("dummy-1");

  const locked = game.targets[0]!;
  const replacement = { ...locked, id: "dummy-2", x: 350, y: 480 };
  const reacquire = (targets: typeof game.targets) => updateGame({ ...game, targets }, idle, 0.1, 1.3);

  expect(reacquire([replacement]).projectiles[0]?.homingTargetId).toBe("dummy-2");
  expect(reacquire([{ ...locked, health: 0 }, replacement]).projectiles[0]?.homingTargetId).toBe("dummy-2");
});
