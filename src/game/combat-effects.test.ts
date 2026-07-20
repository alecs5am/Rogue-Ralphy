import { expect, test } from "bun:test";
import { compileCombatBuild } from "./combat-build";
import {
  collectCombatEvents,
  queueEmission,
  resolveAreaPhase,
  resolveCombatPhases,
  resolveEmissionPhase,
  resolveImpactPhase,
  resolveKillAndCleanupPhase,
  resolveMotionPhase,
  resolveTriggerPhase,
  sortCombatEvents,
  type CombatContext,
  type CombatEvent,
  type CombatRuntime,
} from "./combat-effects";
import { createMetrics } from "./metrics";
import type { ProjectileSpec, ProjectileState } from "./projectiles";
import { ROOM, ROOM_PROPS } from "./room";

const projectile = (overrides: Partial<ProjectileState> = {}): ProjectileState => ({
  id: "projectile-1",
  triggerId: "trigger-1",
  generation: 0,
  rootTriggerId: "trigger-1",
  lineageId: "trigger-1:0",
  localOrdinal: 0,
  activatedEffectIds: Object.freeze(["baseRevolver.direct"]),
  emittedEffectIds: [],
  originPower: 20,
  x: 200,
  y: 300,
  vx: 100,
  vy: 0,
  damage: 20,
  speed: 100,
  radius: 6,
  lifetime: 8,
  bornAt: 0,
  remainingBounces: 0,
  bounceRetention: 1,
  freezeChance: 0,
  freezeDuration: 0,
  behaviors: Object.freeze({}),
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
  nextId: 2,
  step: 1,
  now: 0.1,
  ...overrides,
});

const build = compileCombatBuild({ shotgun: true });
const context = (overrides: Partial<CombatContext> = {}): CombatContext => ({
  dt: 0.1,
  room: ROOM,
  props: ROOM_PROPS,
  build,
  rng: () => 0.9,
  player: { x: 480, y: 288, radius: 18 },
  teslaLinks: [],
  teslaCooldowns: {},
  fireRate: 3,
  ...overrides,
});

const impact = (
  projectileId: string,
  stableId: string,
  eventTime: number,
  kind: CombatEvent["kind"],
): CombatEvent => ({
  eventTime,
  kind,
  projectileId,
  ...(kind === "target" ? { targetId: stableId } : { colliderId: stableId }),
  point: { x: 1, y: 2 },
  segment: { from: { x: 0, y: 2 }, to: { x: 2, y: 2 } },
});

test("same-step events sort by tolerant time projectile stable collider and semantic kind", () => {
  const events = [
    impact("projectile-2", "target-b", 0.2, "target"),
    impact("projectile-1", "target-b", 0.2 + Number.EPSILON, "target"),
    impact("projectile-1", "target-a", 0.2, "wall"),
    impact("projectile-1", "same", 0.2, "target"),
    impact("projectile-1", "same", 0.2, "prop"),
  ];

  expect(sortCombatEvents(events).map(({ projectileId, targetId, colliderId, kind }) => [
    projectileId,
    targetId ?? colliderId,
    kind,
  ])).toEqual([
    ["projectile-1", "same", "prop"],
    ["projectile-1", "same", "target"],
    ["projectile-1", "target-a", "wall"],
    ["projectile-1", "target-b", "target"],
    ["projectile-2", "target-b", "target"],
  ]);
});

test("equal-time events use prop wall target distance range lifetime priority", () => {
  const kinds = ["lifetime", "range", "distance", "target", "wall", "prop"] as const;
  const events = kinds.map((kind) => impact("projectile-1", "same", 0.5, kind));
  expect(sortCombatEvents(events).map(({ kind }) => kind)).toEqual([
    "prop", "wall", "target", "distance", "range", "lifetime",
  ]);
});

test("generation-one cannot queue another emission", () => {
  const rule = build.emissions.find(({ effectId }) => effectId === "shotgun.split")!;
  expect(() => queueEmission(projectile({ generation: 1 }), rule, { step: 4, nextIds: [] }))
    .toThrow("generation-one projectile cannot emit");
});

