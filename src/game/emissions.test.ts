import { expect, test } from "bun:test";
import { compileCombatBuild, type EmissionRule } from "./combat-build";
import {
  buildGenerationOneEmission,
  materializeEmission,
  resolveImpactRules,
  sortPendingEmissions,
} from "./emissions";
import type { ProjectileSpec, ProjectileState } from "./projectiles";

const ROW_THREE = [
  ["shotgun", { distance: 160, count: 8, childRange: 320, cone: 48, damage: 0.25, radius: 0.55 }],
  ["hollowPoint", { storedDamage: 0.60, duration: 2, explosionRadius: 64 }],
  ["boneOrchard", { offsets: [-18, 0, 18], damage: 0.20, radius: 0.55, range: 160 }],
  ["graveBloom", { count: 6, damage: 0.18, radius: 0.45, range: 128 }],
  ["soulHarvester", { count: 2, damage: 0.35, acquireRadius: 240 }],
  ["bootlegMint", { tangent: 90, damage: 0.30, radius: 0.55, range: 160 }],
] as const;

const projectile = (overrides: Partial<ProjectileState> = {}): ProjectileState => ({
  id: "projectile-7",
  triggerId: "trigger-3",
  generation: 0,
  rootTriggerId: "trigger-3",
  lineageId: "trigger-3:2",
  localOrdinal: 2,
  activatedEffectIds: ["baseRevolver.direct", "boneOrchard.shards"],
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
  remainingBounces: 1,
  bounceRetention: 0.9,
  freezeChance: 0,
  freezeDuration: 0,
  behaviors: { penetration: { obstacles: true, targets: true } },
  penetration: { obstacles: true, targets: true },
  hitTargetIds: ["old-target"],
  outboundHitTargetIds: ["old-target"],
  returnHitTargetIds: ["return-target"],
  everHit: true,
  travelled: 42,
  ...overrides,
});

const spec = (heading: number): ProjectileSpec => ({
  triggerId: "trigger-3",
  heading,
  damage: 4,
  speed: 100,
  radius: 3.3,
  lifetime: 8,
  freezeChance: 0,
  freezeDuration: 0,
  bounces: 1,
  bounceRetention: 0.9,
  behaviors: { penetration: { obstacles: true, targets: true } },
});

const rule = (effectId: string): EmissionRule => {
  const found = compileCombatBuild({ boneOrchard: true, graveBloom: true, shotgun: true })
    .emissions.find((candidate) => candidate.effectId === effectId);
  if (!found) throw new Error(`missing ${effectId}`);
  return found;
};

test("row-three descriptors retain their exact approved signatures", () => {
  const shotgun = rule("shotgun.split");
  const hollowBuild = compileCombatBuild({ hollowPoint: true });
  const charge = hollowBuild.impacts.find(({ effectId }) => effectId === "hollowPoint.charge")!;
  const explosion = hollowBuild.areas.find(({ effectId }) => effectId === "hollowPoint.explosion")!;
  const bone = rule("boneOrchard.shards");
  const bloom = rule("graveBloom.expiry");
  const harvester = compileCombatBuild({ soulHarvester: true }).emissions[0]!;
  const mint = compileCombatBuild({ bootlegMint: true }).emissions[0]!;

  const signatures = [
    ["shotgun", shotgun.kind === "splitCone" && { distance: shotgun.distance, count: shotgun.count, childRange: shotgun.range, cone: shotgun.angle * 180 / Math.PI, damage: shotgun.damageScale, radius: shotgun.radiusScale }],
    ["hollowPoint", charge.kind === "embeddedCharge" && explosion.kind === "explosion" && { storedDamage: charge.storedDamageScale, duration: charge.duration, explosionRadius: explosion.radius }],
    ["boneOrchard", bone.kind === "forwardShards" && { offsets: [-bone.angle, 0, bone.angle].map((angle) => angle * 180 / Math.PI), damage: bone.damageScale, radius: bone.radiusScale, range: bone.range }],
    ["graveBloom", bloom.kind === "expiryRadial" && { count: bloom.count, damage: bloom.damageScale, radius: bloom.radiusScale, range: bloom.range }],
    ["soulHarvester", harvester.kind === "killSpirits" && { count: harvester.count, damage: harvester.damageScale, acquireRadius: harvester.radius }],
    ["bootlegMint", mint.kind === "tangentCopy" && { tangent: mint.angle * 180 / Math.PI, damage: mint.damageScale, radius: mint.radiusScale, range: mint.range }],
  ];
  expect(JSON.stringify(signatures)).toBe(JSON.stringify(ROW_THREE));
});

