import type { DerivedWeapon, EchoCartridge } from "./weapon";

export type CylinderSlot = Readonly<{ loaded: boolean; echo: EchoCartridge | null }>;
export type CylinderState = Readonly<{
  slots: readonly [CylinderSlot, CylinderSlot, CylinderSlot, CylinderSlot, CylinderSlot, CylinderSlot];
  nextSlot: number;
  emptied: readonly number[];
  reloading: boolean;
  reloadKind: "manual" | "automatic" | null;
  startedAt: number;
  completesAt: number;
  sweetStart: number;
  sweetEnd: number;
  fireRateBuff: number;
  buffUntil: number;
}>;

const makeSlots = (loaded: number, echo: EchoCartridge | null = null): CylinderState["slots"] =>
  Array.from({ length: 6 }, (_, index) => ({ loaded: index < loaded, echo: index < loaded ? echo : null })) as unknown as CylinderState["slots"];

export function createCylinder(ammo = 6): CylinderState {
  return {
    slots: makeSlots(ammo),
    nextSlot: 0,
    emptied: Array.from({ length: 6 - ammo }, (_, index) => ammo + index),
    reloading: false,
    reloadKind: null,
    startedAt: 0,
    completesAt: 0,
    sweetStart: 0,
    sweetEnd: 0,
    fireRateBuff: 0,
    buffUntil: 0,
  };
}

export const ammoCount = (state: CylinderState): number =>
  state.slots.reduce((total, slot) => total + Number(slot.loaded), 0);

export function startReload(
  state: CylinderState,
  weapon: DerivedWeapon,
  now: number,
  kind: "manual" | "automatic",
): CylinderState {
  const midpoint = now + weapon.reloadDuration / 2;
  return {
    ...state,
    reloading: true,
    reloadKind: kind,
    startedAt: now,
    completesAt: now + weapon.reloadDuration,
    sweetStart: midpoint - weapon.reloadDuration * weapon.activeWindow / 2,
    sweetEnd: midpoint + weapon.reloadDuration * weapon.activeWindow / 2,
  };
}

export function advanceReload(state: CylinderState, now: number): CylinderState {
  return state.reloading && now >= state.completesAt
    ? { ...state, slots: makeSlots(6), nextSlot: 0, emptied: [], reloading: false, reloadKind: null }
    : state;
}

export function attemptActiveReload(state: CylinderState, weapon: DerivedWeapon, now: number): CylinderState {
  if (!state.reloading || weapon.activeWindow <= 0 || !weapon.echo || now < state.sweetStart || now > state.sweetEnd) return state;
  return {
    ...state,
    slots: makeSlots(6, weapon.echo),
    nextSlot: 0,
    emptied: [],
    reloading: false,
    reloadKind: null,
    fireRateBuff: weapon.activeBuff,
    buffUntil: now + weapon.activeBuffDuration,
  };
}

export type ConsumedRound = Readonly<{ slot: number; echo: EchoCartridge | null; ammoBefore: number }>;

export function consumeRound(state: CylinderState): Readonly<{ state: CylinderState; round: ConsumedRound | null }> {
  const offset = Array.from({ length: 6 }, (_, index) => index)
    .find((index) => state.slots[(state.nextSlot + index) % 6]?.loaded);
  if (offset === undefined) return { state, round: null };
  const slot = (state.nextSlot + offset) % 6;
  const consumed = state.slots[slot]!;
  const slots = state.slots.slice() as CylinderSlot[];
  slots[slot] = { loaded: false, echo: null };
  return {
    state: {
      ...state,
      slots: slots as unknown as CylinderState["slots"],
      nextSlot: (slot + 1) % 6,
      emptied: [...state.emptied, slot],
    },
    round: { slot, echo: consumed.echo, ammoBefore: ammoCount(state) },
  };
}

export function refundRound(
  state: CylinderState,
  effectId: "bonanzaClip" | "recoilBoots",
  now: number,
  frozenSlot?: number,
): CylinderState {
  void effectId;
  void now;
  if (ammoCount(state) === 6) return state;
  if (frozenSlot !== undefined && (!Number.isInteger(frozenSlot) || frozenSlot < 0 || frozenSlot >= state.slots.length)) {
    throw new Error("frozen refund slot must be an integer from zero through five");
  }
  const slot = frozenSlot ?? state.emptied.at(-1);
  if (slot === undefined) return state;
  if (state.slots[slot]?.loaded) return state;
  const wasEmpty = ammoCount(state) === 0;
  const slots = state.slots.slice() as CylinderSlot[];
  slots[slot] = { loaded: true, echo: null };
  return {
    ...state,
    slots: slots as unknown as CylinderState["slots"],
    nextSlot: wasEmpty ? slot : state.nextSlot,
    emptied: state.emptied.filter((emptySlot) => emptySlot !== slot),
    reloading: false,
    reloadKind: null,
  };
}

export function fireRateBuffAt(state: CylinderState, now: number): number {
  return now < state.buffUntil ? state.fireRateBuff : 0;
}
