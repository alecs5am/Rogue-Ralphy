import { expect, test } from "bun:test";
import type { ArtifactLoadout } from "./artifacts";
import { compileCombatBuild } from "./combat-build";
import { createCylinder, consumeRound } from "./cylinder";
import { expandTrigger, type TriggerContext } from "./trigger";
import { deriveWeapon } from "./weapon";

type ContextOptions = Partial<TriggerContext> & { loadout?: ArtifactLoadout };

const context = (options: ContextOptions = {}): TriggerContext => {
  const { loadout = { twinChamber: true, teslaBullets: true }, ...overrides } = options;
  const build = compileCombatBuild(loadout);
  const round = consumeRound(createCylinder()).round!;
  return {
    rootTriggerId: "trigger-7",
    rootIndex: 7,
    round,
    aim: 0,
    origin: { x: 480, y: 288 },
    now: 2,
    stationaryCharged: false,
    lowHealth: false,
    build,
    weapon: deriveWeapon(build, 0),
    rng: () => 0.1,
    ...overrides,
  };
};

test("one root consumes one RNG decision and emits stable identities", () => {
  let calls = 0;
  const result = expandTrigger(context({ rng: () => { calls += 1; return 0.1; } }));

  expect(calls).toBe(1);
  expect(result.rootTriggerId).toBe("trigger-7");
  expect(result.roundsConsumed).toBe(1);
  expect(result.projectiles.every((shot) =>
    shot.generation === 0 && shot.rootTriggerId === "trigger-7" && shot.at === 2
  )).toBe(true);
  expect(result.projectiles.map(({ lineageId }) => lineageId)).toEqual([
    "trigger-7:0",
    "trigger-7:1",
    "trigger-7:2",
  ]);
  expect(result.projectiles.every(({ effectIds }) => effectIds.includes("baseRevolver.direct"))).toBe(true);
  expect(result.projectiles.filter(({ effectIds }) => effectIds.includes("teslaBullets.multishot"))).toHaveLength(1);
  expect(result.projectiles.every(({ effectIds }) => effectIds.includes("teslaBullets.link"))).toBe(true);
});

test("trigger expansion snapshots scheduled records", () => {
  const trigger = context();
  const result = expandTrigger(trigger);

  expect(Object.isFrozen(result.projectiles)).toBe(true);
  expect(result.projectiles.every((shot) => Object.isFrozen(shot) && Object.isFrozen(shot.effectIds))).toBe(true);
  expect(result.projectiles.every(({ spec }) => !("triggerId" in spec))).toBe(true);
  expect(result.projectiles.map(({ spec }) => spec.heading)).toEqual([
    -8 * Math.PI / 180,
    0,
    8 * Math.PI / 180,
  ]);
});

test("Last Bell activates only for the final consumed round", () => {
  const ordinary = expandTrigger(context({
    loadout: { lastBell: true },
    round: { slot: 0, echo: false, ammoBefore: 6 },
  }));
  const last = expandTrigger(context({
    loadout: { lastBell: true },
    round: { slot: 5, echo: false, ammoBefore: 1 },
  }));

  expect(ordinary.projectiles[0]!.effectIds).not.toContain("lastBell.round");
  expect(ordinary.projectiles[0]!.effectIds).not.toContain("lastBell.rings");
  expect(last.projectiles[0]!.effectIds).toEqual([
    "baseRevolver.direct",
    "lastBell.rings",
    "lastBell.round",
  ]);
});

test("conditional projectile effects follow their trigger context", () => {
  const loadout = { deadeye: true, stillwater: true, lastGaspLocket: true } as const;
  const inactive = expandTrigger(context({
    loadout,
    rootIndex: 2,
    round: { slot: 0, echo: false, ammoBefore: 6 },
    stationaryCharged: false,
    lowHealth: false,
  }));
  const active = expandTrigger(context({
    loadout,
    rootIndex: 3,
    round: { slot: 0, echo: true, ammoBefore: 6 },
    stationaryCharged: true,
    lowHealth: true,
  }));
  const offCadence = expandTrigger(context({
    loadout: { lastGaspLocket: true },
    rootIndex: 2,
    lowHealth: true,
  }));

  expect(inactive.projectiles[0]!.effectIds).toEqual(["baseRevolver.direct"]);
  expect(offCadence.projectiles[0]!.effectIds).toEqual(["baseRevolver.direct"]);
  expect(active.projectiles[0]!.effectIds).toEqual([
    "baseRevolver.direct",
    "deadeye.activeReload",
    "stillwater.charge",
    "lastGaspLocket.orbital",
  ]);
});

test("non-projectile root rules never become activated projectile effects", () => {
  const result = expandTrigger(context({
    loadout: {
      ghostPosse: true,
      recoilBoots: true,
      bonanzaClip: true,
      undertakersCoat: true,
    },
  }));

  expect(result.projectiles[0]!.effectIds).toEqual(["baseRevolver.direct"]);
});
