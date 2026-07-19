import type { CombatBuild, EmissionRule } from "./combat-build";
import {
  recordDamage,
  recordKill,
  recordProjectile,
  recordProjectileOutcome,
  retainTargetMetrics,
  type Metrics,
} from "./metrics";
import {
  advanceTrajectory,
  buildTeslaLinks,
  splitProjectile,
  sweptCircleCollision,
  synchronizeSpiralState,
  type ProjectileSpec,
  type ProjectileState,
  type TeslaLink,
} from "./projectiles";
import { segmentCircleHitTime, type Point } from "./room";
import { compareScheduledProjectiles, type ScheduledProjectile } from "./trigger";

export type CombatEvent = Readonly<{
  eventTime: number;
  kind: "prop" | "wall" | "target" | "distance" | "range" | "lifetime";
  projectileId: string;
  targetId?: string;
  colliderId?: string;
  point: Point;
  normal?: Point;
  segment?: Readonly<{ from: Point; to: Point }>;
}>;

export type PendingEmission = Readonly<{
  atStep: number;
  effectId: string;
  artifactId: string;
  rootTriggerId: string;
  lineageId: string;
  generation: 1;
  originPower: number;
  specs: readonly ProjectileSpec[];
  activatedEffectIds?: readonly string[];
  templates?: readonly ProjectileState[];
}>;

export type AreaState = Readonly<{
  id: string;
  effectId: string;
  artifactId: string;
  rootTriggerId: string;
  instanceKey: string;
  bornAt: number;
  expiresAt: number;
  tickInterval: number;
}>;

export type VfxCommand = Readonly<{
  id: string;
  kind: string;
  artifactId: string;
  bornAt: number;
  expiresAt: number;
  x: number;
  y: number;
  targetId?: string;
}>;

export type CombatTargetState = Readonly<Point & {
  id: string;
  kind: "dummy" | "chaser";
  radius: number;
  health: number;
  maxHealth: number;
  immortal: boolean;
  speed: number;
  frozenUntil: number;
}>;

export type CombatRuntime = Readonly<{
  projectiles: readonly ProjectileState[];
  targets: readonly CombatTargetState[];
  scheduledProjectiles: readonly ScheduledProjectile[];
  pendingEmissions: readonly PendingEmission[];
  areas: readonly AreaState[];
  vfxCommands: readonly VfxCommand[];
  metrics: Metrics;
  nextId: number;
  step: number;
  now: number;
}>;

type RoomGeometry = Readonly<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}>;

type PropGeometry = Readonly<Point & { id: string; collisionRadius: number }>;

export type CombatContext = Readonly<{
  dt: number;
  room: RoomGeometry;
  props: readonly PropGeometry[];
  build: CombatBuild;
  rng: () => number;
  player: Readonly<Point & { radius: number }>;
  trajectoryTargets?: readonly CombatTargetState[];
  teslaLinks: readonly TeslaLink[];
  teslaCooldowns: Readonly<Record<string, number>>;
  fireRate: number;
}>;

type SweptSegment = Readonly<{
  projectileId: string;
  from: Point;
  to: Point;
  distance: number;
  liveDuration: number;
  expiresAfterMove: boolean;
  startTravelled: number;
  startSpiralAngle?: number;
  endSpiralAngle?: number;
}>;

type EmissionRequest = Readonly<{ projectile: ProjectileState; rule: EmissionRule }>;

type CombatPhaseState = CombatRuntime & Readonly<{
  segments: readonly SweptSegment[];
  events: readonly CombatEvent[];
  emissionRequests: readonly EmissionRequest[];
  teslaLinks: readonly TeslaLink[];
  teslaCooldowns: Readonly<Record<string, number>>;
}>;

const EVENT_PRIORITY: Readonly<Record<CombatEvent["kind"], number>> = {
  prop: 0,
  wall: 1,
  target: 2,
  distance: 3,
  range: 4,
  lifetime: 5,
};

const compareString = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const tolerantDifference = (a: number, b: number): number => {
  const difference = a - b;
  const tolerance = Number.EPSILON * 128 * Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(difference) <= tolerance ? 0 : difference;
};