test("materialized Shotgun children reset live convergence before their first cone step", () => {
  const composed = compileCombatBuild({ shotgun: true, twinChamber: true });
  const split = composed.emissions.find(({ effectId }) => effectId === "shotgun.split")!;
  if (split.kind !== "splitCone") throw new Error("expected Shotgun split rule");
  const parent = projectile({
    x: 300,
    y: 300,
    vx: 100,
    speed: 100,
    travelled: 160,
    activatedEffectIds: ["baseRevolver.direct", "twinChamber.converge", "shotgun.split"],
    behaviors: {
      split: {
        distance: split.distance, count: split.count, childRange: split.range,
        damageScale: split.damageScale, fanAngle: split.angle, radiusScale: split.radiusScale,
      },
      converge: { distance: 240, lateralOffset: 18 },
    },
    motionRules: composed.motions,
    converge: { side: 1, distance: 240 },
    convergeOffset: 16.8,
    convergeDone: false,
  });
  const pending = queueEmission(parent, split, {
    step: 0,
    nextIds: Array.from({ length: 8 }, (_, index) => `pellet-${index}`),
  });
  const materialized = resolveTriggerPhase(runtime({
    now: 1,
    step: 1,
    pendingEmissions: [pending],
  }), context({ dt: 0, build: composed, props: [] }));

  expect(materialized.projectiles).toHaveLength(8);
  expect(materialized.projectiles.every((child) => child.convergeOffset === 0 && child.convergeDone === false)).toBe(true);
  expect(materialized.projectiles.every((child) => child.converge?.side === 1 && child.converge.distance === 240)).toBe(true);

  const starts = new Map(materialized.projectiles.map((child) => [child.id, { x: child.x, y: child.y }]));
  const moved = resolveMotionPhase(materialized, context({ dt: 1 / 120, build: composed, props: [] }));
  for (const child of moved.projectiles) {
    const start = starts.get(child.id)!;
    expect(Math.hypot(child.x - start.x, child.y - start.y)).toBeCloseTo(100 / 120, 1);
  }
});

test("trigger phase drains fixed-step emissions separately from future wall-clock schedules", () => {
  const spec: ProjectileSpec = {
    triggerId: "trigger-pending",
    heading: 0,
    damage: 5,
    speed: 100,
    radius: 3,
    lifetime: 2,
    freezeChance: 1,
    freezeDuration: 1,
    bounces: 0,
    bounceRetention: 1,
    behaviors: Object.freeze({
      homing: { radius: 96, turnRate: Math.PI },
      penetration: { obstacles: true, targets: true },
    }),
  };
  const { triggerId: _, ...scheduledSpec } = spec;
  const triggered = resolveTriggerPhase(runtime({
    now: 2,
    step: 5,
    scheduledProjectiles: [{
      at: 3,
      generation: 0,
      rootTriggerId: "trigger-future",
      rootIndex: 2,
      localOrdinal: 0,
      lineageId: "trigger-future:0",
      effectIds: ["baseRevolver.direct"],
      spec: scheduledSpec,
    }],
    pendingEmissions: [{
      atStep: 5,
      effectId: "shotgun.split",
      artifactId: "shotgun",
      rootTriggerId: "trigger-pending",
      lineageId: "trigger-pending:0",
      generation: 1,
      originPower: 20,
      activatedEffectIds: ["baseRevolver.direct", "ghostSight.homing", "spectralBullets.penetration", "coldcaster.chill"],
      specs: [spec],
    }],
  }), context());

  expect(triggered.scheduledProjectiles).toHaveLength(1);
  expect(triggered.pendingEmissions).toEqual([]);
  expect(triggered.projectiles[0]).toMatchObject({
    id: "projectile-2",
    generation: 1,
    rootTriggerId: "trigger-pending",
    lineageId: "trigger-pending:0",
    originPower: 20,
    freezeChance: 1,
    penetration: { obstacles: true, targets: true },
    behaviors: { homing: { radius: 96 } },
  });
  expect(triggered.projectiles[0]!.activatedEffectIds).toEqual([
    "baseRevolver.direct", "ghostSight.homing", "spectralBullets.penetration", "coldcaster.chill",
  ]);
});

