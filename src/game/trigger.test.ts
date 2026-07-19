import { expect, test } from "bun:test";
import type { ArtifactId, ArtifactLoadout } from "./artifacts";
import { compileCombatBuild } from "./combat-build";
import type { ProjectileSpec } from "./projectiles";
import { expandTrigger, type ScheduledProjectile, type TriggerContext } from "./trigger";
import { deriveWeapon } from "./weapon";

function scheduledSpecRejectsLegacyIdentity(legacySpec: ProjectileSpec) {
  // @ts-expect-error triggerId belongs to the root schedule, never its projectile spec
  const scheduledSpec: ScheduledProjectile["spec"] = legacySpec;
  return scheduledSpec;
}
void scheduledSpecRejectsLegacyIdentity;

const ROW_ONE = [
  ["twinChamber", { count: 2, headings: [0, 0], damage: 0.70, convergeMin: 96, convergeMax: 480 }],
  ["deadeye", { echoDelay: 0.12, echoDamage: 0.35, echoSlots: 6 }],
  ["lastBell", { ammoBefore: 1, speed: 0.45, radius: 1.60, damage: 1.50, rings: 3, interval: 0.25 }],
  ["graveEcho", { delay: 0.28, damage: 0.40 }],
  ["fanThePhantom", { delays: [0, 0.09, 0.18], centers: [-8, 0, 8], damage: 0.45 }],
  ["dealersCut", { cadence: 3, offsets: [-35, 35], damage: 0.55 }],
] as const;

type ContextOptions = Partial<Omit<TriggerContext, "build" | "weapon">> & {
  owned?: readonly ArtifactId[];
};

const degrees = Math.PI / 180;
const deadeyeEcho = Object.freeze({ delay: ROW_ONE[1][1].echoDelay, damageScale: ROW_ONE[1][1].echoDamage });

const triggerContext = (options: ContextOptions = {}): TriggerContext => {
  const { owned = ["twinChamber", "teslaBullets"], ...overrides } = options;
  const loadout = Object.fromEntries(owned.map((id) => [id, true])) as ArtifactLoadout;
  const build = compileCombatBuild(loadout);
  return {
    rootTriggerId: "trigger-7",
    rootIndex: 7,
    round: { slot: 0, echo: owned.includes("deadeye") ? deadeyeEcho : null, ammoBefore: 6 },
    aim: 0,
    aimDistance: 300,
    origin: { x: 480, y: 288 },
    now: 0,
    stationaryCharged: false,
    lowHealth: false,
    dealerCounter: 0,
    locketState: { armed: false, cadence: 0 },
    build,
    weapon: deriveWeapon(build, 0),
    rng: () => 0.1,
    ...overrides,
  };
};

