import { expect, test } from "bun:test";
import { advanceReload, attemptActiveReload, createReloadState, fireRateBuffAt, startReload } from "./reload";
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

test("Deadeye fire-rate buff expires at its deadline", () => {
  const weapon = deriveWeapon({ deadeye: 1 }, 0);
  const loading = startReload(createReloadState(weapon, 0), weapon, 10);
  const buffed = attemptActiveReload(loading, weapon, (loading.sweetStart + loading.sweetEnd) / 2);

  expect(deriveWeapon({ deadeye: 1 }, fireRateBuffAt(buffed, buffed.buffUntil - 0.001)).fireRate)
    .toBeCloseTo(weapon.fireRate * (1 + weapon.activeBuff));
  expect(deriveWeapon({ deadeye: 1 }, fireRateBuffAt(buffed, buffed.buffUntil)).fireRate).toBe(weapon.fireRate);
});