export function sortCombatEvents(events: readonly CombatEvent[]): CombatEvent[] {
  return [...events].sort((a, b) => tolerantDifference(a.eventTime, b.eventTime)
    || compareString(a.projectileId, b.projectileId)
    || compareString(a.targetId ?? a.colliderId ?? "\uffff", b.targetId ?? b.colliderId ?? "\uffff")
    || EVENT_PRIORITY[a.kind] - EVENT_PRIORITY[b.kind]);
}

const cloneProjectile = (projectile: ProjectileState): ProjectileState => ({
  ...projectile,
  emission: projectile.emission && { ...projectile.emission },
  activatedEffectIds: [...projectile.activatedEffectIds],
  behaviors: Object.freeze(Object.fromEntries(Object.entries(projectile.behaviors).map(([key, value]) => [
    key,
    value && typeof value === "object" ? { ...value } : value,
  ]))),
  penetration: projectile.penetration && { ...projectile.penetration },
  hitTargetIds: [...projectile.hitTargetIds],
  splitOrigin: projectile.splitOrigin,
  spiralOrigin: projectile.spiralOrigin,
  bellPulse: projectile.bellPulse && { ...projectile.bellPulse },
});

const cloneTarget = (target: CombatTargetState): CombatTargetState => ({ ...target });

function phaseState(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const previous = runtime as Partial<CombatPhaseState>;
  return {
    ...runtime,
    segments: previous.segments ?? [],
    events: previous.events ?? [],
    emissionRequests: previous.emissionRequests ?? [],
    teslaLinks: previous.teslaLinks ?? context.teslaLinks,
    teslaCooldowns: previous.teslaCooldowns ?? context.teslaCooldowns,
  };
}

