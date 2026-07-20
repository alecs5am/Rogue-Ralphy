import { refundRound, type CylinderState } from "./cylinder";
import type { KillContext, KillReactionSnapshot } from "./emissions";
import type { ProjectileSpec } from "./projectiles";
import { segmentCircleHitTime, type Point } from "./room";

type LocketSourceSpec = Readonly<Omit<ProjectileSpec, "triggerId"> & { triggerId?: never }>;

export type RecoilWindow = Readonly<{
  effectId: "recoilBoots.recoil";
  rootTriggerId: string;
  rootIndex: number;
  vector: Point;
  expiresAt: number;
  refunded: boolean;
}>;

export type StillwaterState = Readonly<{ progress: number; charged: boolean }>;

type PendingRefundBase = Readonly<{
  rootTriggerId: string;
  rootIndex: number;
  arrivesAt: number;
  from: Point;
  lineageId?: string;
}>;

export type PendingRefund =
  | (PendingRefundBase & Readonly<{
    effectId: "bonanzaClip.refund";
    artifactId: "bonanzaClip";
    slot: number;
  }>)
  | (PendingRefundBase & Readonly<{
    effectId: "recoilBoots.recoil";
    artifactId: "recoilBoots";
  }>);

type BonanzaRefund = Extract<PendingRefund, { effectId: "bonanzaClip.refund" }>;

export type LocketOrbitalSeed = Readonly<{
  rootTriggerId: string;
  rootIndex: number;
  lineageId: string;
  localOrdinal: number;
  eligibleEffectIds: readonly string[];
  reactiveEffectIds: readonly string[];
  sourceSpec: LocketSourceSpec;
  killReaction?: KillReactionSnapshot;
  damage: number;
  radius: number;
  originPower: number;
  triggeredAt: number;
}>;

export type ProtectiveOrbital = Readonly<{
  id: string;
  slot: number;
  rootTriggerId: string;
  rootIndex: number;
  lineageId: string;
  localOrdinal: number;
  eligibleEffectIds: readonly string[];
  reactiveEffectIds: readonly string[];
  sourceSpec: LocketSourceSpec;
  killReaction?: KillReactionSnapshot;
  originPower: number;
  damage: number;
  radius: number;
  hitRadius: number;
  angle: number;
  angularSpeed: number;
  bornAt: number;
  expiresAt: number;
}>;

export type LocketHit = Readonly<{
  orbitalId: string;
  targetId: string;
  artifactId: "lastGaspLocket";
  effectId: "lastGaspLocket.orbital";
  rootTriggerId: string;
  lineageId: string;
  rootIndex: number;
  localOrdinal: number;
  eligibleEffectIds: readonly string[];
  reactiveEffectIds: readonly string[];
  sourceSpec: LocketSourceSpec;
  killReaction?: KillReactionSnapshot;
  triggeredAt: number;
  originPower: number;
  damage: number;
  contactFraction: number;
  time: number;
  x: number;
  y: number;
}>;

export type DecoyState = Readonly<{ x: number; y: number; expiresAt: number }>;

const snapshotSpec = (spec: LocketSourceSpec): LocketSourceSpec => Object.freeze({
  ...spec,
  behaviors: Object.freeze(Object.fromEntries(Object.entries(spec.behaviors).map(([key, value]) => [
    key,
    value && typeof value === "object" ? Object.freeze({ ...value }) : value,
  ]))),
  bell: spec.bell && Object.freeze({ ...spec.bell }),
});

const immutablePoint = (point: Point): Point => Object.freeze({ x: point.x, y: point.y });

export function resolveStillwater(
  state: StillwaterState,
  owned: boolean,
  speed: number,
  dt: number,
  acceptedDamage: boolean,
): StillwaterState {
  if (!owned || acceptedDamage || speed >= 1) return { progress: 0, charged: false };
  if (state.charged) return state;
  const progress = Math.min(0.6, state.progress + dt);
  return { progress, charged: progress >= 0.6 };
}

