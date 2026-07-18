import type { DerivedWeapon } from "./weapon";

export type ReloadState = {
  ammo: number; capacity: number; reloading: boolean; startedAt: number; completesAt: number;
  sweetStart: number; sweetEnd: number; fireRateBuff: number; buffUntil: number;
};

export function createReloadState(weapon: DerivedWeapon, ammo = weapon.capacity): ReloadState {
  return { ammo, capacity: weapon.capacity, reloading: false, startedAt: 0, completesAt: 0, sweetStart: 0, sweetEnd: 0, fireRateBuff: 0, buffUntil: 0 };
}

export function startReload(state: ReloadState, weapon: DerivedWeapon, now: number): ReloadState {
  const midpoint = now + weapon.reloadDuration / 2;
  return { ...state, reloading: true, startedAt: now, completesAt: now + weapon.reloadDuration, sweetStart: midpoint - weapon.reloadDuration * weapon.activeWindow / 2, sweetEnd: midpoint + weapon.reloadDuration * weapon.activeWindow / 2 };
}

export function advanceReload(state: ReloadState, now: number): ReloadState {
  return state.reloading && now >= state.completesAt
    ? { ...state, ammo: state.capacity, reloading: false }
    : state;
}

export function attemptActiveReload(state: ReloadState, weapon: DerivedWeapon, now: number): ReloadState {
  if (!state.reloading || now < state.sweetStart || now > state.sweetEnd) return state;
  return { ...state, ammo: state.capacity, reloading: false, fireRateBuff: weapon.activeBuff, buffUntil: now + weapon.activeBuffDuration };
}

export function fireRateBuffAt(state: ReloadState, now: number): number {
  return now < state.buffUntil ? state.fireRateBuff : 0;
}
