import { expect, test } from "bun:test";
import { compileCombatBuild } from "./combat-build";
import { resolveCombatPhases, resolveImpactPhase, type CombatContext, type CombatRuntime, type CombatTargetState } from "./combat-effects";
import { createMetrics } from "./metrics";
import type { ProjectileState } from "./projectiles";
import { ROOM } from "./room";
import { createGame, setArtifact, updateGame } from "./simulation";
import {
  areaId,
  buildSpatialCandidates,
  canonicalPair,
  crossingOf,
  type SpatialPath,
} from "./areas";

const target = (id: string, x: number, y: number, health = 100): CombatTargetState => ({
  id,
  kind: "chaser",
  x,
  y,
  radius: 6,
  health,
  maxHealth: health,
  immortal: false,
  speed: 0,
  frozenUntil: 0,
  effects: {},
});

const projectile = (id: string, overrides: Partial<ProjectileState> = {}): ProjectileState => ({
  id,
  triggerId: "trigger-1",
  generation: 0,
  rootTriggerId: "trigger-1",
  lineageId: `trigger-1:${id}`,
  localOrdinal: Number(id.replace(/\D/g, "")) || 0,
  activatedEffectIds: ["baseRevolver.direct"],
  emittedEffectIds: [],
  originPower: 20,
  x: 200,
  y: 300,
  vx: 100,
  vy: 0,
  damage: 20,
  speed: 100,
  radius: 3,
  lifetime: 8,
  bornAt: 0,
  remainingBounces: 0,
  bounceRetention: 1,
  freezeChance: 0,
  freezeDuration: 0,
  behaviors: {},
  hitTargetIds: [],
  everHit: false,
  travelled: 0,
  ...overrides,
});

const runtime = (overrides: Partial<CombatRuntime> = {}): CombatRuntime => ({
  projectiles: [],
  targets: [],
  scheduledProjectiles: [],
  pendingEmissions: [],
  areas: [],
  vfxCommands: [],
  metrics: createMetrics(),
  nextId: 100,
  step: 1,
  now: 0.1,
  ...overrides,
});

const context = (build = compileCombatBuild({}), overrides: Partial<CombatContext> = {}): CombatContext => ({
  dt: 0.1,
  room: ROOM,
  props: [],
  build,
  rng: () => 0.9,
  player: { x: 480, y: 288, radius: 18 },
  teslaLinks: [],
  teslaCooldowns: {},
  fireRate: 3,
  ...overrides,
});

test("shared 96 px candidate pass inserts swept cells and returns canonical pairs once", () => {
  const paths: SpatialPath[] = [
    { id: "projectile-z", segments: [{ from: { x: 0, y: 10 }, to: { x: 250, y: 10 } }] },
    { id: "projectile-a", segments: [{ from: { x: 180, y: -20 }, to: { x: 180, y: 40 } }] },
    { id: "projectile-m", segments: [{ from: { x: 190, y: 20 }, to: { x: 400, y: 20 } }] },
  ];

  const pairs = buildSpatialCandidates(paths);

  expect(pairs.map(({ id }) => id)).toEqual(["projectile-a:projectile-m", "projectile-a:projectile-z", "projectile-m:projectile-z"]);
  expect(pairs.map(({ id }) => id)).toEqual([...new Set(pairs.map(({ id }) => id))]);
  expect(pairs.every(({ a, b }) => a < b)).toBe(true);
});

test("area and pair identities preserve independent pair instances", () => {
  expect(canonicalPair("p9", "p1")).toBe("p1:p9");
  expect(areaId("bigIron.merge", "trigger-1", "p1:p2"))
    .not.toBe(areaId("bigIron.merge", "trigger-1", "p3:p4"));
  expect(areaId("ectoplasmSnare.pool", "trigger-1", "root"))
    .toBe("ectoplasmSnare.pool:trigger-1:root");
});

