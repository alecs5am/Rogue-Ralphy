export type SpiralBehavior = Readonly<{ initialRadius: number; radialSpeed: number; angularSpeed: number; lifetime: number }>;
export type HomingBehavior = Readonly<{ radius: number; turnRate: number }>;
export type TeslaBehavior = Readonly<{ radius: number; neighbors: number; damageScale: number; cooldown: number }>;
export type SplitBehavior = Readonly<{ distance: number; count: number; childRange: number; damageScale: number }>;
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
  damage: number; speed: number; radius: number; lifetime: number; bornAt: number;
  remainingBounces: number; bounceRetention: number;
  freezeChance: number; freezeDuration: number;
  behaviors: ProjectileBehaviors; penetration?: PenetrationBehavior; hitTargetIds: string[]; everHit: boolean;
  travelled: number; maxTravel?: number;
  spiralOrigin?: Readonly<{ x: number; y: number }>;
  spiralRadius?: number; spiralAngle?: number; spiralAngularSpeed?: number;
  homingTargetId?: string;
};

export type TrajectoryTarget = Readonly<{ id: string; x: number; y: number; health: number }>;
export type TeslaLink = Readonly<{ id: string; a: string; b: string; distance: number }>;

export function buildTeslaLinks(projectiles: readonly ProjectileState[]): TeslaLink[] {
  const teslaProjectiles = projectiles
    .filter((projectile) => projectile.behaviors.tesla)
    .sort((a, b) => a.id.localeCompare(b.id));
  const candidates: TeslaLink[] = [];
  for (let first = 0; first < teslaProjectiles.length; first += 1) {
    for (let second = first + 1; second < teslaProjectiles.length; second += 1) {
      const a = teslaProjectiles[first]!;
      const b = teslaProjectiles[second]!;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance <= 96) candidates.push({ id: `${a.id}:${b.id}`, a: a.id, b: b.id, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));

  const degrees = new Map<string, number>();
  return candidates.filter(({ a, b }) => {
    if ((degrees.get(a) ?? 0) >= 2 || (degrees.get(b) ?? 0) >= 2) return false;
    degrees.set(a, (degrees.get(a) ?? 0) + 1);
    degrees.set(b, (degrees.get(b) ?? 0) + 1);
    return true;
  });
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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

function spiralVelocity(angle: number, radius: number, radialSpeed: number, angularSpeed: number): { vx: number; vy: number } {
  return {
    vx: Math.cos(angle) * radialSpeed - Math.sin(angle) * angularSpeed * radius,
    vy: Math.sin(angle) * radialSpeed + Math.cos(angle) * angularSpeed * radius,
  };
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
  const spiral = next.behaviors.spiral;
  let intendedSpiralAngle: number | undefined;
  if (dt > 0 && spiral && next.spiralOrigin && next.spiralRadius !== undefined && next.spiralAngle !== undefined) {
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
        .sort((a, b) => a.distance - b.distance);
      target = candidates[0]?.candidate;
      next.homingTargetId = target?.id;
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
  return next;
}

export function splitProjectile(parent: ProjectileState, nextIds: Iterable<string>): ProjectileState[] {
  const split = parent.behaviors.split;
  if (!split) return [];
  const { split: _, ...inheritedBehaviors } = parent.behaviors;
  const heading = Math.atan2(parent.vy, parent.vx);
  return Array.from(nextIds).slice(0, split.count).map((id, index) => {
    const childHeading = heading + Math.PI * 2 * index / split.count;
    const spiral = inheritedBehaviors.spiral;
    const angularSpeed = spiral && split.count > 1
      ? spiral.angularSpeed * (0.75 + 0.5 * index / (split.count - 1))
      : spiral?.angularSpeed;
    const velocity = spiral && parent.spiralRadius !== undefined && parent.spiralAngle !== undefined && angularSpeed !== undefined
      ? spiralVelocity(parent.spiralAngle, parent.spiralRadius, spiral.radialSpeed, angularSpeed)
      : { vx: Math.cos(childHeading) * parent.speed, vy: Math.sin(childHeading) * parent.speed };
    return {
      ...parent,
      id,
      ...velocity,
      damage: parent.damage * split.damageScale,
      behaviors: Object.freeze(inheritedBehaviors),
      hitTargetIds: [],
      everHit: false,
      travelled: 0,
      maxTravel: split.childRange,
      spiralAngularSpeed: angularSpeed,
      homingTargetId: undefined,
    };
  });
}
