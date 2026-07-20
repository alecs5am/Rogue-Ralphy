import { segmentCircleHitTime, type Point } from "./room";
import { applyMotionRules } from "./motions";
import type { MotionRule } from "./combat-build";
import { buildSpatialCandidates } from "./areas";

export type SpiralBehavior = Readonly<{ initialRadius: number; radialSpeed: number; angularSpeed: number; lifetime: number }>;
export type HomingBehavior = Readonly<{ radius: number; turnRate: number }>;
export type TeslaBehavior = Readonly<{ radius: number; neighbors: number; damageScale: number; cooldown: number }>;
export type SplitBehavior = Readonly<{
  distance: number;
  count: number;
  childRange: number;
  damageScale: number;
  fanAngle: number;
  radiusScale: number;
}>;
export type PenetrationBehavior = Readonly<{ obstacles: boolean; targets: boolean }>;
export type ConvergeBehavior = Readonly<{ distance: number; lateralOffset: number }>;
export type RelayBehavior = Readonly<{ speedScale: number; radius: number; turnRate: number }>;
export type WaveBehavior = Readonly<{ amplitude: number; wavelength: number }>;
export type ReturnBehavior = Readonly<{ outbound: number; inbound: number; damageScale: number }>;
export type CometBehavior = Readonly<{ duration: number; speedScale: number; radiusScale: number; damageScale: number }>;
export type BellDescriptor = Readonly<{ interval: number; count: number; radius: number; damageScale: number }>;
export type BellPulseState = Readonly<Omit<BellDescriptor, "count"> & { nextAt: number; remaining: number }>;
export type BigIronMainState = Readonly<{ moonletId: string; mainDamage: number; heading: number }>;
export type MoonletState = Readonly<{
  mainId: string;
  parentId?: string;
  orbitRadius: number;
  angularSpeed: number;
  angle: number;
  expiresAt: number;
  remainingRange: number;
  mainDamage: number;
  pairWindow: number;
  explosionRadius: number;
  explosionDamageScale: number;
  knockback: number;
}>;
export type EmissionProvenance = Readonly<{ artifactId: string; effectId: string }>;
export type PendingEffectToken = Readonly<{
  effectId: string;
  distance: number;
  rootTriggerId?: string;
  lineageId?: string;
  originPower?: number;
  x?: number;
  y?: number;
  heading?: number;
  damage?: number;
  radius?: number;
  speed?: number;
}>;

export type ProjectileBehaviors = Readonly<{
  converge?: ConvergeBehavior;
  spiral?: SpiralBehavior;
  homing?: HomingBehavior;
  relay?: RelayBehavior;
  wave?: WaveBehavior;
  return?: ReturnBehavior;
  comet?: CometBehavior;
  tesla?: TeslaBehavior;
  split?: SplitBehavior;
  penetration?: PenetrationBehavior;
}>;

export type ProjectileSpec = {
  triggerId: string; heading: number; damage: number; speed: number; radius: number; lifetime: number;
  freezeChance: number; freezeDuration: number; bounces: number; bounceRetention: number;
  behaviors: ProjectileBehaviors;
  motionPhase?: number;
  bell?: BellDescriptor;
};

export type ProjectileState = {
  x: number; y: number; id: string; triggerId: string; vx: number; vy: number;
  generation: 0 | 1; rootTriggerId: string; lineageId: string;
  localOrdinal: number;
  activatedEffectIds: readonly string[]; emittedEffectIds: readonly string[]; originPower: number;
  emission?: EmissionProvenance;
  pendingEffectTokens?: readonly PendingEffectToken[];
  damage: number; speed: number; radius: number; lifetime: number; bornAt: number;
  remainingBounces: number; bounceRetention: number;
  freezeChance: number; freezeDuration: number;
  behaviors: ProjectileBehaviors; penetration?: PenetrationBehavior; hitTargetIds: string[]; everHit: boolean;
  travelled: number; maxTravel?: number;
  splitParentId?: string; splitOrigin?: Readonly<{ x: number; y: number }>;
  spiralOrigin?: Readonly<{ x: number; y: number }>;
  spiralRadius?: number; spiralAngle?: number; spiralAngularSpeed?: number;
  spiralLaunchPending?: boolean;
  homingTargetId?: string; homingMarkerRemaining?: number;
  launchHeading?: number;
  convergeOffset?: number;
  baseHeading?: number;
  converge?: Readonly<{ side: -1 | 1; distance: number }>;
  convergeDone?: boolean;
  haloPhase?: number;
  childIndex?: number;
  childCount?: number;
  wavePhase?: number;
  waveDistance?: number;
  returnLeg?: "outbound" | "return";
  legTravelled?: number;
  outboundHitTargetIds?: string[];
  returnHitTargetIds?: string[];
  cometSpeedFactor?: number;
  cometRadiusFactor?: number;
  cometDamageFactor?: number;
  relayTargetId?: string;
  relayLost?: boolean;
  reflected?: boolean;
  wantedTargetId?: string;
  wantedTurnRate?: number;
  soulTargetId?: string;
  soulTurnRate?: number;
  motionRules?: readonly MotionRule[];
  bellPulse?: BellPulseState;
  moonletId?: string;
  bigIronMain?: BigIronMainState;
  moonlet?: MoonletState;
};

export type TrajectoryTarget = Readonly<{ id: string; x: number; y: number; health: number }>;
export type TeslaLink = Readonly<{
  id: string; a: string; b: string; distance: number;
  damageScale: number; cooldown: number;
}>;

export type SweptCollisionCandidate = Readonly<{
  colliderId: string;
  eventTime: number;
  point: Point;
  normal: Point;
}>;