test("path crossing accepts endpoints but rejects collinear overlap", () => {
  expect(crossingOf(
    { from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, startTime: 0, endTime: 1 },
    { from: { x: 0, y: 10 }, to: { x: 10, y: 0 }, startTime: 0, endTime: 1 },
  )).toMatchObject({ point: { x: 5, y: 5 }, crossingTime: 0.5 });
  expect(crossingOf(
    { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, startTime: 0, endTime: 1 },
    { from: { x: 10, y: 0 }, to: { x: 20, y: 10 }, startTime: 0, endTime: 1 },
  )?.point).toEqual({ x: 10, y: 0 });
  expect(crossingOf(
    { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, startTime: 0, endTime: 1 },
    { from: { x: 5, y: 0 }, to: { x: 15, y: 0 }, startTime: 0, endTime: 1 },
  )).toBeNull();
});

test("Spectral pierces props and targets once per leg but never room walls", () => {
  const build = compileCombatBuild({ spectralBullets: true });
  const effects = ["baseRevolver.direct", "spectralBullets.penetration"];
  let state = resolveCombatPhases(runtime({
    now: 1,
    projectiles: [projectile("projectile-1", {
      x: ROOM.maxX - 80,
      y: 300,
      vx: 200,
      speed: 200,
      penetration: { obstacles: true, targets: true },
      behaviors: { penetration: { obstacles: true, targets: true } },
      activatedEffectIds: effects,
    })],
    targets: [
      target("first", ROOM.maxX - 55, 300),
      target("second", ROOM.maxX - 30, 300),
    ],
  }), context(build, {
    dt: 0.5,
    props: [{ id: "cover", x: ROOM.maxX - 65, y: 300, collisionRadius: 10 }],
  }));

  expect(state.metrics.hitEvents.filter(({ source }) => source === "direct").map(({ targetId }) => targetId))
    .toEqual(["first", "second"]);
  expect(state.projectiles).toEqual([]);
  expect(state.metrics).toMatchObject({ hits: 2, successfulProjectiles: 1, misses: 0 });
});

test("Tesla retains disconnected cooldowns, uses canonical ownership, and cleans removed anchors", () => {
  const build = compileCombatBuild({ teslaBullets: true });
  const behavior = { tesla: { radius: 96, neighbors: 2, damageScale: 0.25, cooldown: 0.15 } };
  const low = projectile("projectile-2", {
    x: 250,
    y: 300,
    damage: 10,
    originPower: 7,
    behaviors: behavior,
    activatedEffectIds: ["baseRevolver.direct", "teslaBullets.link"],
  });
  const high = projectile("projectile-1", {
    x: 330,
    y: 300,
    damage: 20,
    behaviors: behavior,
    activatedEffectIds: ["baseRevolver.direct", "teslaBullets.link"],
  });
  let state = resolveCombatPhases(runtime({
    now: 1,
    projectiles: [low, high],
    targets: [target("arc-target", 290, 300)],
  }), context(build, { dt: 0 }));

  expect(state.metrics.hitEvents.at(-1)).toMatchObject({
    source: "link",
    damage: 2.5,
    projectileId: "projectile-2",
    originPower: 7,
  });
  const [cooldownKey] = Object.keys(state.teslaCooldowns);
  expect(cooldownKey).toBe("teslaBullets.link\0projectile-1:projectile-2\0arc-target");

  state = resolveCombatPhases({
    ...state,
    now: 1.1,
    step: 2,
    projectiles: state.projectiles.map((shot, index) => ({ ...shot, y: index ? 500 : 300 })),
  }, context(build, { dt: 0 }));
  expect(state.teslaLinks).toEqual([]);
  expect(state.teslaCooldowns[cooldownKey!]).toBeCloseTo(1.15);

  state = resolveCombatPhases({ ...state, now: 1.16, step: 3 }, context(build, { dt: 0 }));
  expect(state.teslaCooldowns).toEqual({});

  state = resolveCombatPhases({
    ...state,
    now: 1.17,
    step: 4,
    projectiles: [state.projectiles[0]!],
  }, context(build, { dt: 0, teslaCooldowns: { [cooldownKey!]: 2 } }));
  expect(state.teslaCooldowns).toEqual({});
});

