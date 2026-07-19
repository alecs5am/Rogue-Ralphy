import { expect, test } from "bun:test";
import { compileCombatBuild } from "./combat-build";
import {
  advanceReload,
  ammoCount,
  attemptActiveReload,
  consumeRound,
  createCylinder,
  fireRateBuffAt,
  refundRound,
  startReload,
  type CylinderState,
} from "./cylinder";
import { deriveWeapon } from "./weapon";

const weapon = (deadeye = false, buff = 0) =>
  deriveWeapon(compileCombatBuild(deadeye ? { deadeye: true } : {}), buff);

const consume = (state: CylinderState, count: number): CylinderState =>
  Array.from({ length: count }).reduce<CylinderState>((next) => consumeRound(next).state, state);

const emptyCylinder = (): CylinderState => consume(createCylinder(6), 6);

test("creates six ordered loaded slots", () => {
  const cylinder = createCylinder(6);
  expect(ammoCount(cylinder)).toBe(6);
  expect(cylinder).toMatchObject({ nextSlot: 0, emptied: [], reloading: false, reloadKind: null });
  expect([...cylinder.slots]).toEqual(Array.from({ length: 6 }, () => ({ loaded: true, echo: false })));
});

test("consumes slots circularly and reports ammo before each trigger", () => {
  let cylinder = createCylinder(6);
  const rounds = [];
  for (let index = 0; index < 6; index += 1) {
    const consumed = consumeRound(cylinder);
    rounds.push(consumed.round);
    cylinder = consumed.state;
  }
  expect(rounds).toEqual(Array.from({ length: 6 }, (_, slot) => ({ slot, echo: false, ammoBefore: 6 - slot })));
  expect(cylinder).toMatchObject({ nextSlot: 0, emptied: [0, 1, 2, 3, 4, 5] });
  expect(consumeRound(cylinder)).toEqual({ state: cylinder, round: null });
});

test("completes full and partial reloads with six ordinary rounds", () => {
  const derived = weapon();
  const empty = startReload(emptyCylinder(), derived, 10, "automatic");
  expect(empty).toMatchObject({ reloading: true, reloadKind: "automatic", completesAt: 11.5 });
  expect(ammoCount(advanceReload(empty, 11.49))).toBe(0);
  expect(advanceReload(empty, 11.5)).toMatchObject({
    slots: Array.from({ length: 6 }, () => ({ loaded: true, echo: false })),
    nextSlot: 0,
    emptied: [],
    reloading: false,
    reloadKind: null,
  });

  const partial = startReload(consume(createCylinder(6), 2), derived, 20, "manual");
  expect(ammoCount(advanceReload(partial, 21.5))).toBe(6);
});

test("successful Deadeye reload fills all slots with echo rounds and preserves buff timing", () => {
  const derived = weapon(true);
  const loading = startReload(emptyCylinder(), derived, 10, "automatic");
  const result = attemptActiveReload(loading, derived, 10.75);
  expect([...result.slots]).toEqual(Array.from({ length: 6 }, () => ({ loaded: true, echo: true })));
  expect(result).toMatchObject({ nextSlot: 0, emptied: [], reloading: false, reloadKind: null, fireRateBuff: 0.2 });
  expect(result.buffUntil).toBeCloseTo(13);
  expect(weapon(true, fireRateBuffAt(result, result.buffUntil - 0.001)).fireRate)
    .toBeCloseTo(derived.fireRate * (1 + derived.activeBuff));
  expect(weapon(true, fireRateBuffAt(result, result.buffUntil)).fireRate).toBe(derived.fireRate);
});

test("missed timing and a weapon without Deadeye leave reload untouched", () => {
  const deadeye = weapon(true);
  const loading = startReload(emptyCylinder(), deadeye, 10, "manual");
  expect(attemptActiveReload(loading, deadeye, 10.05)).toBe(loading);

  const ordinary = weapon();
  const ordinaryLoading = startReload(emptyCylinder(), ordinary, 0, "manual");
  expect(attemptActiveReload(ordinaryLoading, ordinary, 0.75)).toBe(ordinaryLoading);
});

test("consumes ordered slots and ordinary refunds never restore echo", () => {
  const derived = weapon(true);
  const loading = startReload(emptyCylinder(), derived, 0, "manual");
  const echoed = attemptActiveReload(loading, derived, 0.75);
  const first = consumeRound(echoed);
  expect(first.round).toMatchObject({ slot: 0, echo: true, ammoBefore: 6 });
  const refunded = refundRound(first.state, "bonanzaClip", 1);
  expect(refunded.slots[0]).toEqual({ loaded: true, echo: false });
});

test("refund preserves circular order and Last Bell follows ammo before trigger", () => {
  let cylinder = consume(createCylinder(6), 5);
  cylinder = refundRound(cylinder, "bonanzaClip", 1);

  const originalLast = consumeRound(cylinder);
  expect(originalLast.round).toMatchObject({ slot: 5, ammoBefore: 2 });
  const refundedLast = consumeRound(originalLast.state);
  expect(refundedLast.round).toMatchObject({ slot: 4, ammoBefore: 1 });
});

test("refund cancels manual or automatic reload unless full", () => {
  const derived = weapon();
  const partial = consumeRound(createCylinder(6)).state;
  const manual = startReload(partial, derived, 1, "manual");
  expect(refundRound(manual, "recoilBoots", 1.1).reloading).toBe(false);
  const automatic = startReload(emptyCylinder(), derived, 2, "automatic");
  expect(refundRound(automatic, "bonanzaClip", 2.1)).toMatchObject({ reloading: false, reloadKind: null, nextSlot: 5 });

  const fullReload = startReload(createCylinder(6), derived, 3, "manual");
  expect(refundRound(fullReload, "bonanzaClip", 3.1)).toBe(fullReload);
});

test("same-step automatic reload yields to a refund and restarts after firing", () => {
  const derived = weapon();
  const consumed = consumeRound(consume(createCylinder(6), 5));
  const automatic = startReload(consumed.state, derived, 2, "automatic");
  const refunded = refundRound(automatic, "bonanzaClip", 2);
  expect(refunded).toMatchObject({ reloading: false, nextSlot: 5 });
  expect(ammoCount(refunded)).toBe(1);

  const fired = consumeRound(refunded).state;
  expect(startReload(fired, derived, 2.1, "automatic")).toMatchObject({ reloading: true, reloadKind: "automatic" });
});

test("stable dual refunds restore two distinct newest empty slots", () => {
  const empty = emptyCylinder();
  const restored = (["recoilBoots", "bonanzaClip"] as const)
    .toSorted()
    .reduce((state, effectId) => refundRound(state, effectId, 3), empty);
  expect(restored.slots.map((slot) => slot.loaded)).toEqual([false, false, false, false, true, true]);
  expect(restored).toMatchObject({ emptied: [0, 1, 2, 3], nextSlot: 5 });
});
