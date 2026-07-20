import type { MotionRule } from "./combat-build";
import type { ProjectileState, TrajectoryTarget } from "./projectiles";
import type { Point } from "./room";

export type MotionLeg = "outbound" | "return";
export type MotionDistanceEffect = "undertakersReturn" | "return-expire";
export type MotionSegment = Readonly<{
  from: Point;
  to: Point;
  startDistance: number;
  endDistance: number;
  startTime: number;
  endTime: number;
  startRadius: number;
  endRadius: number;
  startDamage: number;
  endDamage: number;
  startWavePhase?: number;
  endWavePhase?: number;
  startSpiralAngle?: number;
  endSpiralAngle?: number;
  leg: MotionLeg;
  distanceEffect?: MotionDistanceEffect;
}>;

export type MotionInput = Readonly<{
  projectile: ProjectileState;
  targets: readonly TrajectoryTarget[];
  dt: number;
  now: number;
}>;

export type MotionResult = Readonly<{
  projectile: ProjectileState;
  path: readonly MotionSegment[];
  trace: readonly ["anchor", "spiral", "converge", "wave", "accelerate", "return", "homing", "sweep"];
  expired: boolean;
}>;

export type MotionTarget = Readonly<{
  targetId?: string;
  turnRate: number;
  source?: "relay" | "ghost" | "wanted" | "soul";
}>;

const TRACE = Object.freeze([
  "anchor", "spiral", "converge", "wave", "accelerate", "return", "homing", "sweep",
] as const);
const HOMING_MARKER_DURATION = 0.18;
const EPSILON = 1e-10;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const angleDifference = (to: number, from: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function motionRule<Kind extends MotionRule["kind"]>(
  projectile: ProjectileState,
  kind: Kind,
): Extract<MotionRule, { kind: Kind }> | undefined {
  return projectile.motionRules?.find((candidate): candidate is Extract<MotionRule, { kind: Kind }> => candidate.kind === kind);
}

function distanceToSegmentSquared(point: TrajectoryTarget, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared === 0 ? 0 : clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared, 0, 1);
  return (point.x - from.x - dx * amount) ** 2 + (point.y - from.y - dy * amount) ** 2;
}

export function selectMotionTarget(
  projectile: ProjectileState,
  targets: readonly TrajectoryTarget[],
  proposedEnd: Point = { x: projectile.x + projectile.vx, y: projectile.y + projectile.vy },
): MotionTarget {
  const relay = motionRule(projectile, "relay") ?? projectile.behaviors.relay;
  const ghost = motionRule(projectile, "homing") ?? projectile.behaviors.homing;
  const wantedRate = projectile.generation === 0 ? projectile.wantedTurnRate ?? 0 : 0;
  const soulRate = projectile.generation === 1 ? projectile.soulTurnRate ?? 0 : 0;
  const turnRate = Math.max(relay?.turnRate ?? 0, ghost?.turnRate ?? 0, wantedRate, soulRate);
  const live = (id: string | undefined) => targets.find((target) => target.id === id && target.health > 0);

  const relayTarget = live(projectile.relayTargetId);
  if (relayTarget) return { targetId: relayTarget.id, turnRate, source: "relay" };
  const retainedGhost = live(projectile.homingTargetId);
  if (retainedGhost) return { targetId: retainedGhost.id, turnRate, source: "ghost" };
  const soul = projectile.generation === 1 ? live(projectile.soulTargetId) : undefined;
  if (soul) return { targetId: soul.id, turnRate, source: "soul" };
  const wanted = projectile.generation === 0 ? live(projectile.wantedTargetId) : undefined;
  if (wanted) return { targetId: wanted.id, turnRate, source: "wanted" };
  if (!ghost) return { turnRate };

  const acquired = targets
    .filter((target) => target.health > 0)
    .map((target) => ({ target, distance: distanceToSegmentSquared(target, projectile, proposedEnd) }))
    .filter(({ distance }) => distance <= ghost.radius ** 2)
    .sort((a, b) => a.distance - b.distance || a.target.id.localeCompare(b.target.id))[0]?.target;
  return acquired ? { targetId: acquired.id, turnRate, source: "ghost" } : { turnRate };
}