test("Big Iron launches one bounded moonlet per heavy main and merges pair hits once", () => {
  let game = setArtifact(createGame(() => 0.9), "bigIron", true);
  game = updateGame(game, {
    moveX: 0, moveY: 0, aimX: 900, aimY: game.player.y,
    firing: true, reloadPressed: false, paused: false,
  }, 0, 1);

  const main = game.projectiles.find(({ generation }) => generation === 0)!;
  const moonlet = game.projectiles.find(({ emission }) => emission?.effectId === "bigIron.moonlet")!;
  expect(main).toMatchObject({ damage: 24, radius: 6.25, speed: 496, moonletId: moonlet.id });
  expect(moonlet.damage).toBeCloseTo(8.4, 10);
  expect(moonlet).toMatchObject({
    generation: 1,
    radius: 3.125,
    bornAt: main.bornAt,
    emission: { artifactId: "bigIron", effectId: "bigIron.moonlet" },
    moonlet: {
      parentId: main.id,
      orbitRadius: 14,
      angularSpeed: 6 * Math.PI,
      pairWindow: 0.25,
      explosionRadius: 56,
      explosionDamageScale: 0.5,
      knockback: 60,
    },
  });

  const center = { x: (main.x + moonlet.x) / 2, y: (main.y + moonlet.y) / 2 };
  game = {
    ...game,
    targets: [target("pair-target", center.x, center.y)],
    projectiles: game.projectiles.map((shot) => ({
      ...shot,
      vx: 0,
      vy: 0,
      speed: 0,
      penetration: { obstacles: false, targets: true },
      behaviors: { ...shot.behaviors, penetration: { obstacles: false, targets: true } },
    })),
  };
  game = updateGame(game, {
    moveX: 0, moveY: 0, aimX: 900, aimY: game.player.y,
    firing: false, reloadPressed: false, paused: false,
  }, 0, 1.01);

  expect(game.metrics.hitEvents.filter(({ effectId }) => effectId === "bigIron.kineticExplosion"))
    .toEqual([expect.objectContaining({ source: "area", damage: 12 })]);
  expect(Object.values(game.bigIronPairHits ?? {}).filter(({ spent }) => spent)).toHaveLength(1);
});

test("an accepted Big Iron pair still merges after ownership is removed", () => {
  let game = setArtifact(createGame(() => 0.9), "bigIron", true);
  game = updateGame(game, {
    moveX: 0, moveY: 0, aimX: 900, aimY: game.player.y,
    firing: true, reloadPressed: false, paused: false,
  }, 0, 1);
  const main = game.projectiles.find(({ generation }) => generation === 0)!;
  const moonlet = game.projectiles.find(({ emission }) => emission?.effectId === "bigIron.moonlet")!;
  const center = { x: (main.x + moonlet.x) / 2, y: (main.y + moonlet.y) / 2 };
  game = setArtifact({
    ...game,
    targets: [target("pair-target", center.x, center.y)],
    projectiles: game.projectiles.map((shot) => ({
      ...shot,
      vx: 0,
      vy: 0,
      speed: 0,
      penetration: { obstacles: false, targets: true },
      behaviors: { ...shot.behaviors, penetration: { obstacles: false, targets: true } },
    })),
  }, "bigIron", false);

  game = updateGame(game, {
    moveX: 0, moveY: 0, aimX: 900, aimY: game.player.y,
    firing: false, reloadPressed: false, paused: false,
  }, 0, 1.01);

  expect(game.metrics.hitEvents.filter(({ effectId }) => effectId === "bigIron.kineticExplosion"))
    .toHaveLength(1);
});