export function resolveBoundaryClamp(
  state: Readonly<{ recoilWindows: readonly RecoilWindow[]; pendingRefunds: readonly PendingRefund[] }>,
  blocked: Readonly<{ left: boolean; right: boolean; top: boolean; bottom: boolean }>,
  now: number,
  point: Point = { x: 0, y: 0 },
): Readonly<{ recoilWindows: RecoilWindow[]; pendingRefunds: PendingRefund[] }> {
  const live = state.recoilWindows.filter(({ expiresAt, refunded }) => expiresAt > now && !refunded);
  const eligible = live.filter(({ vector }) =>
    (blocked.left && vector.x < 0)
    || (blocked.right && vector.x > 0)
    || (blocked.top && vector.y < 0)
    || (blocked.bottom && vector.y > 0));
  const closed = new Set(eligible);
  const refunds = eligible
    .toSorted((a, b) => a.rootIndex - b.rootIndex)
    .map((window): PendingRefund => ({
      effectId: window.effectId,
      artifactId: "recoilBoots",
      rootTriggerId: window.rootTriggerId,
      rootIndex: window.rootIndex,
      arrivesAt: now,
      from: immutablePoint(point),
    }));
  return {
    recoilWindows: live.filter((window) => !closed.has(window)),
    pendingRefunds: sortPendingRefunds([...state.pendingRefunds, ...refunds]),
  };
}

const compareString = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function sortPendingRefunds<T extends PendingRefund>(refunds: readonly T[]): T[] {
  return [...refunds].sort((a, b) => a.arrivesAt - b.arrivesAt
    || compareString(a.effectId, b.effectId)
    || a.rootIndex - b.rootIndex);
}

export function resolvePendingRefunds(
  cylinder: CylinderState,
  pendingRefunds: readonly PendingRefund[],
  now: number,
): Readonly<{ cylinder: CylinderState; pendingRefunds: PendingRefund[]; resolved: PendingRefund[] }> {
  const ordered = sortPendingRefunds(pendingRefunds);
  const due = ordered.filter(({ arrivesAt }) => arrivesAt <= now);
  let nextCylinder = cylinder;
  for (const refund of due) {
    nextCylinder = refund.effectId === "bonanzaClip.refund"
      ? refundRound(nextCylinder, refund.artifactId, now, refund.slot)
      : refundRound(nextCylinder, refund.artifactId, now);
  }
  return {
    cylinder: nextCylinder,
    pendingRefunds: ordered.filter(({ arrivesAt }) => arrivesAt > now),
    resolved: due,
  };
}

