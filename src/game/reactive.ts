import { refundRound, type CylinderState } from "./cylinder";
import type { KillContext } from "./emissions";
import { segmentCircleHitTime, type Point } from "./room";

export type RecoilWindow = Readonly<{
  effectId: "recoilBoots.recoil";
  rootTriggerId: string;
  rootIndex: number;
  vector: Point;
  expiresAt: number;
  refunded: boolean;
}>;

export type StillwaterState = Readonly<{ progress: number; charged: boolean }>;

export type PendingRefund = Readonly<{
  effectId: "bonanzaClip.refund" | "recoilBoots.recoil";
  artifactId: "bonanzaClip" | "recoilBoots";
  rootTriggerId: string;
  rootIndex: number;
  arrivesAt: number;
  x: number;
  y: number;
  lineageId?: string;
}>;

export type LocketOrbitalSeed = Readonly<{
  rootTriggerId: string;
  rootIndex: number;
  lineageId: string;
  localOrdinal: number;
  eligibleEffectIds: readonly string[];
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
  originPower: number;
  damage: number;
  x: number;
  y: number;
}>;

export type DecoyState = Readonly<{ x: number; y: number; expiresAt: number }>;

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
      x: point.x,
      y: point.y,
    }));
  return {
    recoilWindows: live.filter((window) => !closed.has(window)),
    pendingRefunds: sortPendingRefunds([...state.pendingRefunds, ...refunds]),
  };
}

const compareString = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function sortPendingRefunds(refunds: readonly PendingRefund[]): PendingRefund[] {
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
    nextCylinder = refundRound(nextCylinder, refund.artifactId, now);
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
): Readonly<{
  pendingRefunds: PendingRefund[];
  history: Record<string, Readonly<{ rootTriggerId: string }>>;
}> {
  const nextHistory = { ...history };
  const pendingRefunds: PendingRefund[] = [];
  for (const kill of kills) {
    if (kill.generation !== 0 || kill.killReactionDepth !== 0
      || !kill.reactiveEffectIds.includes("bonanzaClip.refund")) continue;
    const key = `bonanzaClip.refund\0${kill.rootTriggerId}`;
    if (nextHistory[key]) continue;
    nextHistory[key] = { rootTriggerId: kill.rootTriggerId };
    pendingRefunds.push({
      effectId: "bonanzaClip.refund",
      artifactId: "bonanzaClip",
      rootTriggerId: kill.rootTriggerId,
      rootIndex: rootIndex(kill),
      arrivesAt: kill.time + delivery,
      x: kill.x,
      y: kill.y,
      lineageId: kill.lineageId,
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
  chasers: readonly Readonly<Point & { id: string; radius: number; health: number }>[],
  dt: number,
  now: number,
): Readonly<{ orbitals: ProtectiveOrbital[]; hits: LocketHit[] }> {
  const live = orbitals.filter(({ expiresAt }) => expiresAt > now)
    .toSorted((a, b) => compareString(a.id, b.id));
  const consumed = new Set<string>();
  const hits: LocketHit[] = [];
  for (const orbital of live) {
    const nextAngle = orbital.angle + orbital.angularSpeed * dt;
    const from = {
      x: player.x + Math.cos(orbital.angle) * orbital.radius,
      y: player.y + Math.sin(orbital.angle) * orbital.radius,
    };
    const to = {
      x: player.x + Math.cos(nextAngle) * orbital.radius,
      y: player.y + Math.sin(nextAngle) * orbital.radius,
    };
    const target = chasers
      .filter(({ health, radius, ...center }) => health > 0
        && segmentCircleHitTime(from, to, center, radius + orbital.hitRadius) !== null)
      .toSorted((a, b) => compareString(a.id, b.id))[0];
    if (!target) continue;
    consumed.add(orbital.id);
    hits.push({
      orbitalId: orbital.id,
      targetId: target.id,
      artifactId: "lastGaspLocket",
      effectId: "lastGaspLocket.orbital",
      rootTriggerId: orbital.rootTriggerId,
      lineageId: orbital.lineageId,
      originPower: orbital.originPower,
      damage: orbital.damage,
      x: target.x,
      y: target.y,
    });
  }
  return {
    orbitals: live.filter(({ id }) => !consumed.has(id))
      .map((orbital) => ({ ...orbital, angle: orbital.angle + orbital.angularSpeed * dt })),
    hits,
  };
}