test("Big Iron releases an orphaned moonlet at the parent's physical removal point with tangent velocity", () => {
  const build = compileCombatBuild({ bigIron: true });
  const main = projectile("projectile-1", {
    x: ROOM.maxX - 4,
    y: 300,
    vx: 100,
    speed: 100,
    activatedEffectIds: ["baseRevolver.direct", "bigIron.heavy", "bigIron.kineticExplosion"],
    moonletId: "projectile-2",
    bigIronMain: { moonletId: "projectile-2", mainDamage: 24, heading: 0 },
  });
  const moonlet = projectile("projectile-2", {
    generation: 1,
    x: main.x,
    y: main.y + 14,
    damage: 8.4,
    radius: 3,
    emission: { artifactId: "bigIron", effectId: "bigIron.moonlet" },
    moonlet: {
      mainId: main.id,
      parentId: main.id,
      orbitRadius: 14,
      angularSpeed: 6 * Math.PI,
      angle: Math.PI / 2,
      expiresAt: 8,
      remainingRange: 800,
      mainDamage: 24,
      pairWindow: 0.25,
      explosionRadius: 56,
      explosionDamageScale: 0.5,
      knockback: 60,
    },
  });
  const state = resolveCombatPhases(runtime({ now: 0.02, projectiles: [main, moonlet] }), context(build, { dt: 0.02 }));

  expect(state.projectiles).toHaveLength(1);
  expect(state.projectiles[0]?.moonlet?.parentId).toBeUndefined();
  expect(state.projectiles[0]?.x).toBeCloseTo(ROOM.maxX - main.radius);
  const released = state.projectiles[0]!;
  const radial = { x: Math.cos(released.moonlet!.angle), y: Math.sin(released.moonlet!.angle) };
  expect(released.vx * radial.x + released.vy * radial.y).toBeCloseTo(0, 8);
  expect(state.projectiles[0]!.vx).toBeLessThan(0);
  expect(state.projectiles[0]?.moonlet).toMatchObject({ expiresAt: 8, remainingRange: 800 });
});

test("Big Iron keeps its moonlet attached when the main survives a bounce", () => {
  const build = compileCombatBuild({ bigIron: true, pinball: true });
  const main = projectile("projectile-1", {
    remainingBounces: 1,
    moonletId: "projectile-2",
    bigIronMain: { moonletId: "projectile-2", mainDamage: 24, heading: 0 },
  });
  const moonlet = projectile("projectile-2", {
    generation: 1,
    emission: { artifactId: "bigIron", effectId: "bigIron.moonlet" },
    moonlet: {
      mainId: main.id,
      parentId: main.id,
      orbitRadius: 14,
      angularSpeed: 6 * Math.PI,
      angle: 0,
      expiresAt: 8,
      remainingRange: 800,
      mainDamage: 24,
      pairWindow: 0.25,
      explosionRadius: 56,
      explosionDamageScale: 0.5,
      knockback: 60,
    },
  });
  const state = resolveImpactPhase({
    ...runtime({ projectiles: [main, moonlet] }),
    segments: [{
      projectileId: main.id,
      source: main,
      index: 0,
      from: { x: 200, y: 300 },
      to: { x: 210, y: 300 },
      distance: 10,
      startTime: 0,
      endTime: 1,
      liveDuration: 0.1,
      expiresAfterMove: false,
      startTravelled: 0,
      endTravelled: 10,
      startRadius: main.radius,
      endRadius: main.radius,
      startDamage: main.damage,
      endDamage: main.damage,
      leg: "outbound" as const,
    }],
    events: [{
      eventTime: 0.5,
      segmentTime: 0.5,
      segmentIndex: 0,
      kind: "wall",
      projectileId: main.id,
      colliderId: "room",
      point: { x: 205, y: 300 },
      normal: { x: -1, y: 0 },
    }],
  } as unknown as CombatRuntime, context(build));

  expect(state.projectiles.find(({ id }) => id === main.id)?.remainingBounces).toBe(0);
  expect(state.projectiles.find(({ id }) => id === moonlet.id)?.moonlet?.parentId).toBe(main.id);
});

