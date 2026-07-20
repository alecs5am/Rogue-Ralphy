import { expect, test } from "bun:test";
import { compileCombatBuild, type CombatBuild } from "./combat-build";
import { resolveCombatPhases, type CombatContext, type CombatRuntime, type CombatTargetState } from "./combat-effects";
import { createMetrics } from "./metrics";
import { buildGenerationOneEmission } from "./emissions";
import type { ProjectileState } from "./projectiles";
import { ROOM } from "./room";

const target = (
  id: string,
  x: number,
  health = 100,
  overrides: Partial<CombatTargetState> = {},
): CombatTargetState => ({
  id,
  kind: "chaser",
  x,
  y: 300,
  radius: 6,
  health,
  maxHealth: health,
  immortal: false,
  speed: 0,
  frozenUntil: 0,
  effects: {},
  ...overrides,
});

const projectile = (id: string, x: number, effectIds: readonly string[], overrides: Partial<ProjectileState> = {}): ProjectileState => ({
  id,
  triggerId: "trigger-1",
  generation: 0,
  rootTriggerId: "trigger-1",
  lineageId: `trigger-1:${id}`,
  localOrdinal: 0,
  activatedEffectIds: ["baseRevolver.direct", ...effectIds],
  emittedEffectIds: [],
  originPower: 20,
  x,
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
  behaviors: {},
  hitTargetIds: [],
  everHit: false,
  travelled: 0,
  ...overrides,
});