const rootIndex = (kill: KillContext): number => {
  const value = Number(kill.rootTriggerId.match(/(\d+)$/)?.[1]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Bonanza root requires a numeric index: ${kill.rootTriggerId}`);
  return value;
};

export function queueBonanzaRefunds(
  kills: readonly KillContext[],
  history: Readonly<Record<string, Readonly<{ rootTriggerId: string }>>>,
  delivery: number,
  cylinder: CylinderState,
  existingRefunds: readonly PendingRefund[],
): Readonly<{
  pendingRefunds: BonanzaRefund[];
  history: Record<string, Readonly<{ rootTriggerId: string }>>;
}> {
  const nextHistory = { ...history };
  const pendingRefunds: BonanzaRefund[] = [];
  const reservedSlots = new Set(existingRefunds.flatMap((refund) =>
    refund.effectId === "bonanzaClip.refund" ? [refund.slot] : []));
  const nextSlot = (): number => {
    const empty = [...cylinder.emptied].reverse().find((slot) => !reservedSlots.has(slot));
    if (empty !== undefined) return empty;
    return Array.from({ length: cylinder.slots.length }, (_, offset) =>
      (cylinder.nextSlot + offset) % cylinder.slots.length)
      .find((slot) => !reservedSlots.has(slot)) ?? cylinder.nextSlot;
  };
  for (const kill of kills) {
    if (kill.generation !== 0 || kill.killReactionDepth !== 0
      || !kill.reactiveEffectIds.includes("bonanzaClip.refund")) continue;
    const key = `bonanzaClip.refund\0${kill.rootTriggerId}`;
    if (nextHistory[key]) continue;
    nextHistory[key] = { rootTriggerId: kill.rootTriggerId };
    const slot = nextSlot();
    reservedSlots.add(slot);
    pendingRefunds.push({
      effectId: "bonanzaClip.refund",
      artifactId: "bonanzaClip",
      rootTriggerId: kill.rootTriggerId,
      rootIndex: rootIndex(kill),
      arrivesAt: kill.time + delivery,
      from: immutablePoint(kill),
      slot,
      ...(kill.lineageId ? { lineageId: kill.lineageId } : {}),
    });
  }
  return { pendingRefunds: sortPendingRefunds(pendingRefunds), history: nextHistory };
}

export function createLocketOrbital(
  seed: LocketOrbitalSeed,
  active: readonly ProtectiveOrbital[],
  now: number,
): ProtectiveOrbital {
  const occupied = new Set(active.filter(({ expiresAt }) => expiresAt > now).map(({ slot }) => slot));
  const slot = [0, 1, 2].find((candidate) => !occupied.has(candidate));
  if (slot === undefined) throw new Error("Last Gasp Locket orbital cap reached");
  return {
    id: `locket-${seed.rootTriggerId}-${slot}`,
    slot,
    rootTriggerId: seed.rootTriggerId,
    rootIndex: seed.rootIndex,
    lineageId: seed.lineageId,
    localOrdinal: seed.localOrdinal,
    eligibleEffectIds: Object.freeze([...seed.eligibleEffectIds]),
    reactiveEffectIds: Object.freeze([...seed.reactiveEffectIds]),
    sourceSpec: snapshotSpec(seed.sourceSpec),
    killReaction: seed.killReaction && Object.freeze({
      rule: Object.freeze({ ...seed.killReaction.rule }),
      descendantLimit: seed.killReaction.descendantLimit,
    }),
    originPower: seed.originPower,
    damage: seed.damage,
    radius: 40,
    hitRadius: seed.radius,
    angle: Math.PI * 2 * slot / 3,
    angularSpeed: Math.PI * 2,
    bornAt: now,
    expiresAt: now + 2.5,
  };
}

export function advanceLocketOrbitals(
  orbitals: readonly ProtectiveOrbital[],
  player: Point,
  chasers: readonly Readonly<Point & { id: string; radius: number; health: number; immortal?: boolean }>[],
  dt: number,
  now: number,
): Readonly<{ orbitals: ProtectiveOrbital[]; hits: LocketHit[] }> {
  const live = orbitals.filter(({ expiresAt }) => expiresAt > now)
    .toSorted((a, b) => compareString(a.id, b.id));
  const consumed = new Set<string>();
  const hits: LocketHit[] = [];
  const remainingHealth = new Map(chasers.map(({ id, health }) => [id, health]));
  for (const orbital of live) {
    const liveDuration = Math.max(0, Math.min(dt, now - orbital.bornAt));
    const motionStart = now - liveDuration;
    const nextAngle = orbital.angle + orbital.angularSpeed * liveDuration;
    const from = {
      x: player.x + Math.cos(orbital.angle) * orbital.radius,
      y: player.y + Math.sin(orbital.angle) * orbital.radius,
    };
    const to = {
      x: player.x + Math.cos(nextAngle) * orbital.radius,
      y: player.y + Math.sin(nextAngle) * orbital.radius,
    };
    const contact = chasers
      .flatMap((target) => {
        if (!target.immortal && (remainingHealth.get(target.id) ?? 0) <= 0) return [];
        const contactFraction = segmentCircleHitTime(from, to, target, target.radius + orbital.hitRadius);
        return contactFraction === null ? [] : [{ target, contactFraction }];
      })
      .toSorted((a, b) => compareString(a.target.id, b.target.id))[0];
    if (!contact) continue;
    const { target, contactFraction } = contact;
    consumed.add(orbital.id);
    if (!target.immortal) remainingHealth.set(target.id, (remainingHealth.get(target.id) ?? 0) - orbital.damage);
    hits.push({
      orbitalId: orbital.id,
      targetId: target.id,
      artifactId: "lastGaspLocket",
      effectId: "lastGaspLocket.orbital",
      rootTriggerId: orbital.rootTriggerId,
      lineageId: orbital.lineageId,
      rootIndex: orbital.rootIndex,
      localOrdinal: orbital.localOrdinal,
      eligibleEffectIds: Object.freeze([...orbital.eligibleEffectIds]),
      reactiveEffectIds: Object.freeze([...orbital.reactiveEffectIds]),
      sourceSpec: orbital.sourceSpec,
      killReaction: orbital.killReaction,
      triggeredAt: orbital.bornAt,
      originPower: orbital.originPower,
      damage: orbital.damage,
      contactFraction,
      time: motionStart + contactFraction * liveDuration,
      x: from.x + (to.x - from.x) * contactFraction,
      y: from.y + (to.y - from.y) * contactFraction,
    });
  }
  return {
    orbitals: live.filter(({ id }) => !consumed.has(id))
      .map((orbital) => ({
        ...orbital,
        angle: orbital.angle + orbital.angularSpeed * Math.max(0, Math.min(dt, now - orbital.bornAt)),
      })),
    hits,
  };
}
