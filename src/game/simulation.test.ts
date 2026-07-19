import { expect, test } from "bun:test";
import { ARTIFACT_CATALOG } from "./artifacts";
import { clampResource, clearTargets, createGame, resetLab, setArtifact, spawnChaser, spawnDummy, spawnWave, updateGame } from "./simulation";
import { ROOM_PROPS } from "./room";

const idle = { moveX: 0, moveY: 0, aimX: 900, aimY: 270, firing: false, reloadPressed: false, paused: false } as const;
const heading = (velocity: { vx: number; vy: number }) => Math.atan2(velocity.vy, velocity.vx);
const playerSpeed = (game: ReturnType<typeof createGame>) => Math.hypot(game.player.vx, game.player.vy);
const STEP = 1 / 120;
const moveForTicks = (
  game: ReturnType<typeof createGame>,
  input: Parameters<typeof updateGame>[1],
  ticks: number,
) => {
  for (let tick = 0; tick < ticks; tick += 1) game = updateGame(game, input, STEP, game.time + STEP);
  return game;
};

test("starts HUD resources at zero", () => {
  expect(createGame().resources).toEqual({ coins: 0, bombs: 0, keys: 0 });
});

test("clamps HUD resources to integer values from zero through 99", () => {
  expect([-1, 0, 12.9, 99, 100].map(clampResource)).toEqual([0, 0, 12, 99, 99]);
});

test("Tesla Shotgun Spectral Halo and Ghost compose in one deterministic trigger", () => {
  const cover = ROOM_PROPS.find(({ id }) => id === "labMarker")!;
  let game = spawnDummy(createGame(() => 0.32), { x: cover.x, y: cover.y + 104 });
  const dummyNearCover = game.targets[0]!;
  for (const id of ["teslaBullets", "shotgun", "spectralBullets", "haloChamber", "ghostSight"] as const) {
    game = setArtifact(game, id, true);
  }
  const aim = { ...idle, aimX: dummyNearCover.x, aimY: dummyNearCover.y };

  const afterTrigger = updateGame(game, { ...aim, firing: true }, 0, 1);
  let afterBloom = afterTrigger;
  for (let tick = 0; tick < 0.5 / STEP; tick += 1) afterBloom = updateGame(afterBloom, aim, STEP, afterBloom.time + STEP);

  expect(afterTrigger.projectiles).toHaveLength(2);
  expect(afterTrigger.reload.ammo).toBe(5);
  expect(afterBloom.projectiles.length).toBeGreaterThanOrEqual(8);
  expect(afterBloom.projectiles.every(({ behaviors, penetration }) =>
    behaviors.split === undefined && behaviors.tesla !== undefined && behaviors.homing !== undefined &&
    penetration?.obstacles === true && penetration.targets === true
  )).toBe(true);
  expect(afterBloom.projectiles.some(({ homingTargetId }) => homingTargetId === dummyNearCover.id)).toBe(true);
  expect(afterBloom.teslaLinks.length).toBeGreaterThan(0);
  expect(afterBloom.telemetry.totalDamage).toBeGreaterThan(0);
});

function fireThroughRock(game: ReturnType<typeof createGame>, artifacts: { spectralBullets?: true; pinball?: true }) {
  for (const id of Object.keys(artifacts) as (keyof typeof artifacts)[]) game = setArtifact(game, id, true);
  const rock = ROOM_PROPS.find((prop) => prop.id === "rock")!;
  const aim = { ...idle, aimX: rock.x, aimY: rock.y, firing: true };
  game = updateGame(game, aim, 0, 1);
  return updateGame(game, { ...idle, aimX: rock.x, aimY: rock.y }, 0.6, 1.6);
}

