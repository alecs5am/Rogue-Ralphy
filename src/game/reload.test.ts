import { expect, test } from "bun:test";
import { compileCombatBuild } from "./combat-build";
import { advanceReload, attemptActiveReload, createReloadState, fireRateBuffAt, startReload } from "./reload";
import { deriveWeapon } from "./weapon";

const weapon = (deadeye = false, buff = 0) =>
  deriveWeapon(compileCombatBuild(deadeye ? { deadeye: true } : {}), buff);

test("automatically starts a 1.5 second reload when the cylinder empties", () => {
  const derived = weapon();
  const state = startReload(createReloadState(derived, 0), derived, 10);
  expect(state.reloading).toBe(true);
  expect(advanceReload(state, 11.49).ammo).toBe(0);
  expect(advanceReload(state, 11.5).ammo).toBe(6);
});

test("completes instantly and buffs fire rate inside the Deadeye window", () => {
  const derived = weapon(true);
  const loading = startReload(createReloadState(derived, 0), derived, 10);
  const result = attemptActiveReload(loading, derived, 10.75);
  expect(result.ammo).toBe(6);
  expect(result.fireRateBuff).toBeCloseTo(0.2);
  expect(result.buffUntil).toBeCloseTo(13);
});

test("a missed timing press leaves normal reload untouched", () => {
  const derived = weapon(true);
  const loading = startReload(createReloadState(derived, 0), derived, 10);
  expect(attemptActiveReload(loading, derived, 10.05)).toEqual(loading);
});

test("Deadeye fire-rate buff expires at its deadline", () => {
  const derived = weapon(true);
  const loading = startReload(createReloadState(derived, 0), derived, 10);
  const buffed = attemptActiveReload(loading, derived, (loading.sweetStart + loading.sweetEnd) / 2);

  expect(weapon(true, fireRateBuffAt(buffed, buffed.buffUntil - 0.001)).fireRate)
    .toBeCloseTo(derived.fireRate * (1 + derived.activeBuff));
  expect(weapon(true, fireRateBuffAt(buffed, buffed.buffUntil)).fireRate).toBe(derived.fireRate);
});