function factorAt(age: number, duration: number, scale: number): number {
  return 1 + (scale - 1) * clamp(age / duration, 0, 1);
}

function factorPrimitive(age: number, duration: number, scale: number): number {
  if (age <= 0) return age;
  if (age < duration) return age + (scale - 1) * age * age / (2 * duration);
  return duration * (1 + scale) / 2 + (age - duration) * scale;
}

function integratedFactor(fromAge: number, toAge: number, duration: number, scale: number): number {
  return factorPrimitive(toAge, duration, scale) - factorPrimitive(fromAge, duration, scale);
}

function synchronizePolar(projectile: ProjectileState, reference?: number): void {
  if (!projectile.spiralOrigin) return;
  const dx = projectile.x - projectile.spiralOrigin.x;
  const dy = projectile.y - projectile.spiralOrigin.y;
  projectile.spiralRadius = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  projectile.spiralAngle = reference === undefined
    ? angle
    : reference + angleDifference(angle, reference);
}

type Proposal = Readonly<{
  projectile: ProjectileState;
  distance: number;
  preHomingHeading: number;
  startWavePhase?: number;
  endWavePhase?: number;
}>;

function cloneProjectile(projectile: ProjectileState): ProjectileState {
  return {
    ...projectile,
    hitTargetIds: [...projectile.hitTargetIds],
    outboundHitTargetIds: [...(projectile.outboundHitTargetIds ?? projectile.hitTargetIds)],
    returnHitTargetIds: [...(projectile.returnHitTargetIds ?? [])],
  };
}

