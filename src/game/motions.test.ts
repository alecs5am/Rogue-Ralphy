import { expect, test } from "bun:test";
import type { MotionRule } from "./combat-build";
import { applyMotionRules, selectMotionTarget } from "./motions";
import type { ProjectileState, TrajectoryTarget } from "./projectiles";

const rule = <Kind extends MotionRule["kind"]>(
  value: Omit<Extract<MotionRule, { kind: Kind }>, "family" | "artifactId" | "effectId" | "phase"> & { kind: Kind },
): Extract<MotionRule, { kind: Kind }> => ({
  family: "motion",
  artifactId: (({
    spiral: "haloChamber", homing: "ghostSight", relay: "pinball", wave: "wailingLead",
    return: "undertakersReturn", comet: "cometSpur", converge: "twinChamber",
  } as const) as Partial<Record<MotionRule["kind"], MotionRule["artifactId"]>>)[value.kind] ?? "haloChamber",
  effectId: `test.${value.kind}`,
  phase: 1,
  ...value,
} as Extract<MotionRule, { kind: Kind }>);

const ROW_TWO = [
  rule({ kind: "spiral", initialRadius: 24, radialSpeed: 48, angularSpeed: 3 * Math.PI, lifetime: 4 }),
  rule({ kind: "homing", radius: 96, turnRate: 3 * Math.PI }),
  rule({ kind: "relay", speedScale: 1.35, radius: 160, turnRate: 3 * Math.PI }),
  rule({ kind: "wave", amplitude: 22, wavelength: 144 }),
  rule({ kind: "return", outbound: 240, inbound: 240, damageScale: 0.65 }),
  rule({ kind: "comet", duration: 1, speedScale: 1.5, radiusScale: 1.5, damageScale: 1.35 }),
] as const;

const projectile = (overrides: Record<string, unknown> = {}): ProjectileState => ({
  id: "projectile-1", triggerId: "trigger-1", rootTriggerId: "trigger-1", lineageId: "lineage-1",
  generation: 0, activatedEffectIds: ["baseRevolver.direct"], originPower: 100,
  x: 0, y: 0, vx: 100, vy: 0, speed: 100, radius: 10, damage: 100, lifetime: 8, bornAt: 0,
  remainingBounces: 0, bounceRetention: 1, freezeChance: 0, freezeDuration: 0,
  behaviors: {}, hitTargetIds: [], everHit: false, travelled: 0,
  baseHeading: 0, childIndex: 0, childCount: 1, legTravelled: 0,
  outboundHitTargetIds: [], returnHitTargetIds: [], motionRules: [],
  ...overrides,
} as unknown as ProjectileState);

test("motion order is anchor spiral converge wave accelerate return homing sweep", () => {
  const result = applyMotionRules(projectile({
    motionRules: ROW_TWO,
    behaviors: { spiral: ROW_TWO[0], homing: { radius: 96, turnRate: 3 * Math.PI } },
    spiralOrigin: { x: -24, y: 0 }, spiralRadius: 24, spiralAngle: 0, haloPhase: 0,
    converge: { side: 1, distance: 240 }, convergeOffset: 0,
  }), [], 1 / 120, 1 / 120);

  expect(result.trace).toEqual(["anchor", "spiral", "converge", "wave", "accelerate", "return", "homing", "sweep"]);
  expect(result.path.length).toBeGreaterThan(0);
  expect(result.path[0]!.startTime).toBe(0);
  expect(result.path.at(-1)!.endTime).toBe(1);
});

test("unmodified Halo follows the exact polar equation at ages zero and one half", () => {
  const halo = projectile({
    x: 24, y: 0, vx: 48, vy: 24 * 3 * Math.PI,
    motionRules: [ROW_TWO[0]], behaviors: { spiral: ROW_TWO[0] },
    spiralOrigin: { x: 0, y: 0 }, spiralRadius: 24, spiralAngle: 0, haloPhase: 0,
  });

  const result = applyMotionRules(halo, [], 0.5, 0.5);

  expect(result.projectile.spiralOrigin).toEqual({ x: 0, y: 0 });
  expect(result.projectile.spiralRadius).toBeCloseTo(48, 10);
  expect(result.projectile.spiralAngle).toBeCloseTo(1.5 * Math.PI, 10);
  expect(result.projectile.x).toBeCloseTo(0, 10);
  expect(result.projectile.y).toBeCloseTo(-48, 10);
});

