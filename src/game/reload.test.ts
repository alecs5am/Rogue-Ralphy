import { expect, test } from "bun:test";
import { advanceReload, attemptActiveReload, createReloadState, startReload } from "./reload";

test("automatically starts a 1.5 second reload when the cylinder empties", () => {
  const state = startReload(createReloadState(0), 10, 1.5, 0);
  expect(state.reloading).toBe(true);
  expect(advanceReload(state, 11.49).ammo).toBe(0);
  expect(advanceReload(state, 11.5).ammo).toBe(6);
});

test("completes instantly and buffs fire rate inside the Deadeye window", () => {
  const loading = startReload(createReloadState(0), 10, 1.5, 2);
  const result = attemptActiveReload(loading, 10.75, 2);
  expect(result.ammo).toBe(6);
  expect(result.fireRateBuff).toBeCloseTo(0.4);
  expect(result.buffUntil).toBeCloseTo(13.25);
});

test("a missed timing press leaves normal reload untouched", () => {
  const loading = startReload(createReloadState(0), 10, 1.5, 1);
  expect(attemptActiveReload(loading, 10.05, 1)).toEqual(loading);
});
