import { expect, test } from "bun:test";
import { compileCombatBuild } from "./combat-build";
import { ammoCount, consumeRound, createCylinder, startReload } from "./cylinder";
import type { KillContext } from "./emissions";
import {
  advanceLocketOrbitals,
  createLocketOrbital,
  queueBonanzaRefunds,
  resolveBoundaryClamp,
  resolvePendingRefunds,
  resolveStillwater,
  sortPendingRefunds,
  type PendingRefund,
  type RecoilWindow,
} from "./reactive";
import { deriveWeapon } from "./weapon";

const sourceSpec = Object.freeze({
  heading: 0,
  ...deriveWeapon(compileCombatBuild({}), 0).projectileBase,
});

const recoil = (
  rootIndex: number,
  vector: Readonly<{ x: number; y: number }> = { x: -55, y: 0 },
): RecoilWindow => ({
  effectId: "recoilBoots.recoil",
  rootTriggerId: `trigger-${rootIndex}`,
  rootIndex,
  vector,
  expiresAt: 1.35,
  refunded: false,
});

test("Recoil Boots resolves every live into-boundary window once in numeric root order", () => {
  const result = resolveBoundaryClamp({
    recoilWindows: [recoil(2), recoil(1), recoil(3, { x: 0, y: -55 }), recoil(4, { x: 55, y: 0 })],
    pendingRefunds: [],
  }, { left: true, right: false, top: false, bottom: false }, 1);

  expect(result.pendingRefunds.map(({ rootTriggerId }) => rootTriggerId)).toEqual(["trigger-1", "trigger-2"]);
  expect(result.recoilWindows.map(({ rootTriggerId }) => rootTriggerId)).toEqual(["trigger-3", "trigger-4"]);
});

test("Stillwater charges only below one px/s, consumes exactly once, and accepted damage clears it", () => {
  const almost = resolveStillwater({ progress: 0, charged: false }, true, 0.999, 0.59, false);
  expect(almost).toEqual({ progress: 0.59, charged: false });
  const charged = resolveStillwater(almost, true, 0.999, 0.01, false);
  expect(charged).toEqual({ progress: 0.6, charged: true });
  expect(resolveStillwater(charged, true, 1, 1 / 120, false)).toEqual({ progress: 0, charged: false });
  expect(resolveStillwater(charged, true, 0, 1 / 120, true)).toEqual({ progress: 0, charged: false });
  expect(resolveStillwater(charged, false, 0, 1, false)).toEqual({ progress: 0, charged: false });
});

test("Bonanza queues only the first eligible depth-zero generation-zero kill per root", () => {
  const kill = (overrides: Partial<KillContext>): KillContext => ({
    victimId: "target-1", x: 10, y: 20, time: 1, source: "direct", generation: 0,
    reactiveEffectIds: ["bonanzaClip.refund"], artifactId: "baseRevolver", effectId: "baseRevolver.direct",
    rootTriggerId: "trigger-3", lineageId: "trigger-3:0", projectileId: "projectile-1",
    originPower: 20, killReactionDepth: 0, ...overrides,
  });
  const result = queueBonanzaRefunds([
    kill({ victimId: "target-2" }),
    kill({ victimId: "target-1" }),
    kill({ victimId: "child", generation: 1 }),
    kill({ victimId: "reaction", killReactionDepth: 1 }),
  ], {}, 0.25, createCylinder(5), []);

  expect(result.pendingRefunds).toEqual([expect.objectContaining({
    effectId: "bonanzaClip.refund", rootTriggerId: "trigger-3", rootIndex: 3, arrivesAt: 1.25,
    from: { x: 10, y: 20 }, slot: 5, artifactId: "bonanzaClip",
  })]);
  expect(Object.keys(result.history)).toEqual(["bonanzaClip.refund\0trigger-3"]);
});

test("Bonanza reserves the seventh cylinder slot after six earlier deliveries", () => {
  const existingRefunds = Array.from({ length: 6 }, (_, slot): PendingRefund => ({
    effectId: "bonanzaClip.refund",
    artifactId: "bonanzaClip",
    rootTriggerId: `trigger-${slot + 1}`,
    rootIndex: slot + 1,
    arrivesAt: 1.25,
    from: { x: 0, y: 0 },
    slot,
  }));
  const kill: KillContext = {
    victimId: "target-7", x: 10, y: 20, time: 1, source: "direct", generation: 0,
    reactiveEffectIds: ["bonanzaClip.refund"], artifactId: "baseRevolver", effectId: "baseRevolver.direct",
    rootTriggerId: "trigger-7", lineageId: "trigger-7:0", projectileId: "projectile-7",
    originPower: 20, killReactionDepth: 0,
  };

  const result = queueBonanzaRefunds([kill], {}, 0.25, createCylinder(7, 7), existingRefunds);

  expect(result.pendingRefunds).toEqual([expect.objectContaining({ slot: 6 })]);
});