test.each([
  ["deadeye", "deadeye.echo"],
  ["graveEcho", "graveEcho.copy"],
] as const)("scheduled %s copies materialize provenance without inheriting creation eligibility", (artifactId, effectId) => {
  const spec = {
    heading: 0, damage: 8, speed: 100, radius: 5, lifetime: 2,
    freezeChance: 0, freezeDuration: 0, bounces: 0, bounceRetention: 1, behaviors: {},
  } as const;
  const triggered = resolveTriggerPhase(runtime({
    now: 2,
    scheduledProjectiles: [{
      at: 2,
      generation: 1,
      rootTriggerId: "trigger-4",
      rootIndex: 4,
      localOrdinal: 9,
      lineageId: "trigger-4:2",
      effectIds: ["baseRevolver.direct", "ghostSight.homing", "spectralBullets.penetration", "coldcaster.chill"],
      emission: { artifactId, effectId },
      spec,
    }],
  }), context());

  expect(triggered.projectiles[0]).toMatchObject({
    generation: 1,
    rootTriggerId: "trigger-4",
    lineageId: "trigger-4:2",
    emission: { artifactId, effectId },
  });
  expect(triggered.projectiles[0]?.activatedEffectIds).toEqual([
    "baseRevolver.direct", "ghostSight.homing", "spectralBullets.penetration", "coldcaster.chill",
  ]);
  expect(triggered.projectiles[0]?.activatedEffectIds).not.toContain(effectId);
});

test("Twin convergence follows committed path distance and remains centered after 100 pixels", () => {
  let current = runtime({
    now: 0,
    step: 0,
    projectiles: [-18, 18].map((lateralOffset, index) => projectile({
      id: `twin-${index}`,
      lineageId: `trigger-1:${index}`,
      x: 200,
      y: 300,
      vx: 100,
      speed: 100,
      radius: 1,
      launchHeading: 0,
      behaviors: { converge: { distance: 100, lateralOffset } },
    })),
  });
  const motion = context({ dt: 0.01, props: [] });
  let crossed = false;
  for (let step = 1; step <= 130; step += 1) {
    current = resolveCombatPhases({ ...current, now: step * 0.01, step }, motion);
    if (!crossed && current.projectiles.every(({ travelled }) => travelled >= 100)) {
      crossed = true;
      expect(current.projectiles.map(({ y }) => y)).toEqual([
        expect.closeTo(300, 10),
        expect.closeTo(300, 10),
      ]);
    }
    if (crossed) for (const converged of current.projectiles) expect(converged.y).toBeCloseTo(300, 10);
  }
  expect(crossed).toBe(true);
});

test("Last Bell initializes live pulse state from materialized bornAt", () => {
  const triggered = resolveTriggerPhase(runtime({
    now: 2,
    scheduledProjectiles: [{
      at: 1,
      generation: 0,
      rootTriggerId: "trigger-bell",
      rootIndex: 1,
      localOrdinal: 0,
      lineageId: "trigger-bell:0",
      effectIds: ["baseRevolver.direct", "lastBell.round", "lastBell.rings"],
      spec: {
        heading: 0, damage: 30, speed: 279, radius: 8, lifetime: 8,
        freezeChance: 0, freezeDuration: 0, bounces: 0, bounceRetention: 1, behaviors: {},
        bell: { interval: 0.25, count: 3, radius: 44, damageScale: 0.25 },
      },
    }],
  }), context());

  expect(triggered.projectiles[0]).toMatchObject({
    bornAt: 2,
    bellPulse: { nextAt: 2.25, remaining: 3, interval: 0.25, radius: 44, damageScale: 0.25 },
  });
});

test("motion and collision preserve a merged corner normal and swept path", () => {
  const base = resolveTriggerPhase(runtime({
    projectiles: [projectile({ x: 880, y: 496, vx: 100, vy: 100 })],
    now: 0.2,
  }), context({ dt: 0.2 }));
  const moved = resolveMotionPhase(base, context({ dt: 0.2 }));
  const collided = collectCombatEvents(moved, context({ dt: 0.2 }));
  const wall = collided.events.find(({ kind }) => kind === "wall");

  expect(wall).toMatchObject({
    projectileId: "projectile-1",
    colliderId: "room",
    eventTime: 0.5,
    normal: { x: -1, y: -1 },
    segment: { from: { x: 880, y: 496 }, to: { x: 900, y: 516 } },
  });
});

test("Spectral obstacle penetration never passes through a room wall", () => {
  const resolved = resolveCombatPhases(runtime({
    now: 0.1,
    projectiles: [projectile({
      x: 880,
      y: 300,
      vx: 200,
      penetration: { obstacles: true, targets: true },
      behaviors: Object.freeze({ penetration: { obstacles: true, targets: true } }),
      activatedEffectIds: Object.freeze(["baseRevolver.direct", "spectralBullets.penetration"]),
    })],
  }), context({ dt: 0.1 }));

  expect(resolved.projectiles).toEqual([]);
  expect(resolved.metrics).toMatchObject({ misses: 1, successfulProjectiles: 0 });
});