test.each(ROW_ONE)("%s expands its exact trigger signature", (artifactId, signature) => {
  const shared = { owned: [artifactId] as ArtifactId[], rootIndex: 3 };

  switch (artifactId) {
    case "twinChamber": {
      const exact = signature as (typeof ROW_ONE)[0][1];
      const shots = expandTrigger(triggerContext({ ...shared, aimDistance: 999 })).projectiles.filter(({ generation }) => generation === 0);
      expect(shots).toHaveLength(exact.count);
      expect(shots.map(({ spec }) => spec.heading)).toEqual([...exact.headings]);
      expect(shots.map(({ spec }) => spec.damage)).toEqual([14, 14]);
      expect(shots.map(({ spec }) => spec.behaviors.converge)).toEqual([
        { distance: exact.convergeMax, lateralOffset: -18 },
        { distance: exact.convergeMax, lateralOffset: 18 },
      ]);
      break;
    }
    case "deadeye": {
      const exact = signature as (typeof ROW_ONE)[1][1];
      const result = expandTrigger(triggerContext(shared));
      const echoes = result.projectiles.filter(({ generation }) => generation === 1);
      expect(echoes).toHaveLength(1);
      expect(echoes[0]).toMatchObject({
        at: result.now + exact.echoDelay,
        emission: { artifactId: "deadeye", effectId: "deadeye.echo" },
        spec: { damage: 20 * exact.echoDamage },
      });
      break;
    }
    case "lastBell": {
      const exact = signature as (typeof ROW_ONE)[2][1];
      const result = expandTrigger(triggerContext({
        ...shared,
        round: { slot: 5, echo: null, ammoBefore: exact.ammoBefore },
      }));
      expect(result.projectiles[0]).toMatchObject({
        localOrdinal: 0,
        spec: {
          speed: 620 * exact.speed,
          radius: 5 * exact.radius,
          damage: 20 * exact.damage,
          bell: { count: exact.rings, interval: exact.interval, radius: 44, damageScale: 0.25 },
        },
      });
      break;
    }
    case "graveEcho": {
      const exact = signature as (typeof ROW_ONE)[3][1];
      const result = expandTrigger(triggerContext(shared));
      expect(result.projectiles.find(({ emission }) => emission?.artifactId === "graveEcho")).toMatchObject({
        at: result.now + exact.delay,
        generation: 1,
        emission: { artifactId: "graveEcho", effectId: "graveEcho.copy" },
        spec: { damage: 20 * exact.damage },
      });
      break;
    }
    case "fanThePhantom": {
      const exact = signature as (typeof ROW_ONE)[4][1];
      const result = expandTrigger(triggerContext(shared));
      expect(result.projectiles.map(({ at }) => at - result.now)).toEqual([...exact.delays]);
      expect(result.projectiles.map(({ spec }) => spec.heading / degrees)).toEqual([...exact.centers]);
      expect(result.projectiles.map(({ spec }) => spec.damage)).toEqual([9, 9, 9]);
      break;
    }
    case "dealersCut": {
      const exact = signature as (typeof ROW_ONE)[5][1];
      const result = expandTrigger(triggerContext({ ...shared, dealerCounter: exact.cadence - 1 }));
      expect(result.projectiles.slice(1).map(({ spec }) => spec.heading / degrees)).toEqual([...exact.offsets]);
      expect(result.projectiles.slice(1).map(({ spec }) => spec.damage)).toEqual([11, 11]);
      expect(result.dealerCounter).toBe(0);
      break;
    }
  }
});

test("Tesla consumes one owned roll and reuses its outcome for every Fan volley", () => {
  let calls = 0;
  const result = expandTrigger(triggerContext({
    owned: ["twinChamber", "teslaBullets", "fanThePhantom"],
    rng: () => { calls += 1; return 0.1; },
  }));
  const roots = result.projectiles.filter(({ generation }) => generation === 0);
  expect(calls).toBe(1);
  expect(roots).toHaveLength(9);
  expect(roots.map(({ spec }) => spec.heading / degrees)).toEqual([-8, -8, -8, 0, 0, 0, 8, 8, 8]);
  expect(roots.filter(({ effectIds }) => effectIds.includes("teslaBullets.multishot"))).toHaveLength(3);

  calls = 0;
  const absent = expandTrigger(triggerContext({ owned: ["fanThePhantom"], rng: () => { calls += 1; return 0; } }));
  expect(calls).toBe(0);
  expect(absent.projectiles).toHaveLength(3);
});

test("Tesla uses a centered singleton on failure and an ordinary -4/+4 pair without Twin", () => {
  const failed = expandTrigger(triggerContext({ owned: ["teslaBullets"], rng: () => 0.33 }));
  const passed = expandTrigger(triggerContext({ owned: ["teslaBullets"], rng: () => 0.329 }));
  expect(failed.projectiles.map(({ spec }) => spec.heading)).toEqual([0]);
  expect(passed.projectiles.map(({ spec }) => spec.heading / degrees)).toEqual([-4, 4]);
});

test("Halo stores a separate phase without changing Twin and Tesla headings", () => {
  const roots = expandTrigger(triggerContext({
    owned: ["twinChamber", "teslaBullets", "haloChamber"],
  })).projectiles.filter(({ generation }) => generation === 0);
  expect(roots.map(({ spec }) => spec.heading)).toEqual([0, 0, 0]);
  expect(roots.map(({ spec }) => spec.motionPhase)).toEqual([0, Math.PI * 2 / 3, Math.PI * 4 / 3]);
});