test("a released moonlet ignores stale attached-path collisions after parent removal", () => {
  const build = compileCombatBuild({ bigIron: true });
  const main = projectile("projectile-1", {
    moonletId: "projectile-2",
    bigIronMain: { moonletId: "projectile-2", mainDamage: 24, heading: 0 },
  });
  const moonlet = projectile("projectile-2", {
    generation: 1,
    x: 200,
    y: 314,
    emission: { artifactId: "bigIron", effectId: "bigIron.moonlet" },
    moonlet: {
      mainId: main.id,
      parentId: main.id,
      orbitRadius: 14,
      angularSpeed: 6 * Math.PI,
      angle: 0,
      expiresAt: 8,
      remainingRange: 800,
      mainDamage: 24,
      pairWindow: 0.25,
      explosionRadius: 56,
      explosionDamageScale: 0.5,
      knockback: 60,
    },
  });
  const segment = (source: ProjectileState, fromY: number, toY: number) => ({
    projectileId: source.id,
    source,
    index: 0,
    from: { x: 200, y: fromY },
    to: { x: 300, y: toY },
    distance: 100,
    startTime: 0,
    endTime: 1,
    liveDuration: 1,
    expiresAfterMove: false,
    startTravelled: 0,
    endTravelled: 100,
    startRadius: source.radius,
    endRadius: source.radius,
    startDamage: source.damage,
    endDamage: source.damage,
    leg: "outbound" as const,
  });
  const state = resolveImpactPhase({
    ...runtime({ projectiles: [main, moonlet], targets: [target("stale", 280, 314)] }),
    segments: [segment(main, 300, 300), segment(moonlet, 314, 314)],
    events: [
      { eventTime: 0.2, segmentTime: 0.2, segmentIndex: 0, kind: "wall", projectileId: main.id, colliderId: "room", point: { x: 220, y: 300 }, normal: { x: -1, y: 0 } },
      { eventTime: 0.8, segmentTime: 0.8, segmentIndex: 0, kind: "target", projectileId: moonlet.id, targetId: "stale", point: { x: 280, y: 314 }, normal: { x: -1, y: 0 } },
    ],
  } as unknown as CombatRuntime, context(build, { dt: 1 }));

  expect(state.projectiles).toHaveLength(1);
  expect(state.projectiles[0]?.id).toBe(moonlet.id);
  expect(state.metrics.hits).toBe(0);
});

test("Ghost Posse creates one satellite, then older satellites fire before the replacement", () => {
  const idle = {
    moveX: 0, moveY: 0, aimX: 900, aimY: 288,
    firing: false, reloadPressed: false, paused: false,
  } as const;
  let game = setArtifact(createGame(() => 0.9), "ghostPosse", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);

  expect(game.satellites).toHaveLength(1);
  expect(game.projectiles.some(({ emission }) => emission?.effectId === "ghostPosse.shot")).toBe(false);

  game = updateGame(game, { ...idle, firing: true }, 0, game.nextShotAt);
  const shot = game.projectiles.find(({ emission }) => emission?.effectId === "ghostPosse.shot")!;
  expect(shot).toMatchObject({ generation: 1, damage: 4, emission: { artifactId: "ghostPosse", effectId: "ghostPosse.shot" } });
  expect(shot.activatedEffectIds).not.toEqual(expect.arrayContaining([
    "ghostPosse.satellite", "bigIron.heavy", "ectoplasmicWake.trail", "crossfireCovenant.cross",
  ]));
  expect(game.satellites).toHaveLength(1);
  expect(game.satellites[0]!.bornAt).toBe(game.time);
  expect(Math.hypot(shot.x - game.player.x, shot.y - game.player.y)).toBeCloseTo(40, 8);
});

