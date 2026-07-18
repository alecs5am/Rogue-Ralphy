export type ReloadState = {
  ammo: number; capacity: number; reloading: boolean; startedAt: number; completesAt: number;
  sweetStart: number; sweetEnd: number; fireRateBuff: number; buffUntil: number;
};

export function createReloadState(ammo = 6): ReloadState {
  return { ammo, capacity: 6, reloading: false, startedAt: 0, completesAt: 0, sweetStart: 0, sweetEnd: 0, fireRateBuff: 0, buffUntil: 0 };
}

export function startReload(state: ReloadState, now: number, duration: number, deadeyeStacks: number): ReloadState {
  const width = deadeyeStacks ? Math.min(0.45, 0.12 + 0.03 * (deadeyeStacks - 1)) : 0;
  const midpoint = now + duration / 2;
  return { ...state, reloading: true, startedAt: now, completesAt: now + duration, sweetStart: midpoint - duration * width / 2, sweetEnd: midpoint + duration * width / 2 };
}

export function advanceReload(state: ReloadState, now: number): ReloadState {
  return state.reloading && now >= state.completesAt
    ? { ...state, ammo: state.capacity, reloading: false }
    : state;
}

export function attemptActiveReload(state: ReloadState, now: number, deadeyeStacks: number): ReloadState {
  if (!state.reloading || now < state.sweetStart || now > state.sweetEnd) return state;
  return { ...state, ammo: state.capacity, reloading: false, fireRateBuff: 0.2 * deadeyeStacks, buffUntil: now + 2 + 0.25 * deadeyeStacks };
}

export function fireRateBuffAt(state: ReloadState, now: number): number {
  return now < state.buffUntil ? state.fireRateBuff : 0;
}
