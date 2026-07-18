import { expect, test } from "bun:test";
import { advanceReload, attemptActiveReload, createReloadState, startReload } from "./reload";
import { deriveWeapon } from "./weapon";

test("automatically starts a 1.5 second reload when the cylinder empties", () => {
  const weapon = deriveWeapon({}, 0);
  const state = startReload(createReloadState(weapon, 0), weapon, 10);
  expect(state.reloading).toBe(true);
  expect(advanceReload(state, 11.49).ammo).toBe(0);
  expect(advanceReload(state, 11.5).ammo).toBe(6);
});

test("completes instantly and buffs fire rate inside the Deadeye window", () => {
  const weapon = deriveWeapon({ deadeye: 2 }, 0);
  const loading = startReload(createReloadState(weapon, 0), weapon, 10);
  const result = attemptActiveReload(loading, weapon, 10.75);
  expect(result.ammo).toBe(6);
  expect(result.fireRateBuff).toBeCloseTo(0.4);
  expect(result.buffUntil).toBeCloseTo(13.25);
});

test("a missed timing press leaves normal reload untouched", () => {
  const weapon = deriveWeapon({ deadeye: 1 }, 0);
  const loading = startReload(createReloadState(weapon, 0), weapon, 10);
  expect(attemptActiveReload(loading, weapon, 10.05)).toEqual(loading);
});