test("generation-one children retain creation provenance but inherit no emission eligibility", () => {
  const bone = rule("boneOrchard.shards");
  const pending = buildGenerationOneEmission(
    projectile(),
    bone,
    [spec(-Math.PI / 10), spec(0), spec(Math.PI / 10)],
    4,
    { childIds: ["projectile-20", "projectile-21", "projectile-22"] },
  );
  const children = materializeEmission(pending, 2);

  expect(pending.atStep).toBe(5);
  expect(children.map(({ id, localOrdinal }) => [id, localOrdinal])).toEqual([
    ["projectile-20", 0], ["projectile-21", 1], ["projectile-22", 2],
  ]);
  expect(children.every(({ generation }) => generation === 1)).toBe(true);
  expect(children.every(({ emission }) => emission?.effectId === "boneOrchard.shards")).toBe(true);
  expect(children.every(({ activatedEffectIds }) => !activatedEffectIds.includes("boneOrchard.shards"))).toBe(true);
  expect(children.every(({ emittedEffectIds }) => emittedEffectIds.length === 0)).toBe(true);
  expect(resolveImpactRules({ source: children[0]!, build: compileCombatBuild({ boneOrchard: true }), kind: "direct" }))
    .toMatchObject({ emissions: [] });
});

test("generation-one emissions reject ineligible, repeated, deep, and wrong-count sources", () => {
  const bone = rule("boneOrchard.shards");
  const specs = [spec(-Math.PI / 10), spec(0), spec(Math.PI / 10)];
  expect(() => buildGenerationOneEmission(projectile({ activatedEffectIds: [] }), bone, specs, 1))
    .toThrow("boneOrchard.shards is not eligible");
  expect(() => buildGenerationOneEmission(projectile({ emittedEffectIds: [bone.effectId] }), bone, specs, 1))
    .toThrow("boneOrchard.shards already emitted for lineage");
  expect(() => buildGenerationOneEmission(projectile({ generation: 1 }), bone, specs, 1))
    .toThrow("generation-one projectile cannot emit");
  expect(() => buildGenerationOneEmission(projectile(), bone, specs.slice(0, 2), 1))
    .toThrow("boneOrchard.shards must emit exactly 3 children");
});

test("materialized children keep queue-time origin and traits with fresh target histories", () => {
  const source = projectile();
  const pending = buildGenerationOneEmission(
    source,
    rule("boneOrchard.shards"),
    [spec(-Math.PI / 10), spec(0), spec(Math.PI / 10)],
    1,
    { childIds: ["child-0", "child-1", "child-2"], origin: { x: 12, y: 34 } },
  );
  source.x = 999;
  source.hitTargetIds.push("later-target");
  const child = materializeEmission(pending, 9)[0]!;

  expect(child).toMatchObject({
    id: "child-0",
    x: 12,
    y: 34,
    bornAt: 9,
    originPower: 20,
    remainingBounces: 1,
    penetration: { obstacles: true, targets: true },
    hitTargetIds: [],
    outboundHitTargetIds: [],
    returnHitTargetIds: [],
    everHit: false,
  });
});

test("pending emission ordering uses step root lineage phase effect and numeric child ordinal", () => {
  const bone = rule("boneOrchard.shards");
  const bloom = rule("graveBloom.expiry");
  const make = (source: ProjectileState, emissionRule: EmissionRule, count: number, step: number) =>
    buildGenerationOneEmission(source, emissionRule, Array.from({ length: count }, (_, index) => spec(index)), step, {
      childIds: Array.from({ length: count }, (_, index) => `${source.id}-child-${index}`),
    });
  const pending = [
    make(projectile({ id: "p10", rootTriggerId: "trigger-10", activatedEffectIds: [bloom.effectId] }), bloom, 6, 1),
    make(projectile({ id: "p2", rootTriggerId: "trigger-2" }), bone, 3, 1),
    make(projectile({ id: "p1", rootTriggerId: "trigger-1" }), bone, 3, 2),
  ];

  expect(sortPendingEmissions(pending).map(({ atStep, rootTriggerId, effectId }) => [atStep, rootTriggerId, effectId]))
    .toEqual([[2, "trigger-10", "graveBloom.expiry"], [2, "trigger-2", "boneOrchard.shards"], [3, "trigger-1", "boneOrchard.shards"]]);
});