test("an existing Ghost Posse satellite fires on the next root after ownership is removed", () => {
  const idle = {
    moveX: 0, moveY: 0, aimX: 900, aimY: 288,
    firing: false, reloadPressed: false, paused: false,
  } as const;
  let game = setArtifact(createGame(() => 0.9), "ghostPosse", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  game = setArtifact(game, "ghostPosse", false);
  game = updateGame(game, { ...idle, firing: true }, 0, game.nextShotAt);

  expect(game.projectiles.filter(({ emission }) => emission?.effectId === "ghostPosse.shot")).toHaveLength(1);
  expect(game.satellites).toEqual([]);
});

test("Ectoplasmic Wake batches clipped path segments and ticks a lineage once per cooldown", () => {
  const build = compileCombatBuild({ ectoplasmicWake: true });
  const wake = projectile("projectile-1", {
    x: 200,
    y: 300,
    vx: 100,
    speed: 100,
    activatedEffectIds: ["baseRevolver.direct", "ectoplasmicWake.trail"],
  });
  let state = resolveCombatPhases(runtime({
    now: 0.1,
    projectiles: [wake],
    targets: [target("wake-target", 205, 309.5)],
  }), context(build));

  expect(Object.keys(state.wakeTrails ?? {})).toEqual([wake.lineageId]);
  expect(state.wakeTrails?.[wake.lineageId]?.segments).toHaveLength(1);
  expect(state.wakeTrails?.[wake.lineageId]?.segments[0]).toMatchObject({
    from: { x: 200, y: 300 },
    to: { x: 210, y: 300 },
    width: 8,
    damage: 1,
    expiresAt: 0.9,
  });
  expect(state.metrics.hitEvents.filter(({ effectId }) => effectId === "ectoplasmicWake.trail"))
    .toEqual([expect.objectContaining({ source: "area", damage: 1, time: 0.1 })]);

  state = resolveCombatPhases({ ...state, now: 0.2, step: 2, projectiles: [] }, context(build));
  expect(state.metrics.hitEvents.filter(({ effectId }) => effectId === "ectoplasmicWake.trail")).toHaveLength(1);
  state = resolveCombatPhases({ ...state, now: 0.3, step: 3 }, context(build));
  expect(state.metrics.hitEvents.filter(({ effectId }) => effectId === "ectoplasmicWake.trail")).toHaveLength(2);
  state = resolveCombatPhases({ ...state, now: 0.8, step: 4 }, context(build, { dt: 0.5 }));
  expect(state.wakeTrails?.[wake.lineageId]?.segments).toHaveLength(1);
  state = resolveCombatPhases({ ...state, now: 0.9, step: 5 }, context(build));
  expect(state.wakeTrails).toEqual({});
});

test("Ectoplasmic Wake catches up historical ticks before an entire segment expires", () => {
  const build = compileCombatBuild({ ectoplasmicWake: true });
  const wake = projectile("projectile-1", {
    x: 200,
    y: 300,
    vx: 100,
    speed: 100,
    activatedEffectIds: ["baseRevolver.direct", "ectoplasmicWake.trail"],
  });

  let state = resolveCombatPhases(runtime({
    now: 0.9,
    projectiles: [wake],
    targets: [target("wake-target", 205, 309.5)],
  }), context(build, { dt: 0.9 }));

  expect(state.metrics.hitEvents
    .filter(({ effectId }) => effectId === "ectoplasmicWake.trail")
    .map(({ time }) => Number(time.toFixed(1))))
    .toEqual([0.1, 0.3, 0.5, 0.7]);
  expect(state.wakeTrails?.[wake.lineageId]?.segments[0]?.expiresAt).toBeCloseTo(1.7);
  state = resolveCombatPhases({ ...state, now: 1.7, step: 2, projectiles: [] }, context(build, { dt: 0.8 }));
  expect(state.wakeTrails).toEqual({});
});

test("Ectoplasmic Wake never damages along path geometry before that geometry forms", () => {
  const build = compileCombatBuild({ ectoplasmicWake: true });
  const wake = projectile("projectile-1", {
    x: 200,
    y: 300,
    vx: 100,
    speed: 100,
    activatedEffectIds: ["baseRevolver.direct", "ectoplasmicWake.trail"],
  });

  const state = resolveCombatPhases(runtime({
    now: 0.9,
    projectiles: [wake],
    targets: [target("late-target", 285, 309.5)],
  }), context(build, { dt: 0.9 }));

  expect(state.metrics.hitEvents
    .filter(({ effectId }) => effectId === "ectoplasmicWake.trail")
    .map(({ time }) => Number(time.toFixed(1))))
    .toEqual([0.9]);
  expect(state.wakeTrails?.[wake.lineageId]?.segments).toHaveLength(1);
});

test("an earned Ectoplasmic Wake trail outlives artifact ownership", () => {
  const wakeBuild = compileCombatBuild({ ectoplasmicWake: true });
  const wake = projectile("projectile-1", {
    activatedEffectIds: ["baseRevolver.direct", "ectoplasmicWake.trail"],
  });
  let state = resolveCombatPhases(runtime({ now: 0.1, projectiles: [wake] }), context(wakeBuild));

  state = resolveCombatPhases({ ...state, now: 0.2, step: 2, projectiles: [] }, context(compileCombatBuild({})));

  expect(state.wakeTrails?.[wake.lineageId]?.segments).toHaveLength(1);
});

test("a sustained 120 Hz Ectoplasmic Wake stays within its valid 97-point bound", () => {
  const idle = {
    moveX: 0, moveY: 0, aimX: 900, aimY: 288,
    firing: false, reloadPressed: false, paused: false,
  } as const;
  let game = setArtifact(setArtifact(createGame(() => 0.9), "haloChamber", true), "ectoplasmicWake", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  let maximumPoints = 0;
  for (let tick = 1; tick <= 110; tick += 1) {
    game = updateGame(game, idle, 1 / 120, 1 + tick / 120);
    for (const trail of Object.values(game.wakeTrails)) {
      maximumPoints = Math.max(maximumPoints, trail.segments.length + 1);
    }
  }

  expect(maximumPoints).toBe(97);
});

test("Crossfire creates one canonical pulse and consumes each projectile once", () => {
  const build = compileCombatBuild({ crossfireCovenant: true });
  const activatedEffectIds = ["baseRevolver.direct", "crossfireCovenant.cross"];
  const state = resolveCombatPhases(runtime({
    now: 0.1,
    projectiles: [
      projectile("projectile-2", { x: 250, y: 250, vx: 1000, vy: 1000, speed: Math.SQRT2 * 1000, damage: 12, activatedEffectIds, penetration: { obstacles: false, targets: true } }),
      projectile("projectile-1", { x: 250, y: 350, vx: 1000, vy: -1000, speed: Math.SQRT2 * 1000, damage: 20, activatedEffectIds, penetration: { obstacles: false, targets: true } }),
      projectile("projectile-3", { x: 300, y: 250, vx: 0, vy: 1000, speed: 1000, damage: 30, activatedEffectIds, penetration: { obstacles: false, targets: true } }),
    ],
    targets: [target("crossed", 300, 300)],
  }), context(build, { dt: 0.1 }));

  expect(state.crossfirePulses).toHaveLength(1);
  expect(state.crossfirePulses?.[0]).toMatchObject({ pairId: "projectile-1:projectile-2", damage: 3, bornAt: 0.05, expiresAt: 0.25 });
  expect(state.vfxCommands.find(({ kind }) => kind === "crossfireCovenant.cross"))
    .toMatchObject({ bornAt: 0.05, expiresAt: 0.25 });
  expect(state.metrics.hitEvents.filter(({ effectId }) => effectId === "crossfireCovenant.cross"))
    .toEqual([expect.objectContaining({ source: "area", targetId: "crossed", projectileId: "projectile-2", damage: 3 })]);
  expect(Object.keys(state.crossfireParticipation ?? {}).sort()).toEqual(["projectile-1", "projectile-2"]);
});

test("cumulative generation-one accounting accepts child 294 and rejects child 295", () => {
  const all = compileCombatBuild(Object.fromEntries([
    "twinChamber", "deadeye", "graveEcho", "fanThePhantom", "dealersCut", "teslaBullets", "shotgun",
    "bigIron", "boneOrchard", "graveBloom", "bootlegMint", "coldcaster", "dustlineDuel",
    "soulHarvester", "ghostPosse",
  ].map((id) => [id, true])));
  expect(all.maxDescendants).toBe(294);
  const active = projectile("projectile-1");
  expect(() => resolveCombatPhases(runtime({
    projectiles: [active],
    descendantsByRoot: { "trigger-1": { rootTriggerId: "trigger-1", count: 294 } },
  }), context(all, { dt: 0 }))).not.toThrow();
  expect(() => resolveCombatPhases(runtime({
    projectiles: [active],
    descendantsByRoot: { "trigger-1": { rootTriggerId: "trigger-1", count: 295 } },
  }), context(all, { dt: 0 }))).toThrow("generation-one descendant overflow: trigger-1 exceeds 294");
});