function propose(
  source: ProjectileState,
  slice: number,
  fromAge: number,
  target: TrajectoryTarget | undefined,
  turnRate: number,
  launchSpiral: boolean,
): Proposal {
  const next = cloneProjectile(source);
  const comet = motionRule(next, "comet") ?? next.behaviors.comet;
  const wave = motionRule(next, "wave") ?? next.behaviors.wave;
  const spiral = motionRule(next, "spiral") ?? next.behaviors.spiral;
  const convergence = next.converge ?? (next.behaviors.converge ? {
    side: Math.sign(next.behaviors.converge.lateralOffset) < 0 ? -1 as const : 1 as const,
    distance: next.behaviors.converge.distance,
  } : undefined);
  const fromSpeedFactor = next.cometSpeedFactor ?? (comet ? factorAt(fromAge, comet.duration, comet.speedScale) : 1);
  const fromRadiusFactor = next.cometRadiusFactor ?? (comet ? factorAt(fromAge, comet.duration, comet.radiusScale) : 1);
  const fromDamageFactor = next.cometDamageFactor ?? (comet ? factorAt(fromAge, comet.duration, comet.damageScale) : 1);
  const toAge = fromAge + slice;
  const toSpeedFactor = comet ? factorAt(toAge, comet.duration, comet.speedScale) : 1;
  const toRadiusFactor = comet ? factorAt(toAge, comet.duration, comet.radiusScale) : 1;
  const toDamageFactor = comet ? factorAt(toAge, comet.duration, comet.damageScale) : 1;
  const speedIntegral = comet
    ? integratedFactor(fromAge, toAge, comet.duration, comet.speedScale)
    : slice;
  const anchoredMotion = (wave || convergence) && next.returnLeg !== "return" && !next.reflected;
  const liveSpeed = comet || anchoredMotion ? next.speed : Math.hypot(next.vx, next.vy) || next.speed;
  const baseSpeed = fromSpeedFactor === 0 ? liveSpeed : liveSpeed / fromSpeedFactor;
  const forwardDistance = baseSpeed * speedIntegral;
  const start = { x: next.x, y: next.y };
  let x = next.x;
  let y = next.y;
  let preHomingHeading = Math.atan2(next.vy, next.vx);
  let spiralReference: number | undefined;

  if (spiral && !launchSpiral && next.spiralOrigin && next.spiralRadius !== undefined && next.spiralAngle !== undefined) {
    const averageSpeedFactor = slice === 0 ? toSpeedFactor : speedIntegral / slice;
    const radius = next.spiralRadius + spiral.radialSpeed * slice;
    const angle = next.spiralAngle + (next.spiralAngularSpeed ?? spiral.angularSpeed) * slice;
    const rawX = next.spiralOrigin.x + Math.cos(angle) * radius;
    const rawY = next.spiralOrigin.y + Math.sin(angle) * radius;
    x += (rawX - x) * averageSpeedFactor;
    y += (rawY - y) * averageSpeedFactor;
    preHomingHeading = Math.atan2(rawY - start.y, rawX - start.x);
    spiralReference = angle;
  } else {
    const heading = anchoredMotion ? next.baseHeading ?? preHomingHeading : preHomingHeading;
    preHomingHeading = heading;
    x += Math.cos(heading) * forwardDistance;
    y += Math.sin(heading) * forwardDistance;
  }

  if (convergence && !next.convergeDone) {
    const amplitude = Math.abs(next.behaviors.converge?.lateralOffset ?? 18) * convergence.side;
    const offsetAt = (distance: number) => {
      const progress = clamp(distance / convergence.distance, 0, 1);
      return progress === 0 || progress === 1 ? 0 : amplitude * Math.sin(Math.PI * progress);
    };
    const currentOffset = next.convergeOffset ?? offsetAt(next.travelled);
    const nx = -Math.sin(next.baseHeading ?? preHomingHeading);
    const ny = Math.cos(next.baseHeading ?? preHomingHeading);
    let change = offsetAt(next.travelled + Math.hypot(x - start.x, y - start.y)) - currentOffset;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const distance = Math.hypot(x + nx * change - start.x, y + ny * change - start.y);
      const corrected = offsetAt(next.travelled + distance) - currentOffset;
      if (Math.abs(corrected - change) <= 1e-12) {
        change = corrected;
        break;
      }
      change = corrected;
    }
    x += nx * change;
    y += ny * change;
    next.convergeOffset = currentOffset + change;
  }

  let startWavePhase: number | undefined;
  let endWavePhase: number | undefined;
  if (wave) {
    const wavePhase = next.wavePhase ?? (next.generation === 0
      ? 0
      : 2 * Math.PI * (next.childIndex ?? 0) / Math.max(1, next.childCount ?? 1));
    const startDistance = next.waveDistance ?? 0;
    const endDistance = startDistance + forwardDistance;
    startWavePhase = 2 * Math.PI * startDistance / wave.wavelength + wavePhase;
    endWavePhase = 2 * Math.PI * endDistance / wave.wavelength + wavePhase;
    const offset = wave.amplitude * (Math.sin(endWavePhase) - Math.sin(startWavePhase));
    const nx = -Math.sin(preHomingHeading);
    const ny = Math.cos(preHomingHeading);
    x += nx * offset;
    y += ny * offset;
    next.wavePhase = wavePhase;
    next.waveDistance = endDistance;
  }

  const rawDistance = Math.hypot(x - start.x, y - start.y);
  if (target && rawDistance > 0 && turnRate > 0) {
    const heading = Math.atan2(y - start.y, x - start.x);
    const desired = Math.atan2(target.y - start.y, target.x - start.x);
    const steered = heading + clamp(angleDifference(desired, heading), -turnRate * slice, turnRate * slice);
    x = start.x + Math.cos(steered) * rawDistance;
    y = start.y + Math.sin(steered) * rawDistance;
  }

  next.x = x;
  next.y = y;
  next.vx = slice === 0 ? next.vx : (x - start.x) / slice;
  next.vy = slice === 0 ? next.vy : (y - start.y) / slice;
  next.speed *= toSpeedFactor / fromSpeedFactor;
  next.radius *= toRadiusFactor / fromRadiusFactor;
  next.damage *= toDamageFactor / fromDamageFactor;
  next.cometSpeedFactor = comet ? toSpeedFactor : undefined;
  next.cometRadiusFactor = comet ? toRadiusFactor : undefined;
  next.cometDamageFactor = comet ? toDamageFactor : undefined;
  if (spiral && !launchSpiral) synchronizePolar(next, spiralReference);
  return {
    projectile: next,
    distance: Math.hypot(next.x - start.x, next.y - start.y),
    preHomingHeading,
    startWavePhase,
    endWavePhase,
  };
}

