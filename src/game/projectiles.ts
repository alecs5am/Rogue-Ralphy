import { segmentCircleHitTime, type Point } from "./room";

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

export type ProjectileBehaviors = Readonly<{
  spiral?: SpiralBehavior;
  homing?: HomingBehavior;
  tesla?: TeslaBehavior;
  split?: SplitBehavior;
  penetration?: PenetrationBehavior;
}>;

export type ProjectileSpec = {
  triggerId: string; heading: number; damage: number; speed: number; radius: number; lifetime: number;
  freezeChance: number; freezeDuration: number; bounces: number; bounceRetention: number;
  behaviors: ProjectileBehaviors;
};

export type ProjectileState = {
  x: number; y: number; id: string; triggerId: string; vx: number; vy: number;
  generation: 0 | 1; rootTriggerId: string; lineageId: string;
  activatedEffectIds: readonly string[]; originPower: number;
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
  const candidates: TeslaLink[] = [];
  for (let first = 0; first < teslaProjectiles.length; first += 1) {
    for (let second = first + 1; second < teslaProjectiles.length; second += 1) {
      const { projectile: a, tesla: aTesla } = teslaProjectiles[first]!;
      const { projectile: b, tesla: bTesla } = teslaProjectiles[second]!;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance <= Math.min(aTesla.radius, bTesla.radius)) candidates.push({
        id: `${a.id}:${b.id}`,
        a: a.id,
        b: b.id,
        distance,
        damageScale: Math.min(aTesla.damageScale, bTesla.damageScale),
        cooldown: Math.max(aTesla.cooldown, bTesla.cooldown),
      });
    }
  }
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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const HOMING_MARKER_DURATION = 0.18;

function turnToward(current: number, desired: number, limit: number): number {
  const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  return current + clamp(difference, -limit, limit);
}

function distanceToSegmentSquared(point: TrajectoryTarget, from: ProjectileState, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared === 0 ? 0 : clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared, 0, 1);
  const x = from.x + dx * amount;
  const y = from.y + dy * amount;
  return (point.x - x) ** 2 + (point.y - y) ** 2;
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
  const next = { ...projectile, hitTargetIds: [...projectile.hitTargetIds] };
  next.homingMarkerRemaining = Math.max(0, (next.homingMarkerRemaining ?? 0) - dt);
  const spiral = next.behaviors.spiral;
  const launchSpiral = dt > 0 && spiral && next.spiralLaunchPending;
  let intendedSpiralAngle: number | undefined;
  if (dt > 0 && spiral && !launchSpiral && next.spiralOrigin && next.spiralRadius !== undefined && next.spiralAngle !== undefined) {
    const angularSpeed = next.spiralAngularSpeed ?? spiral.angularSpeed;
    next.spiralRadius += spiral.radialSpeed * dt;
    next.spiralAngle += angularSpeed * dt;
    intendedSpiralAngle = next.spiralAngle;
    const x = next.spiralOrigin.x + Math.cos(next.spiralAngle) * next.spiralRadius;
    const y = next.spiralOrigin.y + Math.sin(next.spiralAngle) * next.spiralRadius;
    next.vx = (x - next.x) / dt;
    next.vy = (y - next.y) / dt;
  }

  const proposedEnd = { x: next.x + next.vx * dt, y: next.y + next.vy * dt };
  const homing = next.behaviors.homing;
  if (homing) {
    let target = targets.find((candidate) => candidate.id === next.homingTargetId && candidate.health > 0);
    if (!target) {
      const candidates = targets
        .filter((candidate) => candidate.health > 0)
        .map((candidate) => ({ candidate, distance: distanceToSegmentSquared(candidate, next, proposedEnd) }))
        .filter(({ distance }) => distance <= homing.radius ** 2)
        .sort((a, b) => a.distance - b.distance || a.candidate.id.localeCompare(b.candidate.id));
      target = candidates[0]?.candidate;
      next.homingTargetId = target?.id;
      if (target) next.homingMarkerRemaining = HOMING_MARKER_DURATION;
    }
    if (target) {
      const heading = turnToward(
        Math.atan2(next.vy, next.vx),
        Math.atan2(target.y - next.y, target.x - next.x),
        homing.turnRate * dt,
      );
      const speed = Math.hypot(next.vx, next.vy);
      next.vx = Math.cos(heading) * speed;
      next.vy = Math.sin(heading) * speed;
    }
  }

  next.x += next.vx * dt;
  next.y += next.vy * dt;
  if (spiral && intendedSpiralAngle !== undefined) synchronizeSpiralState(next, intendedSpiralAngle);
  else if (launchSpiral) {
    synchronizeSpiralState(next);
    next.spiralLaunchPending = false;
  }
  return next;
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
      ...velocity,
      damage: parent.damage * split.damageScale,
      radius: parent.radius * split.radiusScale,
      behaviors: Object.freeze(inheritedBehaviors),
      hitTargetIds: [],
      everHit: false,
      travelled: 0,
      maxTravel: split.childRange,
      splitParentId: parent.id,
      splitOrigin,
      spiralAngularSpeed: angularSpeed,
      spiralLaunchPending: spiral ? true : undefined,
      homingTargetId: undefined,
      homingMarkerRemaining: 0,
    };
  });
}
