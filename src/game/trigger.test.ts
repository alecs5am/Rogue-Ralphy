import { expect, test } from "bun:test";
import { compileCombatBuild } from "./combat-build";
import { createCylinder, consumeRound } from "./cylinder";
import { expandTrigger, type TriggerContext } from "./trigger";
import { deriveWeapon } from "./weapon";

const context = (overrides: Partial<TriggerContext> = {}): TriggerContext => {
  const build = compileCombatBuild({ twinChamber: true, teslaBullets: true });
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
  expect(result.projectiles.every(({ effectIds }) =>
    effectIds.includes("baseRevolver.direct") && effectIds.includes("teslaBullets.multishot")
  )).toBe(true);
});

test("trigger expansion snapshots scheduled records", () => {
  const trigger = context();
  const result = expandTrigger(trigger);

  expect(Object.isFrozen(result.projectiles)).toBe(true);
  expect(result.projectiles.every((shot) => Object.isFrozen(shot) && Object.isFrozen(shot.effectIds))).toBe(true);
  expect(result.projectiles.map(({ spec }) => spec.heading)).toEqual([
    -8 * Math.PI / 180,
    0,
    8 * Math.PI / 180,
  ]);
});