test("a glancing prop ricochet separates outward before the next step", () => {
  const prop = { id: "glance", kind: "rock" as const, x: 570, y: 310, size: 40, collisionRadius: 20 };
  const resolved = resolveCombatPhases(runtime({
    now: 0.5,
    projectiles: [projectile({ x: 500, y: 300, vx: 200, remainingBounces: 1 })],
  }), context({ dt: 0.5, props: [prop] }));
  const bounced = resolved.projectiles[0]!;

  expect(bounced.remainingBounces).toBe(0);
  expect(Math.hypot(bounced.x - prop.x, bounced.y - prop.y)).toBeCloseTo(
    prop.collisionRadius + bounced.radius + 0.01,
    10,
  );

  const continued = resolveCombatPhases({ ...resolved, now: 0.51, step: 2 }, context({ dt: 0.01, props: [prop] }));
  expect(continued.projectiles).toHaveLength(1);
  expect(continued.metrics.misses).toBe(resolved.metrics.misses);
});

test("an axis-aligned prop ricochet separates by the exact epsilon", () => {
  const prop = { id: "axis", kind: "crate" as const, x: 570, y: 300, size: 40, collisionRadius: 20 };
  const resolved = resolveCombatPhases(runtime({
    now: 0.5,
    projectiles: [projectile({ x: 500, y: 300, vx: 200, remainingBounces: 1 })],
  }), context({ dt: 0.5, props: [prop] }));
  const bounced = resolved.projectiles[0]!;

  expect(bounced.x).toBeCloseTo(prop.x - prop.collisionRadius - bounced.radius - 0.01, 10);
  expect(bounced.y).toBe(prop.y);
  expect(bounced.vx).toBe(-200);
});

test("every combat phase is observationally immutable", () => {
  const initial = runtime({ projectiles: [projectile()] });
  const unchanged = <T extends object, U>(value: T, run: (input: T) => U): U => {
    const before = JSON.stringify(value);
    const result = run(value);
    expect(JSON.stringify(value)).toBe(before);
    return result;
  };

  const triggered = unchanged(initial, (value) => resolveTriggerPhase(value, context()));
  const moved = unchanged(triggered, (value) => resolveMotionPhase(value, context()));
  const collided = unchanged(moved, (value) => collectCombatEvents(value, context()));
  const impacted = unchanged(collided, (value) => resolveImpactPhase(value, context()));
  const emitted = unchanged(impacted, (value) => resolveEmissionPhase(value, context()));
  const area = unchanged(emitted, (value) => resolveAreaPhase(value, context()));
  unchanged(area, (value) => resolveKillAndCleanupPhase(value, context()));
});

test("a live Last Bell pulse deals secondary area damage from its then-current damage", () => {
  const target = {
    id: "dummy-bell", kind: "dummy" as const, immortal: true,
    x: 220, y: 300, radius: 22, health: 1, maxHealth: 1, speed: 0, frozenUntil: 0,
  };
  const resolved = resolveAreaPhase(runtime({
    now: 1.25,
    projectiles: [projectile({
      id: "bell", damage: 40, bornAt: 1,
      bellPulse: { nextAt: 1.25, remaining: 3, interval: 0.25, radius: 44, damageScale: 0.25 },
    })],
    targets: [target],
  }), context());

  expect(resolved.metrics.hitEvents[0]).toMatchObject({
    source: "area", damage: 10, artifactId: "lastBell", effectId: "lastBell.rings",
    targetId: "dummy-bell", projectileId: "bell",
  });
  expect(resolved.projectiles[0]?.bellPulse).toEqual({
    nextAt: 1.5, remaining: 2, interval: 0.25, radius: 44, damageScale: 0.25,
  });
  expect(resolved.vfxCommands[0]).toMatchObject({ kind: "lastBell.ring", artifactId: "lastBell", x: 200, y: 300 });
});