function normalizeInput(
  input: MotionInput | ProjectileState,
  targets?: readonly TrajectoryTarget[],
  dt?: number,
  now?: number,
): MotionInput {
  return "projectile" in input
    ? input
    : { projectile: input, targets: targets ?? [], dt: dt ?? 0, now: now ?? input.bornAt + (dt ?? 0) };
}

export function applyMotionRules(input: MotionInput): MotionResult;
export function applyMotionRules(projectile: ProjectileState, targets: readonly TrajectoryTarget[], dt: number, now: number): MotionResult;
export function applyMotionRules(
  input: MotionInput | ProjectileState,
  targets?: readonly TrajectoryTarget[],
  dt?: number,
  now?: number,
): MotionResult {
  const normalized = normalizeInput(input, targets, dt, now);
  const duration = Math.max(0, normalized.dt);
  const startAge = Math.max(0, normalized.now - duration - normalized.projectile.bornAt);
  let current = cloneProjectile(normalized.projectile);
  current.baseHeading ??= current.launchHeading ?? Math.atan2(current.vy, current.vx);
  current.childIndex ??= 0;
  current.childCount ??= 1;
  current.returnLeg ??= "outbound";
  current.legTravelled ??= 0;
  current.waveDistance ??= 0;
  current.homingMarkerRemaining = Math.max(0, (current.homingMarkerRemaining ?? 0) - duration);
  const spiral = motionRule(current, "spiral") ?? current.behaviors.spiral;
  const wave = motionRule(current, "wave") ?? current.behaviors.wave;
  const comet = motionRule(current, "comet") ?? current.behaviors.comet;
  const returning = motionRule(current, "return") ?? current.behaviors.return;
  const launchSpiral = Boolean(spiral && current.spiralLaunchPending);
  const predicted = { x: current.x + current.vx * duration, y: current.y + current.vy * duration };
  const selected = selectMotionTarget(current, normalized.targets, predicted);
  const selectedTarget = normalized.targets.find(({ id, health }) => id === selected.targetId && health > 0);
  if (current.relayTargetId && !normalized.targets.some(({ id, health }) => id === current.relayTargetId && health > 0)) {
    current.relayTargetId = undefined;
    current.relayLost = true;
  }
  if (selected.source === "ghost" && selected.targetId !== current.homingTargetId) {
    current.homingTargetId = selected.targetId;
    current.homingMarkerRemaining = HOMING_MARKER_DURATION;
  }

  const baseIntegral = comet
    ? integratedFactor(startAge, startAge + duration, comet.duration, comet.speedScale)
    : duration;
  const startSpeedFactor = current.cometSpeedFactor ?? (comet ? factorAt(startAge, comet.duration, comet.speedScale) : 1);
  const estimatedDistance = current.speed / startSpeedFactor * baseIntegral;
  const waveDistanceBound = comet
    ? current.speed / startSpeedFactor * Math.max(startSpeedFactor, factorAt(startAge + duration, comet.duration, comet.speedScale)) * duration
    : estimatedDistance;
  const waveSlices = wave ? Math.ceil(Math.abs(waveDistanceBound * 2 * Math.PI / wave.wavelength) / (Math.PI / 8)) : 1;
  const spiralSlices = spiral && !launchSpiral
    ? Math.ceil(Math.abs((current.spiralAngularSpeed ?? spiral.angularSpeed) * duration) / (Math.PI / 8))
    : 1;
  const cometSlices = comet ? Math.ceil(duration / (comet.duration / 16)) : 1;
  const slices = Math.max(1, waveSlices, spiralSlices, cometSlices);
  const path: MotionSegment[] = [];
  let elapsed = 0;
  let expired = false;

  const append = (proposal: Proposal, slice: number): void => {
    const from = current;
    const startDistance = from.travelled;
    const startLegDistance = from.legTravelled ?? 0;
    current = proposal.projectile;
    current.travelled = startDistance + proposal.distance;
    current.legTravelled = startLegDistance + proposal.distance;
    if (current.converge && current.travelled >= current.converge.distance - EPSILON) {
      current.convergeDone = true;
      current.convergeOffset = 0;
    } else if (current.behaviors.converge && current.travelled >= current.behaviors.converge.distance - EPSILON) {
      current.convergeDone = true;
      current.convergeOffset = 0;
    }
    path.push({
      from: { x: from.x, y: from.y },
      to: { x: current.x, y: current.y },
      startDistance,
      endDistance: current.travelled,
      startTime: duration === 0 ? 0 : elapsed / duration,
      endTime: duration === 0 ? 1 : (elapsed + slice) / duration,
      startRadius: from.radius,
      endRadius: current.radius,
      startDamage: from.damage,
      endDamage: current.damage,
      startWavePhase: proposal.startWavePhase,
      endWavePhase: proposal.endWavePhase,
      startSpiralAngle: from.spiralAngle,
      endSpiralAngle: current.spiralAngle,
      leg: from.returnLeg ?? "outbound",
    });
    elapsed += slice;
  };

  while (elapsed < duration - EPSILON && !expired) {
    let slice = Math.min(duration - elapsed, duration / slices);
    let proposal = propose(current, slice, startAge + elapsed, selectedTarget, selected.turnRate, launchSpiral);
    const threshold = returning
      ? (current.returnLeg === "return" ? returning.inbound : returning.outbound)
      : Infinity;
    const remaining = threshold - (current.legTravelled ?? 0);
    if (remaining >= -EPSILON && proposal.distance > remaining + EPSILON) {
      let low = 0;
      let high = slice;
      for (let iteration = 0; iteration < 52; iteration += 1) {
        const middle = (low + high) / 2;
        const candidate = propose(current, middle, startAge + elapsed, selectedTarget, selected.turnRate, launchSpiral);
        if (candidate.distance < remaining) low = middle;
        else high = middle;
      }
      slice = high;
      proposal = propose(current, slice, startAge + elapsed, selectedTarget, selected.turnRate, launchSpiral);
    }
    append(proposal, slice);

    if (returning && (current.legTravelled ?? 0) >= threshold - 1e-8) {
      const last = path.at(-1)!;
      if (current.returnLeg === "return") {
        path[path.length - 1] = { ...last, distanceEffect: "return-expire" };
        expired = true;
      } else {
        const residualRange = current.maxTravel === undefined ? Infinity : current.maxTravel - current.travelled;
        if (current.generation === 1 && residualRange < returning.inbound - EPSILON) {
          path[path.length - 1] = { ...last, distanceEffect: "return-expire" };
          expired = true;
        } else {
          path[path.length - 1] = { ...last, distanceEffect: "undertakersReturn" };
          current.returnLeg = "return";
          current.legTravelled = 0;
          current.damage *= returning.damageScale;
          current.hitTargetIds = [...(current.returnHitTargetIds ?? [])];
          const speed = Math.hypot(current.vx, current.vy) || current.speed;
          const heading = proposal.preHomingHeading + Math.PI;
          current.vx = Math.cos(heading) * speed;
          current.vy = Math.sin(heading) * speed;
          if (current.generation === 0) current.maxTravel = current.travelled + returning.inbound;
        }
      }
    }
  }

  if (duration === 0) path.push({
    from: { x: current.x, y: current.y }, to: { x: current.x, y: current.y },
    startDistance: current.travelled, endDistance: current.travelled,
    startTime: 0, endTime: 1, startRadius: current.radius, endRadius: current.radius,
    startDamage: current.damage, endDamage: current.damage, leg: current.returnLeg,
    startSpiralAngle: current.spiralAngle, endSpiralAngle: current.spiralAngle,
  });
  if (launchSpiral) {
    synchronizePolar(current);
    current.spiralLaunchPending = false;
  }
  return { projectile: current, path, trace: TRACE, expired };
}