test("due Bonanza and Recoil refunds use arrival, effect ID, and numeric root order", () => {
  const pending = (effectId: PendingRefund["effectId"], rootIndex: number, arrivesAt = 1): PendingRefund => {
    const common = { rootTriggerId: `trigger-${rootIndex}`, rootIndex, arrivesAt, from: { x: 0, y: 0 } };
    return effectId === "bonanzaClip.refund"
      ? { ...common, effectId, artifactId: "bonanzaClip", slot: 4 }
      : { ...common, effectId, artifactId: "recoilBoots" };
  };
  expect(sortPendingRefunds([
    pending("recoilBoots.recoil", 2),
    pending("bonanzaClip.refund", 9),
    pending("recoilBoots.recoil", 1),
    pending("bonanzaClip.refund", 1, 0.9),
  ]).map(({ effectId, rootIndex }) => [effectId, rootIndex])).toEqual([
    ["bonanzaClip.refund", 1],
    ["bonanzaClip.refund", 9],
    ["recoilBoots.recoil", 1],
    ["recoilBoots.recoil", 2],
  ]);

  const derived = deriveWeapon(compileCombatBuild({}), 0);
  let cylinder = createCylinder(6);
  for (let index = 0; index < 6; index += 1) cylinder = consumeRound(cylinder).state;
  cylinder = startReload(cylinder, derived, 1, "automatic");
  const result = resolvePendingRefunds(cylinder, [
    pending("recoilBoots.recoil", 2), pending("bonanzaClip.refund", 2),
  ], 1);
  expect(ammoCount(result.cylinder)).toBe(2);
  expect(result.cylinder).toMatchObject({ reloading: false, reloadKind: null, emptied: [0, 1, 2, 3] });
  expect(result.pendingRefunds).toEqual([]);
});

test("Last Gasp Locket uses lowest free slot, exact orbit constants, and stable swept consumption", () => {
  const first = createLocketOrbital({
    rootTriggerId: "trigger-3", rootIndex: 3, lineageId: "trigger-3:1", localOrdinal: 1,
    eligibleEffectIds: ["stillwater.charge"], reactiveEffectIds: ["bonanzaClip.refund"],
    sourceSpec, damage: 32, radius: 10, originPower: 20, triggeredAt: 1,
  }, [], 1);
  const second = createLocketOrbital({
    rootTriggerId: "trigger-6", rootIndex: 6, lineageId: "trigger-6:1", localOrdinal: 1,
    eligibleEffectIds: [], reactiveEffectIds: [], sourceSpec,
    damage: 20, radius: 5, originPower: 20, triggeredAt: 1,
  }, [first], 1);
  expect(first).toMatchObject({ id: "locket-trigger-3-0", slot: 0, angle: 0, radius: 40, angularSpeed: Math.PI * 2, expiresAt: 3.5 });
  expect(second.slot).toBe(1);
  expect(second.angle).toBeCloseTo(Math.PI * 2 / 3);

  const advanced = advanceLocketOrbitals([second, first], { x: 100, y: 100 }, [
    { id: "chaser-b", x: 140, y: 100, radius: 18, health: 80 },
    { id: "chaser-a", x: 140, y: 100, radius: 18, health: 80 },
  ], 0, 1);
  expect(advanced.hits.map(({ orbitalId, targetId }) => [orbitalId, targetId])).toEqual([
    ["locket-trigger-3-0", "chaser-a"],
  ]);
  expect(advanced.orbitals.map(({ id }) => id)).toEqual(["locket-trigger-6-1"]);
});

test("simultaneous Locket orbitals retarget after a kill and retain without a live swept contact", () => {
  const orbital = createLocketOrbital({
    rootTriggerId: "trigger-3", rootIndex: 3, lineageId: "trigger-3:0", localOrdinal: 0,
    eligibleEffectIds: [], reactiveEffectIds: [], sourceSpec,
    damage: 20, radius: 5, originPower: 20, triggeredAt: 1,
  }, [], 1);
  const result = advanceLocketOrbitals([
    { ...orbital, id: "locket-a" },
    { ...orbital, id: "locket-b" },
    { ...orbital, id: "locket-c" },
  ], { x: 100, y: 100 }, [
    { id: "chaser-b", x: 140, y: 100, radius: 18, health: 1 },
    { id: "chaser-a", x: 140, y: 100, radius: 18, health: 1 },
  ], 0, 1);

  expect(result.hits.map(({ orbitalId, targetId }) => [orbitalId, targetId])).toEqual([
    ["locket-a", "chaser-a"],
    ["locket-b", "chaser-b"],
  ]);
  expect(result.orbitals.map(({ id }) => id)).toEqual(["locket-c"]);
});

test("timed reactive records prune at their exact deadlines", () => {
  const atDeadline = resolveBoundaryClamp({ recoilWindows: [recoil(1)], pendingRefunds: [] }, {
    left: true, right: false, top: false, bottom: false,
  }, 1.35);
  expect(atDeadline.recoilWindows).toEqual([]);
  expect(atDeadline.pendingRefunds).toEqual([]);
});