const context = (build: CombatBuild, overrides: Partial<CombatContext> = {}): CombatContext => ({
  dt: 0,
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

const runtime = (build: CombatBuild, overrides: Partial<CombatRuntime> = {}): CombatRuntime => ({
  projectiles: [],
  targets: [],
  scheduledProjectiles: [],
  pendingEmissions: [],
  areas: [],
  vfxCommands: [],
  metrics: createMetrics(),
  nextId: 100,
  step: 1,
  now: 1,
  emittedEffects: {},
  ...overrides,
});

test("Hollow Point plants on a live direct target, expires inclusively, and the next direct hit detonates", () => {
  const build = compileCombatBuild({ hollowPoint: true });
  let state = resolveCombatPhases(runtime(build, {
    projectiles: [projectile("projectile-1", 300, ["hollowPoint.charge"])],
    targets: [target("charged", 300), target("nearby", 330)],
  }), context(build));

  expect(state.targets.find(({ id }) => id === "charged")?.effects?.hollowPoint).toEqual({
    damage: 12,
    expiresAt: 3,
    rootTriggerId: "trigger-1",
    lineageId: "trigger-1:projectile-1",
    projectileId: "projectile-1",
    originPower: 20,
  });
  expect(state.targets.find(({ id }) => id === "nearby")?.health).toBe(100);

  state = resolveCombatPhases({
    ...state,
    projectiles: [projectile("projectile-2", 300, ["hollowPoint.charge"], {
      rootTriggerId: "trigger-2",
      lineageId: "trigger-2:0",
      damage: 100,
    })],
    now: 2,
    step: 2,
  }, context(build));

  expect(state.targets.find(({ id }) => id === "charged")?.effects?.hollowPoint).toBeUndefined();
  expect(state.targets.find(({ id }) => id === "nearby")?.health).toBe(88);
  expect(state.metrics.hitEvents.map(({ source, effectId, originPower }) => [source, effectId, originPower])).toEqual([
    ["direct", "baseRevolver.direct", 20],
    ["direct", "baseRevolver.direct", 100],
    ["area", "hollowPoint.explosion", 20],
  ]);

  const expired = resolveCombatPhases(runtime(build, {
    now: 4,
    projectiles: [projectile("projectile-3", 400, ["hollowPoint.charge"])],
    targets: [target("expired", 400, 100, {
      effects: { hollowPoint: { damage: 99, expiresAt: 4, rootTriggerId: "old", originPower: 99 } },
    })],
  }), context(build));
  expect(expired.targets[0]?.effects?.hollowPoint?.damage).toBe(12);
});

test("Hollow Point duration starts at the swept direct-impact time", () => {
  const build = compileCombatBuild({ hollowPoint: true });
  const state = resolveCombatPhases(runtime(build, {
    projectiles: [projectile("projectile-1", 200, ["hollowPoint.charge"])],
    targets: [target("charged", 250)],
  }), context(build, { dt: 1 }));
  const hitAt = state.metrics.hitEvents[0]!.time;
  expect(state.targets[0]?.effects?.hollowPoint?.expiresAt).toBeCloseTo(hitAt + 2, 12);
});

test("Bone Orchard emits the exact three offsets only once per lineage", () => {
  const build = compileCombatBuild({ boneOrchard: true, spectralBullets: true });
  const source = projectile("projectile-1", 300, ["boneOrchard.shards", "spectralBullets.penetration"], {
    penetration: { obstacles: true, targets: true },
    behaviors: { penetration: { obstacles: true, targets: true } },
  });
  const state = resolveCombatPhases(runtime(build, {
    projectiles: [source],
    targets: [target("target-a", 300), target("target-b", 310)],
  }), context(build));

  const emission = state.pendingEmissions.find(({ effectId }) => effectId === "boneOrchard.shards")!;
  expect(emission.specs.map(({ heading }) => heading * 180 / Math.PI)).toEqual([-18, 0, 18]);
  expect(emission.specs.every(({ damage, radius, behaviors }) => damage === 4
    && Math.abs(radius - 3.3) < 1e-12
    && behaviors.penetration?.obstacles
    && behaviors.penetration.targets)).toBe(true);
  expect(state.pendingEmissions.filter(({ effectId }) => effectId === "boneOrchard.shards")).toHaveLength(1);
  expect(state.projectiles[0]?.emittedEffectIds).toContain("boneOrchard.shards");
});

test("Grave Bloom emits only for natural expiry and the explicit Shotgun transformation", () => {
  const bloom = compileCombatBuild({ graveBloom: true });
  const natural = resolveCombatPhases(runtime(bloom, {
    projectiles: [projectile("projectile-1", 300, ["graveBloom.expiry"], { bornAt: 0, lifetime: 1 })],
  }), context(bloom));
  expect(natural.pendingEmissions.find(({ effectId }) => effectId === "graveBloom.expiry")?.specs).toHaveLength(6);

  const ranged = resolveCombatPhases(runtime(bloom, {
    projectiles: [projectile("projectile-2", 300, ["graveBloom.expiry"], { maxTravel: 0 })],
  }), context(bloom));
  expect(ranged.pendingEmissions).toEqual([]);

  const splitBuild = compileCombatBuild({ shotgun: true, graveBloom: true, dustlineDuel: true });
  const split = resolveCombatPhases(runtime(splitBuild, {
    projectiles: [projectile("projectile-3", 300, [
      "shotgun.split", "graveBloom.expiry", "dustlineDuel.threshold", "dustlineDuel.afterimage",
    ], {
      travelled: 160,
      behaviors: {
        split: { distance: 160, count: 8, childRange: 320, fanAngle: 48 * Math.PI / 180, damageScale: 0.25, radiusScale: 0.55 },
      },
    })],
  }), context(splitBuild));
  expect(split.projectiles).toEqual([]);
  expect(split.pendingEmissions.find(({ effectId }) => effectId === "shotgun.split")?.specs).toHaveLength(8);
  expect(split.pendingEmissions.find(({ effectId }) => effectId === "graveBloom.expiry")?.specs).toHaveLength(6);
  expect(split.pendingEmissions.find(({ effectId }) => effectId === "shotgun.split")?.pendingTokens).toEqual([
    expect.objectContaining({ effectId: "dustlineDuel.afterimage", distance: 32 }),
  ]);
  expect(split.pendingEffectTokens).toEqual([
    expect.objectContaining({ effectId: "dustlineDuel.afterimage", distance: 32, rootTriggerId: "trigger-1" }),
  ]);
  const materialized = resolveCombatPhases({ ...split, step: split.step + 1 }, context(splitBuild));
  expect(materialized.pendingEffectTokens).toHaveLength(1);
});

test("Soul Harvester captures the first ordered kill and selects two distinct nearest live targets once per root", () => {
  const build = compileCombatBuild({ soulHarvester: true });
  const state = resolveCombatPhases(runtime(build, {
    projectiles: [
      projectile("projectile-1", 300, ["soulHarvester.spirits"], { damage: 25, originPower: 99 }),
      projectile("projectile-2", 500, ["soulHarvester.spirits"], { damage: 25, originPower: 99 }),
    ],
    targets: [
      target("victim-a", 300, 20),
      target("victim-b", 500, 20),
      target("near-b", 350),
      target("near-a", 350),
      target("far", 530),
    ],
  }), context(build));

  expect(state.pendingEmissions.filter(({ effectId }) => effectId === "soulHarvester.spirits")).toHaveLength(1);
  const spirits = state.pendingEmissions.find(({ effectId }) => effectId === "soulHarvester.spirits")!;
  expect(spirits.specs).toHaveLength(2);
  expect(spirits.templates?.map(({ wantedTargetId }) => wantedTargetId)).toEqual(["near-a", "near-b"]);
  expect(spirits.specs.map(({ damage }) => damage)).toEqual([8.75, 8.75]);
  expect(state.metrics.hitEvents.slice(0, 2).map(({ originPower }) => originPower)).toEqual([25, 25]);

  const unmatched = resolveCombatPhases(runtime(build, {
    projectiles: [projectile("projectile-3", 300, ["soulHarvester.spirits"], { damage: 25 })],
    targets: [target("only-victim", 300, 20)],
  }), context(build));
  const unbound = unmatched.pendingEmissions.find(({ effectId }) => effectId === "soulHarvester.spirits")!;
  expect(unbound.specs).toHaveLength(2);
  expect(unbound.templates?.map(({ wantedTargetId }) => wantedTargetId)).toEqual([undefined, undefined]);
});

test("Bootleg Mint snapshots the successful post-bounce projectile once and ignores target ricochets", () => {
  const build = compileCombatBuild({ pinball: true, bootlegMint: true });
  const source = projectile("projectile-1", ROOM.maxX - 6, ["pinball.bounce", "pinball.relay", "bootlegMint.copy"], {
    localOrdinal: 2,
    damage: 20,
    remainingBounces: 2,
    bounceRetention: 0.9,
    behaviors: { relay: { speedScale: 1.35, radius: 160, turnRate: 3 * Math.PI } },
  });
  const bounced = resolveCombatPhases(runtime(build, { projectiles: [source], now: 0.1 }), context(build, { dt: 0.1 }));
  const minted = bounced.pendingEmissions.find(({ effectId }) => effectId === "bootlegMint.copy")!;
  expect(minted.specs).toHaveLength(1);
  expect(minted.specs[0]).toMatchObject({ speed: 135, bounces: 1 });
  expect(minted.specs[0]!.damage).toBeCloseTo(5.4, 12);
  expect(minted.specs[0]!.radius).toBeCloseTo(3.3, 12);
  expect(minted.specs[0]!.heading).toBeCloseTo(-Math.PI / 2, 10);
  expect(bounced.projectiles[0]?.emittedEffectIds).toContain("bootlegMint.copy");

  const targetBounce = resolveCombatPhases(runtime(build, {
    projectiles: [projectile("projectile-2", 300, ["pinball.bounce", "bootlegMint.copy"], {
      remainingBounces: 1,
    })],
    targets: [target("dummy", 300)],
  }), context(build));
  expect(targetBounce.pendingEmissions.find(({ effectId }) => effectId === "bootlegMint.copy")).toBeUndefined();
});

test("generation-one direct provenance is its creation effect while accuracy remains direct-only", () => {
  const build = compileCombatBuild({ boneOrchard: true, soulHarvester: true });
  const state = resolveCombatPhases(runtime(build, {
    projectiles: [projectile("projectile-9", 300, ["soulHarvester.spirits"], {
      generation: 1,
      emission: { artifactId: "boneOrchard", effectId: "boneOrchard.shards" },
      damage: 4,
      originPower: 20,
    })],
    targets: [target("target", 300, 3)],
  }), context(build));

  expect(state.metrics.hitEvents[0]).toMatchObject({
    source: "direct",
    artifactId: "boneOrchard",
    effectId: "boneOrchard.shards",
    originPower: 4,
  });
  expect(state.metrics).toMatchObject({ hits: 1, successfulProjectiles: 1, secondaryHits: 0 });
  expect(state.pendingEmissions).toEqual([]);
});

test("a root exceeding the finite generation-one descendant bound is rejected instead of truncated", () => {
  const build = compileCombatBuild({ shotgun: true });
  const rule = build.emissions[0]!;
  if (rule.kind !== "splitCone") throw new Error("expected Shotgun");
  const pending = Array.from({ length: 49 }, (_, lineage) => {
    const source = projectile(`source-${lineage}`, 300, [rule.effectId], { lineageId: `trigger-1:${lineage}` });
    const specs = Array.from({ length: rule.count }, (_, index) => ({
      triggerId: source.rootTriggerId,
      heading: index,
      damage: 5,
      speed: 100,
      radius: 3,
      lifetime: 8,
      freezeChance: 0,
      freezeDuration: 0,
      bounces: 0,
      bounceRetention: 1,
      behaviors: {},
    }));
    return buildGenerationOneEmission(source, rule, specs, 99, {
      childIds: specs.map((_, index) => `root-1-child-${lineage}-${index}`),
    });
  });

  expect(() => resolveCombatPhases(runtime(build, { pendingEmissions: pending }), context(build)))
    .toThrow("generation-one descendant bound");
});