test("exact-time physical removal wins before a Last Bell area pulse", () => {
  const target = {
    id: "dummy-bell", kind: "dummy" as const, immortal: true,
    x: 220, y: 300, radius: 22, health: 1, maxHealth: 1, speed: 0, frozenUntil: 0,
  };
  const resolved = resolveCombatPhases(runtime({
    now: 1.25,
    projectiles: [projectile({
      id: "bell", bornAt: 1, lifetime: 0.25,
      bellPulse: { nextAt: 1.25, remaining: 3, interval: 0.25, radius: 44, damageScale: 0.25 },
    })],
    targets: [target],
  }), context({ dt: 0 }));

  expect(resolved.projectiles).toEqual([]);
  expect(resolved.metrics.hitEvents).toEqual([]);
  expect(resolved.vfxCommands).toEqual([]);
});

test("combat runtime rejects nonfinite values unsafe areas duplicate instances and deep kill reactions", () => {
  const area = {
    id: "area-1",
    effectId: "ectoplasmSnare.pool",
    artifactId: "ectoplasmSnare",
    rootTriggerId: "trigger-1",
    instanceKey: "dummy-1",
    bornAt: 0,
    expiresAt: 2,
    tickInterval: 0.1,
  } as const;
  const duplicate = { ...area, id: "area-2" };
  const badMetrics = {
    ...createMetrics(),
    hitEvents: [{
      source: "reactive" as const,
      damage: 1,
      time: 0,
      targetId: "dummy-1",
      artifactId: "soulHarvester",
      effectId: "soulHarvester.spirits",
      rootTriggerId: "trigger-1",
      killReactionDepth: 2 as 0 | 1,
      originPower: 20,
    }],
  };

  expect(() => resolveCombatPhases(runtime({
    targets: [{ id: "dummy-1", kind: "dummy", immortal: true, x: 1, y: 1, radius: 22, health: Infinity, maxHealth: 1, speed: 0, frozenUntil: 0 }],
  }), context())).toThrow("finite");
  expect(() => resolveCombatPhases(runtime({ areas: [{ ...area, expiresAt: 3.01 }] }), context())).toThrow("three seconds");
  expect(() => resolveCombatPhases(runtime({ areas: [{ ...area, tickInterval: 0.09 }] }), context())).toThrow("ten hertz");
  expect(() => resolveCombatPhases(runtime({ areas: [area, duplicate] }), context())).toThrow("duplicate area");
  expect(() => resolveCombatPhases(runtime({ metrics: badMetrics }), context())).toThrow("kill reaction depth");
});

test("VFX commands are finite unique bounded and expire deterministically", () => {
  const vfx = {
    id: "vfx-1",
    kind: "impact",
    artifactId: "baseRevolver",
    bornAt: 0,
    expiresAt: 0.2,
    x: 4,
    y: 5,
  } as const;
  const expiredArea = {
    id: "area-expired",
    effectId: "ectoplasmSnare.pool",
    artifactId: "ectoplasmSnare",
    rootTriggerId: "trigger-1",
    instanceKey: "dummy-1",
    bornAt: 0,
    expiresAt: 0.2,
    tickInterval: 0.1,
  } as const;
  const resolved = resolveCombatPhases(runtime({ now: 0.2, areas: [expiredArea], vfxCommands: [vfx] }), context());
  expect(resolved.areas).toEqual([]);
  expect(resolved.vfxCommands).toEqual([]);
  expect(() => resolveCombatPhases(runtime({ vfxCommands: [vfx, { ...vfx }] }), context())).toThrow("duplicate VFX");
  expect(() => resolveCombatPhases(runtime({ vfxCommands: [{ ...vfx, expiresAt: 3.01 }] }), context())).toThrow("three seconds");
  expect(() => resolveCombatPhases(runtime({ vfxCommands: [{ ...vfx, x: Infinity }] }), context())).toThrow("finite");

  const limit = Math.ceil(context().fireRate * 3 * (11 + context().build.maxDescendants));
  const overBound = Array.from({ length: limit + 1 }, (_, index) => ({ ...vfx, id: `vfx-${index}` }));
  expect(() => resolveCombatPhases(runtime({ vfxCommands: overBound }), context())).toThrow("derived bound");
});