test("Stillwater and Big Iron each transform the neutral base exactly once", () => {
  const result = expandTrigger(triggerContext({
    owned: ["stillwater", "bigIron"],
    stationaryCharged: true,
  }));
  const main = result.projectiles.find(({ generation }) => generation === 0)!;
  expect(main.spec).toMatchObject({
    damage: 20 * 1.6 * 1.2,
    speed: 620 * 0.8,
    radius: 5 * 2 * 1.25,
    behaviors: { penetration: { obstacles: true, targets: true } },
  });
});

test("Dealer appends only to the first Fan volley with numeric ordinals", () => {
  const roots = expandTrigger(triggerContext({
    owned: ["twinChamber", "teslaBullets", "fanThePhantom", "dealersCut"],
    rootIndex: 50,
    dealerCounter: 2,
  })).projectiles.filter(({ generation }) => generation === 0);

  expect(roots.map(({ localOrdinal }) => localOrdinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(roots.slice(9).map(({ at }) => at)).toEqual([0, 0]);
  expect(roots.slice(9).map(({ spec }) => spec.heading / degrees)).toEqual([-35, 35]);
  expect(roots.slice(9).map(({ spec }) => spec.damage)).toEqual([11, 11]);
});

test("row-one composition launches eleven generation-zero projectiles for one cartridge", () => {
  const result = expandTrigger(triggerContext({
    owned: ["twinChamber", "deadeye", "lastBell", "graveEcho", "fanThePhantom", "dealersCut", "teslaBullets"],
    rootIndex: 3,
    dealerCounter: 2,
    round: { slot: 1, echo: deadeyeEcho, ammoBefore: 2 },
    rng: () => 0.1,
  }));
  const roots = result.projectiles.filter(({ generation }) => generation === 0);
  expect(roots).toHaveLength(11);
  expect(result.roundsConsumed).toBe(1);
  expect(roots.map(({ at }) => at - result.now)).toEqual([
    0, 0, 0, 0.09, 0.09, 0.09, 0.18, 0.18, 0.18, 0, 0,
  ]);
  expect(roots.slice(0, 9).map(({ spec }) => spec.damage)).toEqual(Array.from({ length: 9 }, () => 20 * 0.7 * 0.45));
  expect(roots.slice(9).map(({ spec }) => spec.damage)).toEqual([11, 11]);
  expect(result.projectiles.filter(({ emission }) => emission?.effectId === "graveEcho.copy").map(({ at }) => at))
    .toContain(result.now + 0.28);
});

test("Deadeye and Grave copy finished roots at each source time without copying Locket or split payload", () => {
  const result = expandTrigger(triggerContext({
    owned: [
      "deadeye", "graveEcho", "fanThePhantom", "teslaBullets", "stillwater", "lastGaspLocket",
      "bigIron", "shotgun", "spectralBullets", "pinball", "haloChamber",
    ],
    round: { slot: 0, echo: deadeyeEcho, ammoBefore: 6 },
    stationaryCharged: true,
    lowHealth: true,
    locketState: { armed: true, cadence: 0 },
  }));
  const roots = result.projectiles.filter(({ generation }) => generation === 0);
  const locket = roots.find(({ effectIds }) => effectIds.includes("lastGaspLocket.orbital"))!;
  const copies = result.projectiles.filter(({ generation, emission }) => generation === 1 &&
    (emission?.artifactId === "deadeye" || emission?.artifactId === "graveEcho"));

  expect(copies).toHaveLength((roots.length - 1) * 2);
  expect(copies.some(({ lineageId }) => lineageId === locket.lineageId)).toBe(false);
  expect(copies.every(({ effectIds, emission }) => !effectIds.includes(emission!.effectId))).toBe(true);
  expect(copies.every(({ spec, effectIds }) =>
    spec.behaviors.split === undefined &&
    spec.behaviors.spiral !== undefined && spec.behaviors.tesla !== undefined &&
    spec.behaviors.penetration?.targets === true && spec.bounces === 1 &&
    !effectIds.includes("shotgun.split")
  )).toBe(true);
  for (const copy of copies) {
    const source = roots.find(({ lineageId }) => lineageId === copy.lineageId)!;
    const scale = copy.emission!.artifactId === "deadeye" ? 0.35 : 0.4;
    expect(copy.at).toBeCloseTo(source.at + (copy.emission!.artifactId === "deadeye" ? 0.12 : 0.28));
    expect(copy.spec).toMatchObject({
      heading: source.spec.heading,
      speed: source.spec.speed,
      radius: source.spec.radius,
      damage: source.spec.damage * scale,
      freezeChance: source.spec.freezeChance,
      bounces: source.spec.bounces,
    });
  }
});

test("an armed Locket preserves a bell-only trigger and later converts the highest non-bell ordinal", () => {
  const bellOnly = expandTrigger(triggerContext({
    owned: ["lastBell", "lastGaspLocket", "deadeye", "graveEcho", "bigIron"],
    round: { slot: 5, echo: deadeyeEcho, ammoBefore: 1 },
    lowHealth: true,
    locketState: { armed: true, cadence: 0 },
  }));
  expect(bellOnly.projectiles.filter(({ generation }) => generation === 0)).toHaveLength(1);
  expect(bellOnly.locketState).toEqual({ armed: true, cadence: 0 });

  const converted = expandTrigger(triggerContext({
    owned: ["twinChamber", "lastGaspLocket", "deadeye", "graveEcho", "bigIron"],
    round: { slot: 0, echo: deadeyeEcho, ammoBefore: 2 },
    lowHealth: true,
    locketState: bellOnly.locketState,
  }));
  const roots = converted.projectiles.filter(({ generation }) => generation === 0);
  const orbital = roots.find(({ effectIds }) => effectIds.includes("lastGaspLocket.orbital"))!;
  expect(orbital.localOrdinal).toBe(Math.max(...roots.map(({ localOrdinal }) => localOrdinal)));
  expect(converted.locketState).toEqual({ armed: false, cadence: 0 });
  expect(converted.projectiles.filter(({ generation, lineageId }) => generation === 1 && lineageId === orbital.lineageId)).toEqual([]);
  expect(orbital.effectIds).not.toContain("bigIron.heavy");
});

test("an armed Locket converts a sole ordinary final cartridge when Last Bell is not owned", () => {
  const result = expandTrigger(triggerContext({
    owned: ["lastGaspLocket"],
    round: { slot: 5, echo: null, ammoBefore: 1 },
    lowHealth: true,
    locketState: { armed: true, cadence: 0 },
  }));

  expect(result.projectiles).toHaveLength(1);
  expect(result.projectiles[0]?.effectIds).toContain("lastGaspLocket.orbital");
  expect(result.locketState).toEqual({ armed: false, cadence: 0 });
});

test("trigger expansion freezes numeric ordering and explicit copy provenance", () => {
  const result = expandTrigger(triggerContext({ owned: ["graveEcho"] }));
  expect(Object.isFrozen(result.projectiles)).toBe(true);
  expect(result.projectiles.every((shot) => Object.isFrozen(shot) && Object.isFrozen(shot.effectIds))).toBe(true);
  expect(result.projectiles.every(({ spec }) => !("triggerId" in spec))).toBe(true);
  expect(result.projectiles.map(({ rootIndex, localOrdinal }) => [rootIndex, localOrdinal])).toEqual([[7, 0], [7, 1]]);
  expect(result.projectiles[1]?.emission).toEqual({ artifactId: "graveEcho", effectId: "graveEcho.copy" });
  expect(result.projectiles[1]?.effectIds).toEqual(["baseRevolver.direct"]);
});

test("non-projectile root rules never become activated projectile effects", () => {
  const result = expandTrigger(triggerContext({
    owned: ["ghostPosse", "recoilBoots", "bonanzaClip", "undertakersCoat"],
  }));
  expect(result.projectiles[0]!.effectIds).toEqual(["baseRevolver.direct"]);
});