function assertFinite(value: unknown, path = "combat runtime", seen = new Set<object>()): void {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path} must be finite`);
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) assertFinite(child, `${path}.${key}`, seen);
}

function assertRuntime(runtime: CombatRuntime, context: CombatContext): void {
  assertFinite(runtime);
  assertFinite({ dt: context.dt, room: context.room, props: context.props, fireRate: context.fireRate }, "combat context");
  if (context.dt < 0) throw new Error("combat context.dt must be nonnegative");
  if (!Number.isInteger(runtime.step) || runtime.step < 0) throw new Error("combat runtime step must be a nonnegative integer");
  for (const projectile of runtime.projectiles) {
    if (projectile.generation !== 0 && projectile.generation !== 1) throw new Error("projectile generation exceeds one");
  }
  for (const scheduled of runtime.scheduledProjectiles) {
    if (scheduled.generation !== 0 && scheduled.generation !== 1) throw new Error("scheduled projectile generation exceeds one");
    if (!Number.isInteger(scheduled.rootIndex) || scheduled.rootIndex < 0 ||
        !Number.isInteger(scheduled.localOrdinal) || scheduled.localOrdinal < 0) {
      throw new Error("scheduled projectile ordering must use nonnegative integers");
    }
  }
  for (const pending of runtime.pendingEmissions) {
    if (pending.generation !== 1) throw new Error("pending emission generation must be one");
    if (!Number.isInteger(pending.atStep) || pending.atStep < 0) throw new Error("pending emission step must be a nonnegative integer");
  }
  for (const event of runtime.metrics.hitEvents) {
    if (event.killReactionDepth !== 0 && event.killReactionDepth !== 1) throw new Error("kill reaction depth exceeds one");
  }

  const areaInstances = new Set<string>();
  for (const area of runtime.areas) {
    if (area.expiresAt <= area.bornAt || area.expiresAt - area.bornAt > 3) {
      throw new Error("area lifetime must be positive and at most three seconds");
    }
    if (area.tickInterval < 0.1) throw new Error("area tick rate must not exceed ten hertz");
    const key = `${area.effectId}\0${area.rootTriggerId}\0${area.instanceKey}`;
    if (areaInstances.has(key)) throw new Error("duplicate area instance");
    areaInstances.add(key);
  }

  const vfxIds = new Set<string>();
  for (const command of runtime.vfxCommands) {
    if (command.expiresAt <= command.bornAt || command.expiresAt - command.bornAt > 3) {
      throw new Error("VFX lifetime must be positive and at most three seconds");
    }
    if (vfxIds.has(command.id)) throw new Error("duplicate VFX id");
    vfxIds.add(command.id);
  }
  const vfxLimit = Math.max(1, Math.ceil(context.fireRate * 3 * (11 + context.build.maxDescendants)));
  if (runtime.vfxCommands.length > vfxLimit) throw new Error(`VFX live count exceeds derived bound ${vfxLimit}`);
}

function projectileSpec(projectile: ProjectileState): ProjectileSpec {
  return Object.freeze({
    triggerId: projectile.rootTriggerId,
    heading: Math.atan2(projectile.vy, projectile.vx),
    damage: projectile.damage,
    speed: projectile.speed,
    radius: projectile.radius,
    lifetime: projectile.lifetime,
    freezeChance: projectile.freezeChance,
    freezeDuration: projectile.freezeDuration,
    bounces: projectile.remainingBounces,
    bounceRetention: projectile.bounceRetention,
    behaviors: projectile.behaviors,
  });
}

export function queueEmission(
  projectile: ProjectileState,
  rule: EmissionRule,
  options: Readonly<{ step: number; nextIds: readonly string[] }> = { step: 0, nextIds: [] },
): PendingEmission {
  if (projectile.generation === 1) throw new Error("generation-one projectile cannot emit");
  if (rule.kind !== "splitCone" || !projectile.behaviors.split) throw new Error("projectile has no compatible emission");
  const ids = options.nextIds.length > 0
    ? options.nextIds
    : Array.from({ length: rule.count }, (_, index) => `${projectile.id}:emission-${index}`);
  const emission = Object.freeze({ artifactId: rule.artifactId, effectId: rule.effectId });
  const templates = splitProjectile(cloneProjectile(projectile), ids).map((child) => Object.freeze(cloneProjectile({
    ...child,
    emission,
  })));
  return Object.freeze({
    atStep: options.step + 1,
    effectId: rule.effectId,
    artifactId: rule.artifactId,
    rootTriggerId: projectile.rootTriggerId,
    lineageId: projectile.lineageId,
    generation: 1,
    originPower: projectile.originPower,
    specs: Object.freeze(templates.map(projectileSpec)),
    activatedEffectIds: Object.freeze([...projectile.activatedEffectIds]),
    templates: Object.freeze(templates),
  });
}

function materializeScheduled(
  scheduled: ScheduledProjectile,
  context: CombatContext,
  now: number,
  id: string,
): ProjectileState {
  const { spec } = scheduled;
  const aimAngle = scheduled.aim ?? spec.heading;
  const origin = scheduled.origin ?? context.player;
  const muzzle = {
    x: origin.x + Math.cos(aimAngle) * (context.player.radius + spec.radius + 2),
    y: origin.y + Math.sin(aimAngle) * (context.player.radius + spec.radius + 2),
  };
  const spiral = spec.behaviors.spiral;
  const motionPhase = spec.motionPhase ?? spec.heading;
  const spiralOrigin = spiral ? Object.freeze({ ...muzzle }) : undefined;
  const spiralRadius = spiral?.initialRadius;
  const spiralAngle = spiral ? motionPhase : undefined;
  return {
    id,
    triggerId: scheduled.rootTriggerId,
    generation: scheduled.generation,
    rootTriggerId: scheduled.rootTriggerId,
    lineageId: scheduled.lineageId,
    activatedEffectIds: [...scheduled.effectIds],
    emission: scheduled.emission && { ...scheduled.emission },
    originPower: spec.damage,
    x: muzzle.x + (spiral ? Math.cos(motionPhase) * spiral.initialRadius : 0),
    y: muzzle.y + (spiral ? Math.sin(motionPhase) * spiral.initialRadius : 0),
    vx: spiral
      ? Math.cos(motionPhase) * spiral.radialSpeed - Math.sin(motionPhase) * spiral.angularSpeed * spiral.initialRadius
      : Math.cos(spec.heading) * spec.speed,
    vy: spiral
      ? Math.sin(motionPhase) * spiral.radialSpeed + Math.cos(motionPhase) * spiral.angularSpeed * spiral.initialRadius
      : Math.sin(spec.heading) * spec.speed,
    damage: spec.damage,
    speed: spec.speed,
    radius: spec.radius,
    lifetime: spiral?.lifetime ?? spec.lifetime,
    bornAt: now,
    remainingBounces: spec.bounces,
    bounceRetention: spec.bounceRetention,
    freezeChance: spec.freezeChance,
    freezeDuration: spec.freezeDuration,
    behaviors: spec.behaviors,
    penetration: spec.behaviors.penetration,
    hitTargetIds: [],
    everHit: false,
    travelled: 0,
    spiralOrigin,
    spiralRadius,
    spiralAngle,
    spiralAngularSpeed: spiral?.angularSpeed,
    launchHeading: spec.heading,
    convergeOffset: spec.behaviors.converge ? 0 : undefined,
    bellPulse: spec.bell && {
      interval: spec.bell.interval,
      radius: spec.bell.radius,
      damageScale: spec.bell.damageScale,
      nextAt: now + spec.bell.interval,
      remaining: spec.bell.count,
    },
  };
}

function materializePending(
  pending: PendingEmission,
  context: CombatContext,
  now: number,
  nextId: number,
): Readonly<{ projectiles: ProjectileState[]; nextId: number }> {
  if (pending.templates) return {
    projectiles: pending.templates.map(cloneProjectile),
    nextId,
  };
  let id = nextId;
  const projectiles = pending.specs.map((spec) => {
    const { triggerId: _, ...scheduledSpec } = spec;
    return {
      ...materializeScheduled({
        at: now,
        generation: 1,
        rootTriggerId: pending.rootTriggerId,
        rootIndex: Number.MAX_SAFE_INTEGER,
        localOrdinal: id,
        lineageId: pending.lineageId,
        effectIds: pending.activatedEffectIds ?? ["baseRevolver.direct", pending.effectId],
        emission: { artifactId: pending.artifactId, effectId: pending.effectId },
        spec: scheduledSpec,
        aim: spec.heading,
        origin: context.player,
      }, context, now, `projectile-${id++}`),
      originPower: pending.originPower,
    };
  });
  return { projectiles, nextId: id };
}

export function resolveTriggerPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  assertRuntime(runtime, context);
  const scheduled = [...runtime.scheduledProjectiles].sort(compareScheduledProjectiles);
  const dueSchedules = scheduled.filter(({ at }) => at <= runtime.now);
  const futureSchedules = scheduled.filter(({ at }) => at > runtime.now);
  const pending = [...runtime.pendingEmissions].sort((a, b) => a.atStep - b.atStep
    || compareString(a.lineageId, b.lineageId)
    || compareString(a.effectId, b.effectId));
  const duePending = pending.filter(({ atStep }) => atStep <= runtime.step);
  const futurePending = pending.filter(({ atStep }) => atStep > runtime.step);
  let nextId = runtime.nextId;
  const created = dueSchedules.map((scheduledProjectile) =>
    materializeScheduled(scheduledProjectile, context, runtime.now, `projectile-${nextId++}`));
  for (const emission of duePending) {
    const materialized = materializePending(emission, context, runtime.now, nextId);
    created.push(...materialized.projectiles);
    nextId = materialized.nextId;
  }
  let metrics = runtime.metrics;
  for (const _ of created) metrics = recordProjectile(metrics);
  return {
    ...phaseState(runtime, context),
    projectiles: [...runtime.projectiles.map(cloneProjectile), ...created],
    targets: runtime.targets.map(cloneTarget),
    scheduledProjectiles: futureSchedules,
    pendingEmissions: futurePending,
    metrics,
    nextId,
    segments: [],
    events: [],
    emissionRequests: [],
  };
}

export function resolveMotionPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  const segments: SweptSegment[] = [];
  const projectiles = current.projectiles.map((source) => {
    const projectile = cloneProjectile(source);
    const liveDuration = Math.max(0, Math.min(
      context.dt,
      projectile.lifetime - Math.max(0, current.now - context.dt - projectile.bornAt),
    ));
    const moved = advanceTrajectory(projectile, context.trajectoryTargets ?? current.targets, liveDuration);
    segments.push({
      projectileId: projectile.id,
      from: { x: projectile.x, y: projectile.y },
      to: { x: moved.x, y: moved.y },
      distance: Math.hypot(moved.x - projectile.x, moved.y - projectile.y),
      liveDuration,
      expiresAfterMove: current.now - projectile.bornAt >= projectile.lifetime,
      startTravelled: projectile.travelled,
      startSpiralAngle: projectile.spiralAngle,
      endSpiralAngle: moved.spiralAngle,
    });
    return moved;
  });
  return { ...current, projectiles, segments, events: [], emissionRequests: [] };
}

type WallHit = Readonly<{ time: number; normal: Point }>;

function firstWallHit(from: Point, to: Point, radius: number, room: RoomGeometry): WallHit | undefined {
  const hits: Readonly<{ time: number; normal: Point }>[] = [];
  if (to.x < room.minX + radius) hits.push({ time: (room.minX + radius - from.x) / (to.x - from.x), normal: { x: 1, y: 0 } });
  else if (to.x > room.maxX - radius) hits.push({ time: (room.maxX - radius - from.x) / (to.x - from.x), normal: { x: -1, y: 0 } });
  if (to.y < room.minY + radius) hits.push({ time: (room.minY + radius - from.y) / (to.y - from.y), normal: { x: 0, y: 1 } });
  else if (to.y > room.maxY - radius) hits.push({ time: (room.maxY - radius - from.y) / (to.y - from.y), normal: { x: 0, y: -1 } });
  const first = [...hits].sort((a, b) => a.time - b.time)[0];
  if (!first) return undefined;
  const simultaneous = hits.filter((hit) => tolerantDifference(hit.time, first.time) === 0);
  return {
    time: first.time,
    normal: {
      x: simultaneous.reduce((total, hit) => total + hit.normal.x, 0),
      y: simultaneous.reduce((total, hit) => total + hit.normal.y, 0),
    },
  };
}

const pointAt = (segment: SweptSegment, time: number): Point => ({
  x: segment.from.x + (segment.to.x - segment.from.x) * time,
  y: segment.from.y + (segment.to.y - segment.from.y) * time,
});

export function collectCombatEvents(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  const projectileById = new Map(current.projectiles.map((projectile) => [projectile.id, projectile]));
  const events: CombatEvent[] = [];
  for (const segment of current.segments) {
    const projectile = projectileById.get(segment.projectileId);
    if (!projectile) continue;
    const path = { from: { ...segment.from }, to: { ...segment.to } };
    if (segment.expiresAfterMove && segment.liveDuration === 0) {
      events.push({ eventTime: 0, kind: "lifetime", projectileId: projectile.id, point: { ...segment.from }, segment: path });
      continue;
    }
    if (!projectile.penetration?.obstacles) {
      for (const prop of context.props) {
        const hit = sweptCircleCollision(segment.from, segment.to, projectile, {
          id: prop.id, x: prop.x, y: prop.y, radius: prop.collisionRadius,
        });
        if (!hit) continue;
        events.push({
          eventTime: hit.eventTime,
          kind: "prop",
          projectileId: projectile.id,
          colliderId: hit.colliderId,
          point: hit.point,
          normal: hit.normal,
          segment: path,
        });
      }
    }
    const wall = firstWallHit(segment.from, segment.to, projectile.radius, context.room);
    if (wall) events.push({
      eventTime: wall.time,
      kind: "wall",
      projectileId: projectile.id,
      colliderId: "room",
      point: pointAt(segment, wall.time),
      normal: wall.normal,
      segment: path,
    });
    for (const target of current.targets) {
      if (target.health <= 0 || projectile.hitTargetIds.includes(target.id)) continue;
      const hit = sweptCircleCollision(segment.from, segment.to, projectile, target);
      if (!hit) continue;
      events.push({
        eventTime: hit.eventTime,
        kind: "target",
        projectileId: projectile.id,
        targetId: target.id,
        point: hit.point,
        normal: hit.normal,
        segment: path,
      });
    }
    if (projectile.generation === 0 && projectile.behaviors.split) {
      const remaining = projectile.behaviors.split.distance - segment.startTravelled;
      if (remaining <= segment.distance) {
        const time = segment.distance === 0 ? 0 : Math.max(0, remaining / segment.distance);
        events.push({ eventTime: time, kind: "distance", projectileId: projectile.id, point: pointAt(segment, time), segment: path });
      }
    }
    if (projectile.maxTravel !== undefined) {
      const remaining = projectile.maxTravel - segment.startTravelled;
      if (remaining <= segment.distance) {
        const time = segment.distance === 0 ? 0 : Math.max(0, remaining / segment.distance);
        events.push({ eventTime: time, kind: "range", projectileId: projectile.id, point: pointAt(segment, time), segment: path });
      }
    }
    if (segment.expiresAfterMove) events.push({
      eventTime: 1,
      kind: "lifetime",
      projectileId: projectile.id,
      point: { ...segment.to },
      segment: path,
    });
  }
  return { ...current, events: sortCombatEvents(events) };
}

function reflect(projectile: ProjectileState, normal: Point): void {
  const length = Math.hypot(normal.x, normal.y) || 1;
  const nx = normal.x / length;
  const ny = normal.y / length;
  const dot = projectile.vx * nx + projectile.vy * ny;
  projectile.vx -= 2 * dot * nx;
  projectile.vy -= 2 * dot * ny;
  projectile.remainingBounces -= 1;
  projectile.damage *= projectile.bounceRetention;
  if (projectile.behaviors.spiral) {
    const { spiral: _, ...behaviors } = projectile.behaviors;
    projectile.behaviors = Object.freeze(behaviors);
    projectile.spiralOrigin = undefined;
    projectile.spiralRadius = undefined;
    projectile.spiralAngle = undefined;
    projectile.spiralAngularSpeed = undefined;
    projectile.spiralLaunchPending = undefined;
  }
}

function synchronizeImpactSpiral(projectile: ProjectileState, segment: SweptSegment, eventTime: number): void {
  if (segment.startSpiralAngle === undefined || segment.endSpiralAngle === undefined || projectile.spiralAngle === undefined) return;
  const reference = segment.startSpiralAngle + (segment.endSpiralAngle - segment.startSpiralAngle) * eventTime;
  synchronizeSpiralState(projectile, reference);
}

export function resolveImpactPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  const projectiles = current.projectiles.map(cloneProjectile);
  const finalProjectiles = new Map(projectiles.map((projectile) => [projectile.id, cloneProjectile(projectile)]));
  const projectileById = new Map(projectiles.map((projectile) => [projectile.id, projectile]));
  const targets = current.targets.map(cloneTarget);
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const segmentById = new Map(current.segments.map((segment) => [segment.projectileId, segment]));
  const removed = new Set<string>();
  const settled = new Set<string>();
  const emissionRequests: EmissionRequest[] = [];
  let metrics = current.metrics;

  for (const event of current.events) {
    if (removed.has(event.projectileId) || settled.has(event.projectileId)) continue;
    const projectile = projectileById.get(event.projectileId);
    const segment = segmentById.get(event.projectileId);
    if (!projectile || !segment) continue;
    if (event.kind === "target") {
      const target = targetById.get(event.targetId!);
      if (!target || (!target.immortal && target.health <= 0)) continue;
    }

    projectile.x = event.point.x;
    projectile.y = event.point.y;
    projectile.travelled = segment.startTravelled + segment.distance * event.eventTime;
    if (event.kind !== "target" || !projectile.penetration?.targets) {
      synchronizeImpactSpiral(projectile, segment, event.eventTime);
    }

    if (event.kind === "distance") {
      const rule = context.build.emissions.find((candidate) =>
        candidate.kind === "splitCone" && projectile.activatedEffectIds.includes(candidate.effectId));
      if (rule && projectile.generation === 0) emissionRequests.push({ projectile: cloneProjectile(projectile), rule });
      metrics = recordProjectileOutcome(metrics, projectile.everHit);
      removed.add(projectile.id);
      continue;
    }
    if (event.kind === "range" || event.kind === "lifetime") {
      metrics = recordProjectileOutcome(metrics, projectile.everHit);
      removed.add(projectile.id);
      continue;
    }
    if (event.kind === "prop" || event.kind === "wall") {
      if (projectile.remainingBounces <= 0) {
        metrics = recordProjectileOutcome(metrics, projectile.everHit);
        removed.add(projectile.id);
      } else {
        if (event.kind === "prop") {
          const prop = context.props.find(({ id }) => id === event.colliderId)!;
          const normalLength = Math.hypot(event.normal!.x, event.normal!.y) || 1;
          const separation = prop.collisionRadius + projectile.radius + 0.01;
          projectile.x = prop.x + event.normal!.x / normalLength * separation;
          projectile.y = prop.y + event.normal!.y / normalLength * separation;
        }
        reflect(projectile, event.normal!);
        if (segment.expiresAfterMove) {
          metrics = recordProjectileOutcome(metrics, projectile.everHit);
          removed.add(projectile.id);
        } else settled.add(projectile.id);
      }
      continue;
    }

    const target = targetById.get(event.targetId!)!;
    const firstHit = !projectile.everHit;
    projectile.everHit = true;
    projectile.hitTargetIds.push(target.id);
    if (!target.immortal) (target as { health: number }).health -= projectile.damage;
    if (projectile.freezeChance > 0 && context.rng() < projectile.freezeChance) {
      (target as { frozenUntil: number }).frozenUntil = Math.max(target.frozenUntil, current.now + projectile.freezeDuration);
    }
    metrics = recordDamage(metrics, {
      source: "direct",
      damage: projectile.damage,
      time: current.now,
      targetId: target.id,
      artifactId: "baseRevolver",
      effectId: "baseRevolver.direct",
      rootTriggerId: projectile.rootTriggerId,
      lineageId: projectile.lineageId,
      projectileId: projectile.id,
      killReactionDepth: 0,
      originPower: projectile.originPower,
      firstProjectileHit: firstHit,
      x: target.x,
      y: target.y,
    });
    if (!target.immortal && target.kind === "chaser" && target.health <= 0) metrics = recordKill(metrics, target.id);
    if (projectile.penetration?.targets) continue;
    if (projectile.remainingBounces > 0) {
      const normal = event.normal!;
      projectile.x = target.x + normal.x * (target.radius + projectile.radius + 0.01);
      projectile.y = target.y + normal.y * (target.radius + projectile.radius + 0.01);
      reflect(projectile, normal);
      if (segment.expiresAfterMove) {
        metrics = recordProjectileOutcome(metrics, projectile.everHit);
        removed.add(projectile.id);
      } else settled.add(projectile.id);
    } else {
      metrics = recordProjectileOutcome(metrics, projectile.everHit);
      removed.add(projectile.id);
    }
  }

  for (const projectile of projectiles) {
    if (removed.has(projectile.id) || settled.has(projectile.id)) continue;
    const segment = segmentById.get(projectile.id);
    const final = finalProjectiles.get(projectile.id);
    if (!segment || !final) continue;
    projectile.x = segment.to.x;
    projectile.y = segment.to.y;
    projectile.travelled = segment.startTravelled + segment.distance;
    projectile.spiralRadius = final.spiralRadius;
    projectile.spiralAngle = final.spiralAngle;
    projectile.spiralAngularSpeed = final.spiralAngularSpeed;
    projectile.spiralLaunchPending = final.spiralLaunchPending;
  }

  return {
    ...current,
    projectiles: projectiles.filter(({ id }) => !removed.has(id)),
    targets,
    metrics,
    emissionRequests,
  };
}

export function resolveEmissionPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  let nextId = current.nextId;
  const pending = [...current.pendingEmissions];
  for (const request of current.emissionRequests) {
    const count = request.rule.kind === "splitCone" ? request.rule.count : 0;
    const nextIds = Array.from({ length: count }, () => `projectile-${nextId++}`);
    pending.push(queueEmission(request.projectile, request.rule, { step: current.step, nextIds }));
  }
  return { ...current, pendingEmissions: pending, nextId, emissionRequests: [] };
}

export function resolveAreaPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  const projectiles = current.projectiles.map(cloneProjectile);
  let targets = current.targets.map(cloneTarget);
  const vfxCommands = [...current.vfxCommands];
  let nextId = current.nextId;
  let metrics = current.metrics;
  for (const projectile of projectiles) {
    let pulse = projectile.bellPulse;
    while (pulse && pulse.remaining > 0 && pulse.nextAt <= current.now) {
      const pulseAt = pulse.nextAt;
      targets = targets.map((target) => {
        if ((!target.immortal && target.health <= 0) || Math.hypot(target.x - projectile.x, target.y - projectile.y) > pulse!.radius + target.radius) return target;
        const damage = projectile.damage * pulse!.damageScale;
        const damaged = target.immortal ? target : { ...target, health: target.health - damage };
        metrics = recordDamage(metrics, {
          source: "area",
          damage,
          time: pulseAt,
          targetId: target.id,
          artifactId: "lastBell",
          effectId: "lastBell.rings",
          rootTriggerId: projectile.rootTriggerId,
          lineageId: projectile.lineageId,
          projectileId: projectile.id,
          killReactionDepth: 0,
          originPower: projectile.originPower,
          x: target.x,
          y: target.y,
        });
        if (!damaged.immortal && damaged.kind === "chaser" && damaged.health <= 0) metrics = recordKill(metrics, damaged.id);
        return damaged;
      });
      vfxCommands.push({
        id: `vfx-${nextId++}`,
        kind: "lastBell.ring",
        artifactId: "lastBell",
        bornAt: current.now,
        expiresAt: current.now + 0.2,
        x: projectile.x,
        y: projectile.y,
      });
      pulse = { ...pulse, nextAt: pulse.nextAt + pulse.interval, remaining: pulse.remaining - 1 };
    }
    projectile.bellPulse = pulse?.remaining ? pulse : undefined;
  }
  const links = buildTeslaLinks(projectiles);
  const projectileById = new Map(projectiles.map((projectile) => [projectile.id, projectile]));
  let cooldowns = { ...current.teslaCooldowns };
  for (const link of links) {
    const a = projectileById.get(link.a)!;
    const b = projectileById.get(link.b)!;
    targets = targets.map((target) => {
      if ((!target.immortal && target.health <= 0) || segmentCircleHitTime(a, b, target, target.radius) === null) return target;
      const key = `${link.id}:${target.id}`;
      if (current.now < (cooldowns[key] ?? 0)) return target;
      const damage = Math.min(a.damage, b.damage) * link.damageScale;
      const source = a.damage <= b.damage ? a : b;
      const damaged = target.immortal ? target : { ...target, health: target.health - damage };
      metrics = recordDamage(metrics, {
        source: "link",
        damage,
        time: current.now,
        targetId: target.id,
        artifactId: "teslaBullets",
        effectId: "teslaBullets.link",
        rootTriggerId: source.rootTriggerId,
        lineageId: source.lineageId,
        projectileId: source.id,
        killReactionDepth: 0,
        originPower: source.originPower,
        x: target.x,
        y: target.y,
      });
      if (!damaged.immortal && damaged.kind === "chaser" && damaged.health <= 0) metrics = recordKill(metrics, damaged.id);
      cooldowns[key] = current.now + link.cooldown;
      return damaged;
    });
  }
  targets = targets.filter((target) => target.immortal || target.health > 0);
  const activeKeys = new Set(links.flatMap((link) => targets.map((target) => `${link.id}:${target.id}`)));
  cooldowns = Object.fromEntries(Object.entries(cooldowns)
    .filter(([key, nextAllowedAt]) => nextAllowedAt > current.now || activeKeys.has(key)));
  return {
    ...current,
    projectiles,
    targets,
    areas: current.areas.filter(({ expiresAt }) => expiresAt > current.now),
    vfxCommands,
    metrics,
    nextId,
    teslaLinks: links,
    teslaCooldowns: cooldowns,
  };
}

export function resolveKillAndCleanupPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  const targets = current.targets.filter((target) => target.immortal || target.health > 0).map(cloneTarget);
  return {
    ...current,
    targets,
    areas: current.areas.filter(({ expiresAt }) => expiresAt > current.now),
    vfxCommands: current.vfxCommands.filter(({ expiresAt }) => expiresAt > current.now),
    metrics: retainTargetMetrics(current.metrics, targets.map(({ id }) => id)),
    events: [],
    segments: [],
    emissionRequests: [],
  };
}

export function resolveCombatPhases(runtime: CombatRuntime, context: CombatContext): CombatPhaseState {
  assertRuntime(runtime, context);
  const triggered = resolveTriggerPhase(runtime, context);
  const moved = resolveMotionPhase(triggered, context);
  const collided = collectCombatEvents(moved, context);
  const impacted = resolveImpactPhase(collided, context);
  const emitted = resolveEmissionPhase(impacted, context);
  const updated = resolveAreaPhase(emitted, context);
  const resolved = resolveKillAndCleanupPhase(updated, context);
  assertRuntime(resolved, context);
  return resolved;
}