test("a later equal-sweep impact skips a target killed by an earlier projectile", () => {
  const target = {
    id: "chaser-1",
    kind: "chaser" as const,
    immortal: false,
    x: 600,
    y: 300,
    radius: 22,
    health: 20,
    maxHealth: 20,
    speed: 0,
    frozenUntil: 0,
  };
  const resolved = resolveCombatPhases(runtime({
    now: 0.2,
    projectiles: [
      projectile({ x: 500, vx: 600 }),
      projectile({ id: "projectile-2", lineageId: "trigger-1:1", x: 500, vx: 600 }),
    ],
    targets: [target],
  }), context({ dt: 0.2 }));

  expect(resolved.metrics).toMatchObject({ hits: 1, kills: 1, successfulProjectiles: 1 });
  expect(resolved.targets).toEqual([]);
  expect(resolved.projectiles.map(({ id }) => id)).toEqual(["projectile-2"]);
});

test("an expiring ricochet records one outcome instead of surviving its final live segment", () => {
  const resolved = resolveCombatPhases(runtime({
    now: 0.2,
    projectiles: [projectile({
      x: 880,
      y: 300,
      vx: 200,
      bornAt: 0,
      lifetime: 0.1,
      remainingBounces: 1,
    })],
  }), context({ dt: 0.2 }));

  expect(resolved.projectiles).toEqual([]);
  expect(resolved.metrics).toMatchObject({ misses: 1, successfulProjectiles: 0 });
});

test("Wailing Lead collision follows the canonical sine polyline instead of its endpoint chord", () => {
  const waveBuild = compileCombatBuild({ wailingLead: true });
  const target = {
    id: "curve-target", kind: "dummy" as const, x: 236, y: 322, radius: 0,
    health: 1, maxHealth: 1, immortal: true, speed: 0, frozenUntil: 0,
  };
  const base = runtime({
    now: 0.72,
    projectiles: [projectile({
      x: 200, y: 300, vx: 100, speed: 100, radius: 0, baseHeading: 0,
      motionRules: waveBuild.motions, wavePhase: 0, waveDistance: 0,
    })],
    targets: [target],
  });
  const motion = context({ dt: 0.72, build: waveBuild, props: [] });
  const collided = collectCombatEvents(resolveMotionPhase(base, motion), motion);

  expect(collided.events.find(({ kind }) => kind === "target")).toMatchObject({
    targetId: target.id,
    eventTime: 0.5,
    point: { x: 236, y: 322 },
  });
});

test("partial-lifetime paths keep event times normalized to the original fixed step", () => {
  const target = {
    id: "partial-life-target", kind: "dummy" as const, x: 20, y: 0, radius: 0,
    health: 1, maxHealth: 1, immortal: true, speed: 0, frozenUntil: 0,
  };
  const fixedStep = context({
    dt: 0.5,
    props: [],
    room: { minX: -1_000, maxX: 1_000, minY: -1_000, maxY: 1_000 },
  });
  const moved = resolveMotionPhase(runtime({
    now: 0.5,
    projectiles: [projectile({ x: 0, y: 0, radius: 0, lifetime: 0.25, bornAt: 0 })],
    targets: [target],
  }), fixedStep);
  const events = collectCombatEvents(moved, fixedStep).events;

  expect(events.find(({ kind }) => kind === "target")?.eventTime).toBeCloseTo(0.4, 12);
  expect(events.find(({ kind }) => kind === "lifetime")?.eventTime).toBeCloseTo(0.5, 12);
});

test("Spectral Undertaker hits once on each exact outbound and return leg", () => {
  const returnBuild = compileCombatBuild({ undertakersReturn: true, spectralBullets: true });
  const target = {
    id: "return-target", kind: "dummy" as const, x: 300, y: 300, radius: 0,
    health: 1, maxHealth: 1, immortal: true, speed: 0, frozenUntil: 0,
  };
  const resolved = resolveCombatPhases(runtime({
    now: 3.8,
    projectiles: [projectile({
      x: 200, y: 300, vx: 100, speed: 100, radius: 0, damage: 100,
      penetration: { obstacles: true, targets: true },
      behaviors: { penetration: { obstacles: true, targets: true } },
      motionRules: returnBuild.motions,
      outboundHitTargetIds: [], returnHitTargetIds: [], legTravelled: 0,
    })],
    targets: [target],
  }), context({ dt: 3.8, build: returnBuild, props: [] }));

  expect(resolved.metrics).toMatchObject({ hits: 2, totalDamage: 165 });
  expect(resolved.projectiles[0]).toMatchObject({
    returnLeg: "return",
    outboundHitTargetIds: [target.id],
    returnHitTargetIds: [target.id],
  });
});