export function sweptCircleCollision(
  from: Point,
  to: Point,
  projectile: Pick<ProjectileState, "radius" | "vx" | "vy">,
  collider: Readonly<Point & { id: string; radius: number }>,
): SweptCollisionCandidate | null {
  const eventTime = segmentCircleHitTime(from, to, collider, projectile.radius + collider.radius);
  if (eventTime === null) return null;
  const point = {
    x: from.x + (to.x - from.x) * eventTime,
    y: from.y + (to.y - from.y) * eventTime,
  };
  let nx = point.x - collider.x;
  let ny = point.y - collider.y;
  const length = Math.hypot(nx, ny);
  if (length > 0) {
    nx /= length;
    ny /= length;
  } else {
    const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
    nx = -projectile.vx / speed;
    ny = -projectile.vy / speed;
  }
  return { colliderId: collider.id, eventTime, point, normal: { x: nx, y: ny } };
}

export function buildTeslaLinks(projectiles: readonly ProjectileState[]): TeslaLink[] {
  const teslaProjectiles = projectiles
    .flatMap((projectile) => projectile.behaviors.tesla
      ? [{ projectile, tesla: projectile.behaviors.tesla }]
      : [])
    .sort((a, b) => a.projectile.id.localeCompare(b.projectile.id));
  const byId = new Map(teslaProjectiles.map((entry) => [entry.projectile.id, entry]));
  const candidates: TeslaLink[] = buildSpatialCandidates(teslaProjectiles.map(({ projectile }) => ({
    id: projectile.id,
    segments: [{ from: projectile, to: projectile }],
  }))).flatMap(({ id, a: aId, b: bId }) => {
    const { projectile: a, tesla: aTesla } = byId.get(aId)!;
    const { projectile: b, tesla: bTesla } = byId.get(bId)!;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    return distance <= Math.min(aTesla.radius, bTesla.radius) ? [{
      id,
      a: a.id,
      b: b.id,
      distance,
      damageScale: Math.min(aTesla.damageScale, bTesla.damageScale),
      cooldown: Math.max(aTesla.cooldown, bTesla.cooldown),
    }] : [];
  });
  candidates.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));

  const caps = new Map(teslaProjectiles.map(({ projectile, tesla }) => [projectile.id, tesla.neighbors]));
  const degrees = new Map<string, number>();
  return candidates.filter(({ a, b }) => {
    if ((degrees.get(a) ?? 0) >= caps.get(a)! || (degrees.get(b) ?? 0) >= caps.get(b)!) return false;
    degrees.set(a, (degrees.get(a) ?? 0) + 1);
    degrees.set(b, (degrees.get(b) ?? 0) + 1);
    return true;
  });
}

export function synchronizeSpiralState(projectile: ProjectileState, referenceAngle = projectile.spiralAngle): void {
  if (!projectile.spiralOrigin) return;
  const dx = projectile.x - projectile.spiralOrigin.x;
  const dy = projectile.y - projectile.spiralOrigin.y;
  projectile.spiralRadius = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  projectile.spiralAngle = referenceAngle === undefined
    ? angle
    : referenceAngle + Math.atan2(Math.sin(angle - referenceAngle), Math.cos(angle - referenceAngle));
}

export function advanceTrajectory(projectile: ProjectileState, targets: readonly TrajectoryTarget[], dt: number): ProjectileState {
  return applyMotionRules(projectile, targets, dt, projectile.bornAt + dt).projectile;
}

export function splitProjectile(parent: ProjectileState, nextIds: Iterable<string>): ProjectileState[] {
  const split = parent.behaviors.split;
  if (!split) return [];
  const { split: _, ...inheritedBehaviors } = parent.behaviors;
  const heading = Math.atan2(parent.vy, parent.vx);
  const splitOrigin = Object.freeze({ x: parent.x, y: parent.y });
  return Array.from(nextIds).slice(0, split.count).map((id, index) => {
    const coneOffset = split.count === 1
      ? 0
      : -split.fanAngle / 2 + split.fanAngle * index / (split.count - 1);
    const childHeading = heading + coneOffset;
    const spiral = inheritedBehaviors.spiral;
    const angularSpeed = spiral && split.count > 1
      ? spiral.angularSpeed * (0.75 + 0.5 * index / (split.count - 1))
      : spiral?.angularSpeed;
    const velocity = { vx: Math.cos(childHeading) * parent.speed, vy: Math.sin(childHeading) * parent.speed };
    return {
      ...parent,
      id,
      generation: 1,
      localOrdinal: index,
      emittedEffectIds: [],
      ...velocity,
      damage: parent.damage * split.damageScale,
      radius: parent.radius * split.radiusScale,
      behaviors: Object.freeze(inheritedBehaviors),
      hitTargetIds: [],
      everHit: false,
      travelled: 0,
      bornAt: parent.bornAt,
      maxTravel: split.childRange,
      splitParentId: parent.id,
      splitOrigin,
      spiralAngularSpeed: angularSpeed,
      spiralLaunchPending: spiral ? true : undefined,
      homingTargetId: undefined,
      homingMarkerRemaining: 0,
      relayTargetId: undefined,
      relayLost: undefined,
      wantedTargetId: undefined,
      baseHeading: childHeading,
      childIndex: index,
      childCount: split.count,
      wavePhase: 2 * Math.PI * index / split.count,
      waveDistance: 0,
      returnLeg: "outbound",
      legTravelled: 0,
      outboundHitTargetIds: [],
      returnHitTargetIds: [],
      cometSpeedFactor: undefined,
      cometRadiusFactor: undefined,
      cometDamageFactor: undefined,
    };
  });
}