test("Wailing Lead uses stable sibling phase and bounded deterministic tessellation", () => {
  const wave = ROW_TWO[3];
  const root = applyMotionRules(projectile({ motionRules: [wave], wavePhase: 0 }), [], 0.36, 0.36);
  const child = applyMotionRules(projectile({
    generation: 1, motionRules: [wave], childIndex: 1, childCount: 2, wavePhase: Math.PI,
  }), [], 0.36, 0.36);

  expect(root.projectile).toMatchObject({ x: 36, y: 22 });
  expect(child.projectile.x).toBeCloseTo(36, 10);
  expect(child.projectile.y).toBeCloseTo(-22, 10);
  expect(root.path).toHaveLength(4);
  expect(root.path.every((segment) => segment.endWavePhase! - segment.startWavePhase! <= Math.PI / 8 + 1e-12)).toBe(true);
});

test("Comet Spur integrates speed and applies spawn-baseline factors without compounding", () => {
  const comet = ROW_TWO[5];
  const half = applyMotionRules(projectile({ motionRules: [comet] }), [], 0.5, 0.5).projectile;
  const whole = applyMotionRules(half, [], 0.5, 1).projectile;

  expect(half.speed).toBeCloseTo(125, 10);
  expect(half.radius).toBeCloseTo(12.5, 10);
  expect(half.damage).toBeCloseTo(117.5, 10);
  expect(half.x).toBeCloseTo(56.25, 10);
  expect(whole.speed).toBeCloseTo(150, 10);
  expect(whole.radius).toBeCloseTo(15, 10);
  expect(whole.damage).toBeCloseTo(135, 10);
  expect(whole.x).toBeCloseTo(125, 10);
});

test("Undertaker's Return splits the step immediately after 240 actual pixels", () => {
  const returning = projectile({ motionRules: [ROW_TWO[4]] });
  const before = applyMotionRules(returning, [], 2.399, 2.399);
  const after = applyMotionRules(returning, [], 2.401, 2.401);

  expect(before.projectile).toMatchObject({ returnLeg: "outbound", damage: 100 });
  expect(before.projectile.x).toBeCloseTo(239.9, 8);
  expect(after.projectile).toMatchObject({ returnLeg: "return", damage: 65 });
  expect(after.projectile.legTravelled).toBeCloseTo(0.1, 10);
  expect(after.projectile.x).toBeCloseTo(239.9, 8);
  expect(after.projectile.vx).toBeLessThan(0);
  expect(after.path.map(({ leg }) => leg)).toContain("return");
});

test("Undertaker gives roots 480 total pixels but expires short-range children before returning", () => {
  const motion = ROW_TWO[4];
  const root = applyMotionRules(projectile({ motionRules: [motion] }), [], 4.8, 4.8);
  const child = applyMotionRules(projectile({
    generation: 1,
    motionRules: [motion],
    maxTravel: 320,
  }), [], 3, 3);

  expect(root).toMatchObject({ expired: true, projectile: { returnLeg: "return" } });
  expect(root.projectile.travelled).toBeCloseTo(480, 8);
  expect(root.projectile.x).toBeCloseTo(0, 8);
  expect(child).toMatchObject({ expired: true, projectile: { returnLeg: "outbound" } });
  expect(child.projectile.travelled).toBeCloseTo(240, 8);
  expect(child.path.at(-1)?.distanceEffect).toBe("return-expire");
});

test("target reducers use Pinball then retained Ghost then Wanted and highest steering cap", () => {
  const targets: TrajectoryTarget[] = [
    { id: "wanted", x: 20, y: 0, health: 1 },
    { id: "ghost", x: 30, y: 0, health: 1 },
    { id: "relay", x: 40, y: 0, health: 1 },
  ];
  const armed = projectile({
    motionRules: [ROW_TWO[1], ROW_TWO[2]], relayTargetId: "relay", homingTargetId: "ghost",
    wantedTargetId: "wanted", wantedTurnRate: 2 * Math.PI / 3,
  });

  expect(selectMotionTarget(armed, targets)).toMatchObject({ targetId: "relay", turnRate: 3 * Math.PI });
  expect(selectMotionTarget({ ...armed, relayTargetId: "lost", relayLost: true } as ProjectileState, targets))
    .toMatchObject({ targetId: "ghost", turnRate: 3 * Math.PI });
});