function teslaArcAcrossDummy(endpointDamage: readonly [number, number] = [20, 20]) {
  let game = spawnDummy(createGame(() => 0.9), { x: 600, y: 270 });
  game = setArtifact(setArtifact(game, "twinChamber", true), "teslaBullets", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  return {
    ...game,
    projectiles: game.projectiles.map((projectile, index) => ({
      ...projectile, x: index === 0 ? 560 : 640, y: 270, vx: 0, vy: 0, damage: endpointDamage[index]!,
    })),
  };
}

test("normal projectile dies on the rock while spectral and Pinball continue", () => {
  const normal = fireThroughRock(createGame(() => 0.9), {});
  const spectral = fireThroughRock(createGame(() => 0.9), { spectralBullets: true });
  const pinball = fireThroughRock(createGame(() => 0.9), { pinball: true });
  expect(normal.projectiles).toHaveLength(0);
  expect(spectral.projectiles).toHaveLength(1);
  expect(pinball.projectiles[0]?.remainingBounces).toBe(0);
  expect(pinball.projectiles[0]?.vx).toBeGreaterThan(0);
});

test("Spectral projectile damages two swept targets once each and keeps flying", () => {
  let game = spawnDummy(createGame(() => 0.9), { x: 600, y: 270 });
  game = spawnDummy(game, { x: 700, y: 270 });
  game = setArtifact(game, "spectralBullets", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);

  game = updateGame(game, idle, 0.5, 1.5);

  expect(game.metrics.hits).toBe(2);
  expect(game.projectiles).toHaveLength(1);
  expect(game.projectiles[0]?.hitTargetIds).toEqual(["dummy-1", "dummy-2"]);
  game = updateGame(game, idle, 0, 1.5);
  expect(game.metrics.hits).toBe(2);
});

test("Tesla deals 25 percent of the lower endpoint damage on a 150ms cooldown", () => {
  const game = teslaArcAcrossDummy([20, 8]);

  const first = updateGame(game, idle, 0, 1);
  const blocked = updateGame(first, idle, 0, 1.1);
  const ready = updateGame(blocked, idle, 0, 1.16);

  expect(first.telemetry.totalDamage).toBe(2);
  expect(first.metrics.hitEvents[0]).toMatchObject({
    source: "tesla", artifactId: "teslaBullets", targetId: "dummy-1", x: 600, y: 270,
  });
  expect(blocked.telemetry.totalDamage).toBe(2);
  expect(ready.telemetry.totalDamage).toBe(4);
  expect(ready.telemetry).toMatchObject({ hits: 0, secondaryHits: 2, successfulProjectiles: 0 });
});

test("Tesla resolution uses conservative non-default endpoint damage and cooldown descriptors", () => {
  const base = teslaArcAcrossDummy([20, 10]);
  const game = {
    ...base,
    projectiles: base.projectiles.map((projectile, index) => ({
      ...projectile,
      behaviors: {
        ...projectile.behaviors,
        tesla: {
          radius: 120,
          neighbors: 3,
          damageScale: index === 0 ? 0.4 : 0.3,
          cooldown: index === 0 ? 0.2 : 0.4,
        },
      },
    })),
  };

  const first = updateGame(game, idle, 0, 1);
  const blocked = updateGame(first, idle, 0, 1.39);
  const ready = updateGame(blocked, idle, 0, 1.41);

  expect(first.teslaLinks[0]).toMatchObject({ damageScale: 0.3, cooldown: 0.4 });
  expect([first, blocked, ready].map(({ telemetry }) => telemetry.totalDamage)).toEqual([3, 3, 6]);
});

test("Tesla stores current links and prunes expired cooldowns after an endpoint disappears", () => {
  const game = teslaArcAcrossDummy();

  const linked = updateGame(game, idle, 0, 1);
  expect(linked.teslaLinks).toHaveLength(1);
  expect(Object.keys(linked.teslaCooldowns)).toHaveLength(1);

  const disconnected = updateGame({ ...linked, projectiles: [] }, idle, 0, 1.16);
  expect(disconnected.teslaLinks).toEqual([]);
  expect(disconnected.teslaCooldowns).toEqual({});
});

test("Shotgun splits at the exact travelled distance without consuming another cartridge", () => {
  let game = setArtifact(createGame(() => 0.9), "shotgun", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const start = { x: game.projectiles[0]!.x, y: game.projectiles[0]!.y };

  game = updateGame(game, idle, 161 / game.weapon.speed, 1 + 161 / game.weapon.speed);

  expect(game.projectiles).toHaveLength(8);
  expect(game.projectiles.every((projectile) => projectile.x === game.projectiles[0]!.x && projectile.y === game.projectiles[0]!.y)).toBe(true);
  expect(Math.hypot(game.projectiles[0]!.x - start.x, game.projectiles[0]!.y - start.y)).toBeCloseTo(160, 10);
  expect(game.projectiles.every((projectile) => projectile.maxTravel === 128 && projectile.behaviors.split === undefined)).toBe(true);
  expect(game.reload.ammo).toBe(5);
  expect(game.metrics).toMatchObject({ triggers: 1, projectiles: 9 });

  game = updateGame(game, idle, 129 / game.weapon.speed, game.time + 129 / game.weapon.speed);
  expect(game.projectiles).toHaveLength(0);
  expect(game.metrics.misses).toBe(8);
});

test("a swept target before the Shotgun threshold is hit before splitting", () => {
  let game = spawnDummy(createGame(() => 0.9), { x: 600, y: 270 });
  game = setArtifact(game, "shotgun", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);

  game = updateGame(game, idle, 0.3, 1.3);

  expect(game.metrics.hits).toBe(1);
  expect(game.projectiles).toHaveLength(0);
});

test("Spectral hits before the Shotgun threshold and then splits in the same swept segment", () => {
  let game = spawnDummy(createGame(() => 0.9), { x: 600, y: 270 });
  game = setArtifact(setArtifact(game, "spectralBullets", true), "shotgun", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);

  game = updateGame(game, idle, 0.3, 1.3);

  expect(game.metrics.hits).toBe(1);
  expect(game.projectiles).toHaveLength(8);
  expect(game.projectiles.every((projectile) => projectile.behaviors.split === undefined && projectile.penetration?.targets)).toBe(true);
});

test("Halo path counts toward the Shotgun split distance without teleporting children", () => {
  let game = setArtifact(setArtifact(createGame(() => 0.9), "haloChamber", true), "shotgun", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);

  let parentBeforeSplit = game.projectiles[0]!;
  while (game.projectiles.length === 1) {
    parentBeforeSplit = game.projectiles[0]!;
    game = moveForTicks(game, idle, 1);
  }

  expect(parentBeforeSplit.travelled).toBeLessThan(160);
  expect(game.projectiles).toHaveLength(8);
  expect(game.projectiles.every((projectile) =>
    projectile.x === game.projectiles[0]!.x && projectile.y === game.projectiles[0]!.y && projectile.travelled === 0
  )).toBe(true);
  expect(game.projectiles.every((projectile) =>
    Math.abs(projectile.x - projectile.spiralOrigin!.x - Math.cos(projectile.spiralAngle!) * projectile.spiralRadius!) < 1e-10 &&
    Math.abs(projectile.y - projectile.spiralOrigin!.y - Math.sin(projectile.spiralAngle!) * projectile.spiralRadius!) < 1e-10
  )).toBe(true);
  expect(new Set(game.projectiles.map((projectile) => projectile.spiralAngularSpeed)).size).toBe(8);
});

test("moving Ralphy and changing aim cannot move a Halo origin", () => {
  let game = setArtifact(createGame(() => 0.9), "haloChamber", true);
  game = updateGame(game, { ...idle, aimX: 800, aimY: 300, firing: true }, 0, 1);
  const origin = game.projectiles[0]?.spiralOrigin;
  expect(origin).toBeDefined();

  game = updateGame(
    { ...game, player: { ...game.player, x: game.player.x + 100 } },
    { ...idle, aimX: 100, aimY: 100 },
    0.1,
    1.1,
  );

  expect(game.projectiles[0]?.spiralOrigin).toEqual(origin);
});

test("physical collision wins a floating-point tie with a diagonal Shotgun split", () => {
  const angle = Math.PI / 3;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  let game = createGame(() => 0.9);
  game = spawnDummy(game, {
    x: game.player.x + direction.x * 212,
    y: game.player.y + direction.y * 212,
  });
  game = setArtifact(game, "shotgun", true);
  const aim = {
    ...idle,
    aimX: game.player.x + direction.x * 100,
    aimY: game.player.y + direction.y * 100,
  };
  game = updateGame(game, { ...aim, firing: true }, 0, 1);

  game = updateGame(game, aim, 161 / game.weapon.speed, 1 + 161 / game.weapon.speed);

  expect(game.metrics.hits).toBe(1);
  expect(game.projectiles).toHaveLength(0);
});

test("equal-time target collisions use stable target IDs instead of array order", () => {
  const target = (id: string) => ({
    id, kind: "dummy" as const, x: 600, y: 288, radius: 22,
    health: Number.POSITIVE_INFINITY, maxHealth: Number.POSITIVE_INFINITY,
    speed: 0, frozenUntil: 0,
  });
  const firstHit = (targets: ReturnType<typeof target>[]) => {
    let game: ReturnType<typeof createGame> = { ...createGame(() => 0.9), targets };
    game = updateGame(game, { ...idle, aimX: 900, aimY: 288, firing: true }, 0, 1);
    return updateGame(game, idle, 0.3, 1.3).metrics.hitEvents[0]?.targetId;
  };

  expect(firstHit([target("dummy-z"), target("dummy-a")])).toBe("dummy-a");
  expect(firstHit([target("dummy-a"), target("dummy-z")])).toBe("dummy-a");
});

test("equal-time prop collisions use stable prop IDs instead of array order", () => {
  const props = ROOM_PROPS as unknown as Array<{
    id: string; kind: "rock" | "crate" | "labMarker";
    x: number; y: number; size: number; collisionRadius: number;
  }>;
  const originalOrder = [...props];
  const originalValues = props.map((prop) => ({ ...prop }));
  let velocities: number[] = [];
  try {
    Object.assign(props.find(({ id }) => id === "rock")!, { x: 600, y: 278, collisionRadius: 20 });
    Object.assign(props.find(({ id }) => id === "crate")!, { x: 600, y: 298, collisionRadius: 20 });
    const collide = () => {
      let game = setArtifact(createGame(() => 0.9), "pinball", true);
      game = updateGame(game, { ...idle, aimX: 900, aimY: 288, firing: true }, 0, 1);
      return updateGame(game, idle, 0.3, 1.3).projectiles[0]?.vy ?? 0;
    };
    velocities = [collide()];
    props.reverse();
    velocities.push(collide());
  } finally {
    props.splice(0, props.length, ...originalOrder);
    props.forEach((prop, index) => Object.assign(prop, originalValues[index]));
  }

  expect(Math.sign(velocities[0]!)).toBe(Math.sign(velocities[1]!));
});

test("uses a 13 by 7 tile field inside one-tile walls", () => {
  const game = createGame(() => 0);
  expect(game.room).toEqual({ width: 960, height: 576, minX: 64, maxX: 896, minY: 64, maxY: 512 });
  expect(game.room.maxX - game.room.minX).toBe(13 * 64);
  expect(game.room.maxY - game.room.minY).toBe(7 * 64);
  expect(game.player).toMatchObject({ x: 480, y: 288 });
});

test("one trigger consumes one round and Halo projectiles keep spiraling", () => {
  let game = createGame(() => 0);
  game = setArtifact(setArtifact(game, "twinChamber", true), "haloChamber", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  expect(game.reload.ammo).toBe(5);
  expect(game.projectiles).toHaveLength(2);
  const origins = game.projectiles.map((projectile) => projectile.spiralOrigin);

  game = moveForTicks(game, idle, 109);
  expect(game.projectiles).toHaveLength(2);
  expect(game.projectiles.every((projectile, index) =>
    projectile.behaviors.spiral !== undefined && projectile.spiralOrigin === origins[index] && projectile.spiralRadius! > 24
  )).toBe(true);
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

test("a Halo Pinball bounce continues as ordinary reflected flight", () => {
  let game = setArtifact(setArtifact(createGame(() => 0.9), "haloChamber", true), "pinball", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 0);
  game = {
    ...game,
    projectiles: game.projectiles.map((projectile) => ({
      ...projectile,
      x: 890,
      y: 240,
      spiralOrigin: Object.freeze({ x: 890, y: 300 }),
      spiralRadius: 60,
      spiralAngle: -Math.PI / 2,
    })),
  };

  game = updateGame(game, idle, STEP, STEP);
  const reflected = game.projectiles[0]!;
  expect(reflected.remainingBounces).toBe(0);
  expect(reflected.vx).toBeLessThan(0);
  expect(reflected.behaviors.spiral).toBeUndefined();

  game = updateGame(game, idle, STEP, STEP * 2);
  expect(game.projectiles[0]?.vx).toBeCloseTo(reflected.vx);
  expect(game.projectiles[0]?.vy).toBeCloseTo(reflected.vy);
});

test("a step crossing projectile lifetime resolves only its final live segment", () => {
  const finalStep = (targetX: number) => {
    let game = spawnDummy(createGame(() => 0.9), { x: targetX, y: 300 });
    game = updateGame(game, { ...idle, firing: true }, 0, 0);
    game = {
      ...game,
      time: 0.9,
      projectiles: game.projectiles.map((projectile) => ({
        ...projectile,
        x: 100,
        y: 300,
        vx: 620,
        vy: 0,
        bornAt: 0,
        lifetime: 1,
      })),
    };
    return updateGame(game, idle, 0.2, 1.1);
  };

  expect(finalStep(180).metrics.hits).toBe(1);
  expect(finalStep(200).metrics.hits).toBe(0);
  expect(finalStep(200).projectiles).toHaveLength(0);
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
    expect(moved.player[axis === "x" ? "vx" : "vy"]).toBe(0);
  }
});

test("accelerates linearly to full cardinal speed in 0.3 seconds", () => {
  let game = createGame(() => 0);
  expect(game.player).toMatchObject({ vx: 0, vy: 0, speed: 240 });

  game = updateGame(game, { ...idle, moveX: 1 }, 0.15, 0.15);
  expect(game.player.vx).toBeCloseTo(120);
  expect(game.player.vy).toBe(0);

  game = updateGame(game, { ...idle, moveX: 1 }, 0.15, 0.3);
  expect(game.player.vx).toBeCloseTo(240);
  expect(playerSpeed(game)).toBeCloseTo(240);
});

test("normalizes diagonal target speed while accelerating", () => {
  const game = updateGame(
    createGame(() => 0),
    { ...idle, moveX: 1, moveY: 1 },
    0.3,
    0.3,
  );
  expect(game.player.vx).toBeCloseTo(240 / Math.SQRT2);
  expect(game.player.vy).toBeCloseTo(240 / Math.SQRT2);
  expect(playerSpeed(game)).toBeCloseTo(240);
});

test("decelerates to rest in 0.3 seconds and reverses in 0.6 seconds", () => {
  const right = { ...idle, moveX: 1 };
  const left = { ...idle, moveX: -1 };
  let game = updateGame(createGame(() => 0), right, 0.3, 0.3);

  game = updateGame(game, idle, 0.15, 0.45);
  expect(game.player.vx).toBeCloseTo(120);
  game = updateGame(game, idle, 0.15, 0.6);
  expect(game.player.vx).toBe(0);

  game = updateGame(game, right, 0.3, 0.9);
  game = updateGame(game, left, 0.3, 1.2);
  expect(game.player.vx).toBeCloseTo(0);
  game = updateGame(game, left, 0.3, 1.5);
  expect(game.player.vx).toBeCloseTo(-240);
});

test("reaches exact full speed after 36 fixed acceleration steps", () => {
  const game = moveForTicks(createGame(() => 0), { ...idle, moveX: 1 }, 36);
  expect(game.player.vx).toBe(240);
});

test("reaches exact rest after 36 fixed friction steps", () => {
  const game = createGame(() => 0);
  const moving = { ...game, player: { ...game.player, vx: 240 } };
  expect(moveForTicks(moving, idle, 36).player.vx).toBe(0);
});

test("reaches exact opposite speed after 72 fixed reversal steps", () => {
  const game = createGame(() => 0);
  const moving = { ...game, player: { ...game.player, vx: 240 } };
  expect(moveForTicks(moving, { ...idle, moveX: -1 }, 72).player.vx).toBe(-240);
});

test("walls clear only the blocked velocity component", () => {
  const game = createGame(() => 0);
  const atRightWall = {
    ...game,
    player: {
      ...game.player,
      x: game.room.maxX - game.player.radius,
      vx: 240,
      vy: 0,
    },
  };
  const moved = updateGame(
    atRightWall,
    { ...idle, moveX: 1, moveY: 1 },
    0.05,
    0.05,
  );

  expect(moved.player.x).toBe(game.room.maxX - game.player.radius);
  expect(moved.player.vx).toBe(0);
  expect(moved.player.vy).toBeGreaterThan(0);
  expect(moved.player.y).toBeGreaterThan(game.player.y);
});

test("pause preserves velocity and reset clears it", () => {
  const moving = updateGame(
    createGame(() => 0),
    { ...idle, moveX: 1 },
    0.15,
    0.15,
  );
  const paused = updateGame(moving, { ...idle, paused: true }, 1, 1.15);
  expect(paused.player).toEqual(moving.player);
  expect(resetLab(moving).player).toMatchObject({ vx: 0, vy: 0 });
});

test("the catalog composes every artifact effect on a projectile", () => {
  let game = createGame(() => 0.5);
  for (const { id } of ARTIFACT_CATALOG) {
    game = setArtifact(game, id, true);
  }
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  expect(game.projectiles).toHaveLength(2);
  expect(game.projectiles.every((projectile) =>
    projectile.damage === 27 && projectile.remainingBounces === 1 &&
    projectile.behaviors.tesla !== undefined && projectile.behaviors.split !== undefined &&
    projectile.penetration?.obstacles === true && projectile.penetration.targets === true,
  )).toBe(true);
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