test("a physical hit at the exact Undertaker turn wins", () => {
  const returnBuild = compileCombatBuild({ undertakersReturn: true });
  const target = {
    id: "turn-target", kind: "dummy" as const, x: 440, y: 300, radius: 0,
    health: 1, maxHealth: 1, immortal: true, speed: 0, frozenUntil: 0,
  };
  const resolved = resolveCombatPhases(runtime({
    now: 2.5,
    projectiles: [projectile({
      x: 200, y: 300, vx: 100, speed: 100, radius: 0,
      motionRules: returnBuild.motions, legTravelled: 0,
    })],
    targets: [target],
  }), context({ dt: 2.5, build: returnBuild, props: [] }));

  expect(resolved.metrics.hits).toBe(1);
  expect(resolved.projectiles).toEqual([]);
});

test("Comet damage and radius interpolate at the exact swept hit time", () => {
  const cometBuild = compileCombatBuild({ cometSpur: true });
  const target = {
    id: "comet-target", kind: "dummy" as const, x: 268.75, y: 300, radius: 0,
    health: 1, maxHealth: 1, immortal: true, speed: 0, frozenUntil: 0,
  };
  const base = runtime({
    now: 1,
    projectiles: [projectile({
      x: 200, y: 300, vx: 100, speed: 100, radius: 10, damage: 100,
      motionRules: cometBuild.motions,
    })],
    targets: [target],
  });
  const motion = context({ dt: 1, build: cometBuild, props: [] });
  const collision = collectCombatEvents(resolveMotionPhase(base, motion), motion)
    .events.find(({ kind }) => kind === "target")!;
  const resolved = resolveCombatPhases(base, motion);

  expect(collision.targetId).toBe(target.id);
  expect(collision.eventTime).toBeCloseTo(0.5, 10);
  expect(collision.radius).toBeCloseTo(12.5, 10);
  expect(resolved.metrics.hitEvents[0]?.damage).toBeCloseTo(117.5, 10);
  expect(resolved.metrics.hitEvents[0]?.time).toBeCloseTo(0.5, 10);
});

test("Pinball consumes one lineage relay across simultaneous physical bounces and cleans it with the root", () => {
  const pinballBuild = compileCombatBuild({ pinball: true });
  const shared = {
    lineageId: "shared-lineage",
    rootTriggerId: "shared-root",
    triggerId: "shared-root",
    remainingBounces: 1,
    radius: 1,
    motionRules: pinballBuild.motions,
  } as const;
  const resolved = resolveCombatPhases(runtime({
    now: 0.1,
    projectiles: [
      projectile({ ...shared, id: "projectile-a", x: 890, y: 200, vx: 100, speed: 100 }),
      projectile({ ...shared, id: "projectile-b", x: 70, y: 400, vx: -100, speed: 100 }),
    ],
  }), context({ dt: 0.1, build: pinballBuild, props: [] }));

  expect(Object.keys(resolved.relayLedger ?? {})).toEqual([shared.lineageId]);
  expect(resolved.vfxCommands.filter(({ kind }) => kind === "pinball.relay")).toHaveLength(1);
  expect(resolved.projectiles.map(({ vx, vy }) => Math.hypot(vx, vy)).sort((a, b) => a - b))
    .toEqual([100, 135]);

  const cleaned = resolveCombatPhases({ ...resolved, projectiles: [], now: 0.2, step: 2 }, context({
    dt: 0,
    build: pinballBuild,
    props: [],
  }));
  expect(cleaned.relayLedger).toEqual({});
});

test("ordinary target ricochets do not consume Pinball relay", () => {
  const pinballBuild = compileCombatBuild({ pinball: true });
  const target = {
    id: "ricochet-target", kind: "dummy" as const, x: 250, y: 300, radius: 0,
    health: 1, maxHealth: 1, immortal: true, speed: 0, frozenUntil: 0,
  };
  const resolved = resolveCombatPhases(runtime({
    now: 1,
    projectiles: [projectile({
      x: 200, y: 300, vx: 100, speed: 100, radius: 0, remainingBounces: 1,
      motionRules: pinballBuild.motions,
    })],
    targets: [target],
  }), context({ dt: 1, build: pinballBuild, props: [] }));

  expect(resolved.metrics.hits).toBe(1);
  expect(resolved.relayLedger).toEqual({});
  expect(resolved.vfxCommands).toEqual([]);
  expect(Math.hypot(resolved.projectiles[0]!.vx, resolved.projectiles[0]!.vy)).toBeCloseTo(100);
});
