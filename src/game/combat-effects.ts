import type { CombatBuild, EmissionRule, MotionRule } from "./combat-build";
import {
  recordDamage,
  recordKill,
  recordProjectile,
  recordProjectileOutcome,
  retainTargetMetrics,
  type DamageEvent,
  type Metrics,
} from "./metrics";
import {
  buildGenerationOneEmission,
  materializeEmission,
  resolveImpactRules,
  sortPendingEmissions,
  type EmittedEffectRecord,
  type KillContext,
  type PendingEmission,
  type TargetEffects,
} from "./emissions";
import {
  buildTeslaLinks,
  splitProjectile,
  synchronizeSpiralState,
  type ProjectileSpec,
  type ProjectileState,
  type PendingEffectToken,
  type TeslaLink,
} from "./projectiles";
import { applyMotionRules, type MotionDistanceEffect, type MotionLeg } from "./motions";
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
  segmentIndex?: number;
  segmentTime?: number;
  leg?: MotionLeg;
  damage?: number;
  radius?: number;
  distanceEffect?: "shotgun" | MotionDistanceEffect;
}>;

export type { KillContext, PendingEmission } from "./emissions";

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
  effects?: TargetEffects;
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
  relayLedger?: Readonly<Record<string, Readonly<{ rootTriggerId: string }>>>;
  emittedEffects?: Readonly<Record<string, EmittedEffectRecord>>;
  pendingEffectTokens?: readonly PendingEffectToken[];
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
  index: number;
  from: Point;
  to: Point;
  distance: number;
  startTime: number;
  endTime: number;
  liveDuration: number;
  expiresAfterMove: boolean;
  startTravelled: number;
  endTravelled: number;
  startRadius: number;
  endRadius: number;
  startDamage: number;
  endDamage: number;
  leg: MotionLeg;
  distanceEffect?: MotionDistanceEffect;
  startSpiralAngle?: number;
  endSpiralAngle?: number;
}>;

type EmissionRequest = Readonly<{
  projectile: ProjectileState;
  rule: EmissionRule;
  specs?: readonly ProjectileSpec[];
  origin?: Point;
  pendingTokens?: readonly Readonly<{ effectId: string; distance: number }>[];
  soulTargetIds?: readonly (string | undefined)[];
}>;

type CombatPhaseState = CombatRuntime & Readonly<{
  segments: readonly SweptSegment[];
  events: readonly CombatEvent[];
  emissionRequests: readonly EmissionRequest[];
  teslaLinks: readonly TeslaLink[];
  teslaCooldowns: Readonly<Record<string, number>>;
  killContexts: readonly KillContext[];
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
const EPSILON = 1e-10;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
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
  emittedEffectIds: [...projectile.emittedEffectIds],
  pendingEffectTokens: projectile.pendingEffectTokens && [...projectile.pendingEffectTokens],
  behaviors: Object.freeze(Object.fromEntries(Object.entries(projectile.behaviors).map(([key, value]) => [
    key,
    value && typeof value === "object" ? { ...value } : value,
  ]))),
  penetration: projectile.penetration && { ...projectile.penetration },
  hitTargetIds: [...projectile.hitTargetIds],
  outboundHitTargetIds: projectile.outboundHitTargetIds && [...projectile.outboundHitTargetIds],
  returnHitTargetIds: projectile.returnHitTargetIds && [...projectile.returnHitTargetIds],
  motionRules: projectile.motionRules && [...projectile.motionRules],
  splitOrigin: projectile.splitOrigin,
  spiralOrigin: projectile.spiralOrigin,
  bellPulse: projectile.bellPulse && { ...projectile.bellPulse },
});

const immutableProjectileSnapshot = (projectile: ProjectileState): ProjectileState => {
  const snapshot = cloneProjectile(projectile);
  snapshot.activatedEffectIds = Object.freeze([...snapshot.activatedEffectIds]);
  snapshot.emittedEffectIds = Object.freeze([...snapshot.emittedEffectIds]);
  snapshot.hitTargetIds = Object.freeze([...snapshot.hitTargetIds]) as unknown as string[];
  snapshot.outboundHitTargetIds = snapshot.outboundHitTargetIds
    && Object.freeze([...snapshot.outboundHitTargetIds]) as unknown as string[];
  snapshot.returnHitTargetIds = snapshot.returnHitTargetIds
    && Object.freeze([...snapshot.returnHitTargetIds]) as unknown as string[];
  snapshot.pendingEffectTokens = snapshot.pendingEffectTokens && Object.freeze([...snapshot.pendingEffectTokens]);
  return Object.freeze(snapshot);
};

const cloneTarget = (target: CombatTargetState, now = -Infinity): CombatTargetState => {
  const hollowPoint = target.effects?.hollowPoint;
  return {
    ...target,
    effects: hollowPoint && hollowPoint.expiresAt > now ? {
      hollowPoint: Object.freeze({
        ...hollowPoint,
        reactiveEffectIds: Object.freeze([...hollowPoint.reactiveEffectIds]),
        sourceProjectile: immutableProjectileSnapshot(hollowPoint.sourceProjectile),
      }),
    } : {},
  };
};

function phaseState(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const previous = runtime as Partial<CombatPhaseState>;
  return {
    ...runtime,
    segments: previous.segments ?? [],
    events: previous.events ?? [],
    emissionRequests: previous.emissionRequests ?? [],
    teslaLinks: previous.teslaLinks ?? context.teslaLinks,
    teslaCooldowns: previous.teslaCooldowns ?? context.teslaCooldowns,
    relayLedger: runtime.relayLedger ?? {},
    emittedEffects: runtime.emittedEffects ?? {},
    pendingEffectTokens: runtime.pendingEffectTokens ?? [],
    killContexts: previous.killContexts ?? [],
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
    if (pending.templates && pending.templates.length !== pending.specs.length) throw new Error("pending emission child templates must match specs");
    if (pending.templates && new Set(pending.templates.map(({ id }) => id)).size !== pending.templates.length) {
      throw new Error("pending emission child IDs must be unique");
    }
  }
  const liveAndPendingIds = new Set(runtime.projectiles.map(({ id }) => id));
  for (const pending of runtime.pendingEmissions) for (const template of pending.templates ?? []) {
    if (liveAndPendingIds.has(template.id)) throw new Error("pending emission child IDs must be globally unique");
    liveAndPendingIds.add(template.id);
  }
  const descendantsByRoot = new Map<string, number>();
  const countDescendants = (rootTriggerId: string, count: number) =>
    descendantsByRoot.set(rootTriggerId, (descendantsByRoot.get(rootTriggerId) ?? 0) + count);
  for (const projectile of runtime.projectiles) if (projectile.generation === 1) countDescendants(projectile.rootTriggerId, 1);
  for (const scheduled of runtime.scheduledProjectiles) if (scheduled.generation === 1) countDescendants(scheduled.rootTriggerId, 1);
  for (const pending of runtime.pendingEmissions) countDescendants(pending.rootTriggerId, pending.specs.length);
  if ([...descendantsByRoot.values()].some((count) => count > 384)) {
    throw new Error("generation-one descendant bound exceeds 384 for one root");
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
    motionPhase: projectile.haloPhase,
  });
}

export function queueEmission(
  projectile: ProjectileState,
  rule: EmissionRule,
  options: Readonly<{
    step: number;
    nextIds: readonly string[];
    emissionEffectIds?: readonly string[];
    pendingTokens?: readonly Readonly<{ effectId: string; distance: number }>[];
  }> = { step: 0, nextIds: [] },
): PendingEmission {
  if (projectile.generation === 1) throw new Error("generation-one projectile cannot emit");
  if (rule.kind !== "splitCone" || !projectile.behaviors.split) throw new Error("projectile has no compatible emission");
  const ids = options.nextIds.length > 0
    ? options.nextIds
    : Array.from({ length: rule.count }, (_, index) => `${projectile.id}:emission-${index}`);
  const templates = splitProjectile(cloneProjectile(projectile), ids).map((child) => Object.freeze(cloneProjectile({
    ...child,
    bellPulse: undefined,
  })));
  return buildGenerationOneEmission(projectile, rule, templates.map(projectileSpec), options.step, {
    childIds: ids,
    emissionEffectIds: options.emissionEffectIds,
    templates,
    pendingTokens: options.pendingTokens,
  });
}

function materializeScheduled(
  scheduled: ScheduledProjectile,
  context: CombatContext,
  now: number,
  id: string,
  childIndex = 0,
  childCount = 1,
): ProjectileState {
  const { spec } = scheduled;
  const aimAngle = scheduled.aim ?? spec.heading;
  const origin = scheduled.origin ?? context.player;
  const muzzle = {
    x: origin.x + Math.cos(aimAngle) * (context.player.radius + spec.radius + 2),
    y: origin.y + Math.sin(aimAngle) * (context.player.radius + spec.radius + 2),
  };
  const spiral = spec.behaviors.spiral;
  const motionPhase = scheduled.generation === 0
    ? 2 * Math.PI * childIndex / Math.max(1, childCount)
    : spec.motionPhase ?? spec.heading;
  const spiralOrigin = spiral ? Object.freeze({ ...muzzle }) : undefined;
  const spiralRadius = spiral?.initialRadius;
  const spiralAngle = spiral ? motionPhase : undefined;
  const motionRules = context.build.motions.filter((rule) =>
    scheduled.effectIds.includes(rule.effectId) || (rule.kind === "converge" && spec.behaviors.converge !== undefined));
  const converge = spec.behaviors.converge ? {
    side: (spec.behaviors.converge.lateralOffset < 0 ? -1 : 1) as -1 | 1,
    distance: spec.behaviors.converge.distance,
  } : undefined;
  return {
    id,
    triggerId: scheduled.rootTriggerId,
    generation: scheduled.generation,
    rootTriggerId: scheduled.rootTriggerId,
    lineageId: scheduled.lineageId,
    localOrdinal: scheduled.localOrdinal,
    activatedEffectIds: [...scheduled.effectIds],
    emittedEffectIds: [],
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
    baseHeading: spec.heading,
    converge,
    convergeDone: false,
    haloPhase: spiral ? motionPhase : undefined,
    childIndex,
    childCount,
    wavePhase: scheduled.generation === 0 ? 0 : 2 * Math.PI * childIndex / Math.max(1, childCount),
    waveDistance: 0,
    returnLeg: "outbound",
    legTravelled: 0,
    outboundHitTargetIds: [],
    returnHitTargetIds: [],
    motionRules,
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
    projectiles: materializeEmission(pending as Parameters<typeof materializeEmission>[0], now),
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
      emittedEffectIds: [],
    };
  });
  return { projectiles, nextId: id };
}

export function resolveTriggerPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  assertRuntime(runtime, context);
  const scheduled = [...runtime.scheduledProjectiles].sort(compareScheduledProjectiles);
  const dueSchedules = scheduled.filter(({ at }) => at <= runtime.now);
  const futureSchedules = scheduled.filter(({ at }) => at > runtime.now);
  const pending = sortPendingEmissions(runtime.pendingEmissions);
  const duePending = pending.filter(({ atStep }) => atStep <= runtime.step);
  const futurePending = pending.filter(({ atStep }) => atStep > runtime.step);
  let nextId = runtime.nextId;
  const created = dueSchedules.map((scheduledProjectile) => {
    const siblings = dueSchedules.filter((candidate) => candidate.rootTriggerId === scheduledProjectile.rootTriggerId
      && candidate.at === scheduledProjectile.at && candidate.generation === scheduledProjectile.generation);
    const childIndex = siblings.findIndex((candidate) => candidate === scheduledProjectile);
    return materializeScheduled(scheduledProjectile, context, runtime.now, `projectile-${nextId++}`, childIndex, siblings.length);
  });
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
    targets: runtime.targets.map((target) => cloneTarget(target)),
    scheduledProjectiles: futureSchedules,
    pendingEmissions: futurePending,
    metrics,
    nextId,
    segments: [],
    events: [],
    emissionRequests: [],
    killContexts: [],
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
    const motionNow = current.now - context.dt + liveDuration;
    const result = applyMotionRules(projectile, context.trajectoryTargets ?? current.targets, liveDuration, motionNow);
    const timeScale = context.dt === 0 ? 1 : liveDuration / context.dt;
    result.path.forEach((path, index) => segments.push({
      projectileId: projectile.id,
      index,
      from: path.from,
      to: path.to,
      distance: path.endDistance - path.startDistance,
      startTime: path.startTime * timeScale,
      endTime: path.endTime * timeScale,
      liveDuration,
      expiresAfterMove: index === result.path.length - 1
        && (current.now - projectile.bornAt >= projectile.lifetime || result.expired),
      startTravelled: path.startDistance,
      endTravelled: path.endDistance,
      startRadius: path.startRadius,
      endRadius: path.endRadius,
      startDamage: path.startDamage,
      endDamage: path.endDamage,
      leg: path.leg,
      distanceEffect: path.distanceEffect,
      startSpiralAngle: path.startSpiralAngle,
      endSpiralAngle: path.endSpiralAngle,
    }));
    return result.projectile;
  });
  return { ...current, projectiles, segments, events: [], emissionRequests: [] };
}

type WallHit = Readonly<{ time: number; normal: Point }>;

function firstWallHit(from: Point, to: Point, startRadius: number, endRadius: number, room: RoomGeometry): WallHit | undefined {
  const hits: Readonly<{ time: number; normal: Point }>[] = [];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dr = endRadius - startRadius;
  if (to.x - endRadius < room.minX) hits.push({ time: (room.minX + startRadius - from.x) / (dx - dr), normal: { x: 1, y: 0 } });
  else if (to.x + endRadius > room.maxX) hits.push({ time: (room.maxX - startRadius - from.x) / (dx + dr), normal: { x: -1, y: 0 } });
  if (to.y - endRadius < room.minY) hits.push({ time: (room.minY + startRadius - from.y) / (dy - dr), normal: { x: 0, y: 1 } });
  else if (to.y + endRadius > room.maxY) hits.push({ time: (room.maxY - startRadius - from.y) / (dy + dr), normal: { x: 0, y: -1 } });
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

function growingCircleHit(
  segment: SweptSegment,
  projectile: ProjectileState,
  collider: Readonly<Point & { id: string; radius: number }>,
) {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const ox = segment.from.x - collider.x;
  const oy = segment.from.y - collider.y;
  const startRadius = segment.startRadius + collider.radius;
  const radiusDelta = segment.endRadius - segment.startRadius;
  const a = dx * dx + dy * dy - radiusDelta * radiusDelta;
  const b = 2 * (ox * dx + oy * dy - startRadius * radiusDelta);
  const c = ox * ox + oy * oy - startRadius * startRadius;
  let time: number | null = null;
  if (c <= 0) time = 0;
  else if (Math.abs(a) <= Number.EPSILON) {
    const candidate = b === 0 ? -1 : -c / b;
    if (candidate >= 0 && candidate <= 1) time = candidate;
  } else {
    const discriminant = b * b - 4 * a * c;
    const tolerance = Number.EPSILON * 128 * Math.max(1, b * b, Math.abs(4 * a * c));
    if (discriminant >= -tolerance) {
      const root = Math.sqrt(Math.max(0, discriminant));
      const roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
        .filter((candidate) => candidate >= -EPSILON && candidate <= 1 + EPSILON)
        .map((candidate) => clamp(candidate, 0, 1))
        .sort((first, second) => first - second);
      time = roots[0] ?? null;
    }
  }
  if (time === null) return null;
  const point = pointAt(segment, time);
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
  return { colliderId: collider.id, eventTime: time, point, normal: { x: nx, y: ny } };
}

export function collectCombatEvents(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  const projectileById = new Map(current.projectiles.map((projectile) => [projectile.id, projectile]));
  const events: CombatEvent[] = [];
  for (const segment of current.segments) {
    const projectile = projectileById.get(segment.projectileId);
    if (!projectile) continue;
    const path = { from: { ...segment.from }, to: { ...segment.to } };
    const fullTime = (local: number) => segment.startTime + (segment.endTime - segment.startTime) * local;
    const eventFields = (local: number) => ({
      eventTime: fullTime(local),
      segmentTime: local,
      segmentIndex: segment.index,
      leg: segment.leg,
      radius: segment.startRadius + (segment.endRadius - segment.startRadius) * local,
      damage: segment.startDamage + (segment.endDamage - segment.startDamage) * local,
    });
    if (segment.expiresAfterMove && segment.liveDuration === 0) {
      events.push({ ...eventFields(0), kind: "lifetime", projectileId: projectile.id, point: { ...segment.from }, segment: path });
      continue;
    }
    if (!projectile.penetration?.obstacles) {
      for (const prop of context.props) {
        const hit = growingCircleHit(segment, projectile, {
          id: prop.id, x: prop.x, y: prop.y, radius: prop.collisionRadius,
        });
        if (!hit || (segment.index > 0 && hit.eventTime <= EPSILON)) continue;
        events.push({
          ...eventFields(hit.eventTime),
          kind: "prop",
          projectileId: projectile.id,
          colliderId: hit.colliderId,
          point: hit.point,
          normal: hit.normal,
          segment: path,
        });
      }
    }
    const wall = firstWallHit(segment.from, segment.to, segment.startRadius, segment.endRadius, context.room);
    if (wall) events.push({
      ...eventFields(wall.time),
      kind: "wall",
      projectileId: projectile.id,
      colliderId: "room",
      point: pointAt(segment, wall.time),
      normal: wall.normal,
      segment: path,
    });
    for (const target of current.targets) {
      const history = segment.leg === "return"
        ? projectile.returnHitTargetIds ?? []
        : projectile.outboundHitTargetIds ?? projectile.hitTargetIds;
      if (target.health <= 0 || history.includes(target.id)) continue;
      const hit = growingCircleHit(segment, projectile, target);
      if (!hit || (segment.index > 0 && hit.eventTime <= EPSILON)) continue;
      events.push({
        ...eventFields(hit.eventTime),
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
      if (remaining >= -EPSILON && remaining <= segment.distance + EPSILON) {
        const time = segment.distance === 0 ? 0 : Math.max(0, remaining / segment.distance);
        events.push({ ...eventFields(time), kind: "distance", distanceEffect: "shotgun", projectileId: projectile.id, point: pointAt(segment, time), segment: path });
      }
    }
    if (segment.distanceEffect) events.push({
      ...eventFields(1),
      kind: "distance",
      distanceEffect: segment.distanceEffect,
      projectileId: projectile.id,
      point: { ...segment.to },
      segment: path,
    });
    if (projectile.maxTravel !== undefined) {
      const remaining = projectile.maxTravel - segment.startTravelled;
      if (remaining >= -EPSILON && remaining <= segment.distance + EPSILON) {
        const time = segment.distance === 0 ? 0 : Math.max(0, remaining / segment.distance);
        events.push({ ...eventFields(time), kind: "range", projectileId: projectile.id, point: pointAt(segment, time), segment: path });
      }
    }
    if (segment.expiresAfterMove) events.push({
      ...eventFields(1),
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
  projectile.reflected = true;
  if (projectile.behaviors.spiral) {
    const { spiral: _, ...behaviors } = projectile.behaviors;
    projectile.behaviors = Object.freeze(behaviors);
    projectile.spiralOrigin = undefined;
    projectile.spiralRadius = undefined;
    projectile.spiralAngle = undefined;
    projectile.spiralAngularSpeed = undefined;
    projectile.spiralLaunchPending = undefined;
  }
  if (projectile.motionRules?.some(({ kind }) => kind === "spiral")) {
    projectile.motionRules = projectile.motionRules.filter(({ kind }) => kind !== "spiral");
  }
}

function synchronizeImpactSpiral(projectile: ProjectileState, segment: SweptSegment, eventTime: number): void {
  if (segment.startSpiralAngle === undefined || segment.endSpiralAngle === undefined || projectile.spiralAngle === undefined) return;
  const reference = segment.startSpiralAngle + (segment.endSpiralAngle - segment.startSpiralAngle) * eventTime;
  synchronizeSpiralState(projectile, reference);
}

const lineageEmissionKey = (effectId: string, lineageId: string): string => `lineage\0${effectId}\0${lineageId}`;
const rootEmissionKey = (effectId: string, rootTriggerId: string): string => `root\0${effectId}\0${rootTriggerId}`;

function emissionSpecs(source: ProjectileState, rule: EmissionRule, headings: readonly number[]): ProjectileSpec[] {
  const damageScale = "damageScale" in rule ? rule.damageScale : 1;
  const radiusScale = "radiusScale" in rule ? rule.radiusScale : 1;
  const { split: _, ...behaviors } = source.behaviors;
  return headings.map((heading) => ({
    triggerId: source.rootTriggerId,
    heading,
    damage: source.damage * damageScale,
    speed: source.speed,
    radius: source.radius * radiusScale,
    lifetime: source.lifetime,
    freezeChance: source.freezeChance,
    freezeDuration: source.freezeDuration,
    bounces: source.remainingBounces,
    bounceRetention: source.bounceRetention,
    behaviors: Object.freeze(behaviors),
    motionPhase: source.haloPhase,
  }));
}

function headingsFor(source: ProjectileState, rule: EmissionRule): number[] {
  const heading = Math.atan2(source.vy, source.vx);
  if (rule.kind === "forwardShards") return [-rule.angle, 0, rule.angle].map((offset) => heading + offset);
  if (rule.kind === "expiryRadial") return Array.from({ length: rule.count }, (_, index) => heading + 2 * Math.PI * index / rule.count);
  if (rule.kind === "tangentCopy") {
    const direction = source.localOrdinal % 2 === 0 ? rule.angle : -rule.angle;
    return [Math.atan2(Math.sin(heading + direction), Math.cos(heading + direction))];
  }
  return [];
}

function captureKillContext(
  target: CombatTargetState,
  healthBefore: number,
  event: DamageEvent,
  projectile?: ProjectileState,
): KillContext | undefined {
  if (target.immortal || healthBefore <= 0 || target.health > 0) return undefined;
  const sourceProjectile = projectile && immutableProjectileSnapshot(projectile);
  return Object.freeze({
    victimId: target.id,
    x: target.x,
    y: target.y,
    source: event.source,
    generation: event.generation ?? projectile?.generation ?? 0,
    reactiveEffectIds: Object.freeze([...(event.reactiveEffectIds ?? projectile?.activatedEffectIds ?? [])]),
    artifactId: event.artifactId,
    effectId: event.effectId,
    rootTriggerId: event.rootTriggerId,
    lineageId: event.lineageId,
    projectileId: event.projectileId,
    originPower: event.originPower,
    killReactionDepth: event.killReactionDepth,
    sourceProjectile: sourceProjectile && Object.freeze(sourceProjectile),
  });
}

function directProvenance(projectile: ProjectileState): Readonly<{ artifactId: string; effectId: string }> {
  return projectile.generation === 1 && projectile.emission
    ? projectile.emission
    : { artifactId: "baseRevolver", effectId: "baseRevolver.direct" };
}

export function resolveImpactPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  const projectiles = current.projectiles.map(cloneProjectile);
  const finalProjectiles = new Map(projectiles.map((projectile) => [projectile.id, cloneProjectile(projectile)]));
  const projectileById = new Map(projectiles.map((projectile) => [projectile.id, projectile]));
  const targets = current.targets.map((target) => cloneTarget(target));
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const segmentByKey = new Map(current.segments.map((segment) => [`${segment.projectileId}\0${segment.index}`, segment]));
  const removed = new Set<string>();
  const settled = new Set<string>();
  const emissionRequests: EmissionRequest[] = [];
  const vfxCommands = [...current.vfxCommands];
  const relayLedger = { ...(current.relayLedger ?? {}) };
  const emittedEffects = { ...(current.emittedEffects ?? {}) };
  const pendingEffectTokens = [...(current.pendingEffectTokens ?? [])];
  const killContexts = [...current.killContexts];
  let nextId = current.nextId;
  let metrics = current.metrics;

  const queueNaturalExpiry = (projectile: ProjectileState, point: Point): void => {
    for (const rule of resolveImpactRules({ source: projectile, build: context.build, kind: "range" }).emissions) {
      const key = lineageEmissionKey(rule.effectId, projectile.lineageId);
      if (emittedEffects[key] || rule.kind !== "expiryRadial") continue;
      const source = cloneProjectile(projectile);
      emissionRequests.push({ projectile: source, rule, specs: emissionSpecs(source, rule, headingsFor(source, rule)), origin: point });
      projectile.emittedEffectIds = [...projectile.emittedEffectIds, rule.effectId];
      emittedEffects[key] = { rootTriggerId: projectile.rootTriggerId, lineageId: projectile.lineageId };
    }
  };

  for (const event of current.events) {
    if (removed.has(event.projectileId) || settled.has(event.projectileId)) continue;
    const projectile = projectileById.get(event.projectileId);
    const segment = segmentByKey.get(`${event.projectileId}\0${event.segmentIndex ?? 0}`)
      ?? current.segments.find(({ projectileId }) => projectileId === event.projectileId);
    if (!projectile || !segment) continue;
    if (event.kind === "target") {
      const target = targetById.get(event.targetId!);
      if (!target || (!target.immortal && target.health <= 0)) continue;
      const history = event.leg === "return"
        ? projectile.returnHitTargetIds ?? []
        : projectile.outboundHitTargetIds ?? projectile.hitTargetIds;
      if (history.includes(target.id)) continue;
    }

    const localTime = event.segmentTime ?? (segment.endTime === segment.startTime
      ? 0
      : clamp((event.eventTime - segment.startTime) / (segment.endTime - segment.startTime), 0, 1));
    projectile.x = event.point.x;
    projectile.y = event.point.y;
    projectile.travelled = segment.startTravelled + segment.distance * localTime;
    projectile.radius = event.radius ?? segment.startRadius + (segment.endRadius - segment.startRadius) * localTime;
    projectile.damage = event.damage ?? segment.startDamage + (segment.endDamage - segment.startDamage) * localTime;
    const segmentDuration = (segment.endTime - segment.startTime) * context.dt;
    if (segmentDuration > 0) {
      projectile.vx = (segment.to.x - segment.from.x) / segmentDuration;
      projectile.vy = (segment.to.y - segment.from.y) / segmentDuration;
    }
    const comet = projectile.motionRules?.find((rule): rule is Extract<MotionRule, { kind: "comet" }> => rule.kind === "comet")
      ?? projectile.behaviors.comet;
    if (comet) {
      const age = Math.max(0, current.now - context.dt + event.eventTime * context.dt - projectile.bornAt);
      const progress = clamp(age / comet.duration, 0, 1);
      const speedFactor = 1 + (comet.speedScale - 1) * progress;
      const priorSpeedFactor = projectile.cometSpeedFactor ?? speedFactor;
      projectile.speed *= speedFactor / priorSpeedFactor;
      const velocity = Math.hypot(projectile.vx, projectile.vy);
      if (velocity > 0) {
        projectile.vx = projectile.vx / velocity * projectile.speed;
        projectile.vy = projectile.vy / velocity * projectile.speed;
      }
      projectile.cometSpeedFactor = speedFactor;
      projectile.cometRadiusFactor = 1 + (comet.radiusScale - 1) * progress;
      projectile.cometDamageFactor = 1 + (comet.damageScale - 1) * progress;
    }
    if (event.kind !== "target" || !projectile.penetration?.targets) {
      synchronizeImpactSpiral(projectile, segment, localTime);
    }

    if (event.kind === "distance") {
      if (event.distanceEffect === "undertakersReturn") continue;
      if (event.distanceEffect === "return-expire") {
        queueNaturalExpiry(projectile, event.point);
        metrics = recordProjectileOutcome(metrics, projectile.everHit);
        removed.add(projectile.id);
        continue;
      }
      for (const rule of resolveImpactRules({ source: projectile, build: context.build, kind: "shotgun" }).emissions) {
        const key = lineageEmissionKey(rule.effectId, projectile.lineageId);
        if (emittedEffects[key]) continue;
        const source = cloneProjectile(projectile);
        const pendingTokens: readonly PendingEffectToken[] | undefined = rule.kind === "splitCone"
          && projectile.activatedEffectIds.includes("dustlineDuel.threshold")
          && projectile.activatedEffectIds.includes("dustlineDuel.afterimage")
          ? [Object.freeze({
            effectId: "dustlineDuel.afterimage",
            distance: 32,
            rootTriggerId: projectile.rootTriggerId,
            lineageId: projectile.lineageId,
            originPower: projectile.originPower,
            x: event.point.x,
            y: event.point.y,
            heading: Math.atan2(projectile.vy, projectile.vx),
            damage: projectile.damage,
            radius: projectile.radius,
            speed: projectile.speed,
          })]
          : undefined;
        emissionRequests.push({
          projectile: source,
          rule,
          specs: rule.kind === "expiryRadial" ? emissionSpecs(source, rule, headingsFor(source, rule)) : undefined,
          origin: event.point,
          pendingTokens,
        });
        projectile.emittedEffectIds = [...projectile.emittedEffectIds, rule.effectId];
        emittedEffects[key] = { rootTriggerId: projectile.rootTriggerId, lineageId: projectile.lineageId };
        if (rule.kind === "splitCone" && pendingTokens) pendingEffectTokens.push(...pendingTokens);
      }
      metrics = recordProjectileOutcome(metrics, projectile.everHit);
      removed.add(projectile.id);
      continue;
    }
    if (event.kind === "range" || event.kind === "lifetime") {
      queueNaturalExpiry(projectile, event.point);
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
          const separation = prop.collisionRadius + (event.radius ?? projectile.radius) + 0.01;
          projectile.x = prop.x + event.normal!.x / normalLength * separation;
          projectile.y = prop.y + event.normal!.y / normalLength * separation;
        }
        reflect(projectile, event.normal!);
        const relay = projectile.motionRules?.find((rule): rule is Extract<MotionRule, { kind: "relay" }> => rule.kind === "relay")
          ?? projectile.behaviors.relay;
        if (relay && !relayLedger[projectile.lineageId]) {
          relayLedger[projectile.lineageId] = { rootTriggerId: projectile.rootTriggerId };
          projectile.speed = Math.hypot(projectile.vx, projectile.vy) * relay.speedScale;
          projectile.vx *= relay.speedScale;
          projectile.vy *= relay.speedScale;
          projectile.relayTargetId = targets
            .filter((target) => target.health > 0 && Math.hypot(target.x - event.point.x, target.y - event.point.y) <= relay.radius)
            .sort((a, b) => Math.hypot(a.x - event.point.x, a.y - event.point.y)
              - Math.hypot(b.x - event.point.x, b.y - event.point.y) || a.id.localeCompare(b.id))[0]?.id;
          vfxCommands.push({
            id: `vfx-${nextId++}`,
            kind: "pinball.relay",
            artifactId: "pinball",
            bornAt: current.now,
            expiresAt: current.now + 0.18,
            x: event.point.x,
            y: event.point.y,
            targetId: projectile.relayTargetId,
          });
        }
        for (const rule of resolveImpactRules({ source: projectile, build: context.build, kind: "bounce" }).emissions) {
          const key = lineageEmissionKey(rule.effectId, projectile.lineageId);
          if (emittedEffects[key] || rule.kind !== "tangentCopy") continue;
          const source = cloneProjectile(projectile);
          emissionRequests.push({ projectile: source, rule, specs: emissionSpecs(source, rule, headingsFor(source, rule)), origin: event.point });
          projectile.emittedEffectIds = [...projectile.emittedEffectIds, rule.effectId];
          emittedEffects[key] = { rootTriggerId: projectile.rootTriggerId, lineageId: projectile.lineageId };
        }
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
    const history = event.leg === "return"
      ? projectile.returnHitTargetIds ?? (projectile.returnHitTargetIds = [])
      : projectile.outboundHitTargetIds ?? (projectile.outboundHitTargetIds = []);
    history.push(target.id);
    projectile.hitTargetIds = history;
    const healthBefore = target.health;
    const originPower = projectile.damage;
    projectile.originPower = originPower;
    if (!target.immortal) (target as { health: number }).health -= projectile.damage;
    if (projectile.freezeChance > 0 && context.rng() < projectile.freezeChance) {
      (target as { frozenUntil: number }).frozenUntil = Math.max(target.frozenUntil, current.now + projectile.freezeDuration);
    }
    const provenance = directProvenance(projectile);
    const damageEvent: DamageEvent = {
      source: "direct",
      damage: projectile.damage,
      time: current.now - context.dt + event.eventTime * context.dt,
      targetId: target.id,
      ...provenance,
      rootTriggerId: projectile.rootTriggerId,
      lineageId: projectile.lineageId,
      projectileId: projectile.id,
      killReactionDepth: 0,
      originPower,
      generation: projectile.generation,
      reactiveEffectIds: projectile.activatedEffectIds,
      firstProjectileHit: firstHit,
      x: target.x,
      y: target.y,
    };
    metrics = recordDamage(metrics, damageEvent);
    const directKill = captureKillContext(target, healthBefore, damageEvent, projectile);
    if (directKill) {
      killContexts.push(directKill);
      metrics = recordKill(metrics, target.id);
    }

    let charge = target.effects?.hollowPoint;
    if (charge && charge.expiresAt <= damageEvent.time) {
      (target as { effects: TargetEffects }).effects = {};
      charge = undefined;
    }
    if (charge) {
      (target as { effects: TargetEffects }).effects = {};
      for (const nearby of targets) {
        if ((!nearby.immortal && nearby.health <= 0)
          || (nearby.x - target.x) ** 2 + (nearby.y - target.y) ** 2 > 64 ** 2) continue;
        const beforeExplosion = nearby.health;
        if (!nearby.immortal) (nearby as { health: number }).health -= charge.damage;
        const explosionEvent: DamageEvent = {
          source: "area",
          damage: charge.damage,
          time: damageEvent.time,
          targetId: nearby.id,
          artifactId: "hollowPoint",
          effectId: "hollowPoint.explosion",
          rootTriggerId: charge.rootTriggerId,
          lineageId: charge.lineageId,
          projectileId: charge.projectileId,
          killReactionDepth: 0,
          originPower: charge.originPower,
          generation: charge.generation,
          reactiveEffectIds: charge.reactiveEffectIds,
          x: nearby.x,
          y: nearby.y,
        };
        metrics = recordDamage(metrics, explosionEvent);
        const explosionKill = captureKillContext(nearby, beforeExplosion, explosionEvent, charge.sourceProjectile);
        if (explosionKill) {
          killContexts.push(explosionKill);
          metrics = recordKill(metrics, nearby.id);
        }
      }
    } else {
      const hollow = context.build.impacts.find((rule) => rule.kind === "embeddedCharge"
        && projectile.activatedEffectIds.includes(rule.effectId));
      if (hollow?.kind === "embeddedCharge" && (target.immortal || target.health > 0)) {
        (target as { effects: TargetEffects }).effects = {
          hollowPoint: Object.freeze({
            damage: originPower * hollow.storedDamageScale,
            expiresAt: damageEvent.time + hollow.duration,
            rootTriggerId: projectile.rootTriggerId,
            lineageId: projectile.lineageId,
            projectileId: projectile.id,
            originPower,
            generation: projectile.generation,
            reactiveEffectIds: Object.freeze([...projectile.activatedEffectIds]),
            sourceProjectile: immutableProjectileSnapshot(projectile),
          }),
        };
      }
    }

    for (const rule of resolveImpactRules({ source: projectile, build: context.build, kind: "direct" }).emissions) {
      const key = lineageEmissionKey(rule.effectId, projectile.lineageId);
      if (emittedEffects[key] || rule.kind !== "forwardShards") continue;
      const source = cloneProjectile(projectile);
      emissionRequests.push({ projectile: source, rule, specs: emissionSpecs(source, rule, headingsFor(source, rule)), origin: event.point });
      projectile.emittedEffectIds = [...projectile.emittedEffectIds, rule.effectId];
      emittedEffects[key] = { rootTriggerId: projectile.rootTriggerId, lineageId: projectile.lineageId };
    }
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
    const final = finalProjectiles.get(projectile.id);
    if (!final) continue;
    const outboundHitTargetIds = [...(projectile.outboundHitTargetIds ?? [])];
    const returnHitTargetIds = [...(projectile.returnHitTargetIds ?? [])];
    const everHit = projectile.everHit;
    const originPower = projectile.originPower;
    const emittedEffectIds = [...projectile.emittedEffectIds];
    Object.assign(projectile, cloneProjectile(final));
    projectile.outboundHitTargetIds = outboundHitTargetIds;
    projectile.returnHitTargetIds = returnHitTargetIds;
    projectile.hitTargetIds = projectile.returnLeg === "return" ? returnHitTargetIds : outboundHitTargetIds;
    projectile.everHit = everHit;
    projectile.originPower = originPower;
    projectile.emittedEffectIds = emittedEffectIds;
  }

  return {
    ...current,
    projectiles: projectiles.filter(({ id }) => !removed.has(id)),
    targets,
    metrics,
    emissionRequests,
    vfxCommands,
    relayLedger,
    emittedEffects,
    pendingEffectTokens,
    killContexts,
    nextId,
  };
}

export function resolveEmissionPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  let nextId = current.nextId;
  const pending = [...current.pendingEmissions];
  for (const request of current.emissionRequests) {
    const count = request.specs?.length ?? (request.rule.kind === "splitCone" ? request.rule.count : 0);
    const nextIds = Array.from({ length: count }, () => `projectile-${nextId++}`);
    pending.push(request.rule.kind === "splitCone"
      ? queueEmission(request.projectile, request.rule, {
        step: current.step,
        nextIds,
        emissionEffectIds: context.build.emissions.map(({ effectId }) => effectId),
        pendingTokens: request.pendingTokens,
      })
      : buildGenerationOneEmission(request.projectile, request.rule, request.specs ?? [], current.step, {
        childIds: nextIds,
        origin: request.origin,
        emissionEffectIds: context.build.emissions.map(({ effectId }) => effectId),
        pendingTokens: request.pendingTokens,
        soulTargetIds: request.soulTargetIds,
      }));
  }
  return { ...current, pendingEmissions: pending, nextId, emissionRequests: [] };
}

export function resolveAreaPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  const projectiles = current.projectiles.map(cloneProjectile);
  let targets = current.targets.map((target) => cloneTarget(target, current.now));
  const vfxCommands = [...current.vfxCommands];
  const killContexts = [...current.killContexts];
  let nextId = current.nextId;
  let metrics = current.metrics;
  for (const projectile of projectiles) {
    let pulse = projectile.bellPulse;
    while (pulse && pulse.remaining > 0 && pulse.nextAt <= current.now) {
      const pulseAt = pulse.nextAt;
      targets = targets.map((target) => {
        if ((!target.immortal && target.health <= 0) || Math.hypot(target.x - projectile.x, target.y - projectile.y) > pulse!.radius + target.radius) return target;
        const damage = projectile.damage * pulse!.damageScale;
        const healthBefore = target.health;
        const damaged = target.immortal ? target : { ...target, health: target.health - damage };
        const damageEvent: DamageEvent = {
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
          generation: projectile.generation,
          reactiveEffectIds: projectile.activatedEffectIds,
          x: target.x,
          y: target.y,
        };
        metrics = recordDamage(metrics, damageEvent);
        const killed = captureKillContext(damaged, healthBefore, damageEvent, projectile);
        if (killed) {
          killContexts.push(killed);
          metrics = recordKill(metrics, damaged.id);
        }
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
      const source = a.damage < b.damage || (a.damage === b.damage && compareString(a.id, b.id) < 0) ? a : b;
      const healthBefore = target.health;
      const damaged = target.immortal ? target : { ...target, health: target.health - damage };
      const damageEvent: DamageEvent = {
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
        originPower: source.damage,
        generation: source.generation,
        reactiveEffectIds: source.activatedEffectIds,
        x: target.x,
        y: target.y,
      };
      metrics = recordDamage(metrics, damageEvent);
      const killed = captureKillContext(damaged, healthBefore, damageEvent, source);
      if (killed) {
        killContexts.push(killed);
        metrics = recordKill(metrics, damaged.id);
      }
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
    killContexts,
  };
}

export function resolveKillAndCleanupPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  const targets = current.targets
    .filter((target) => target.immortal || target.health > 0)
    .map((target) => cloneTarget(target, current.now));
  const pendingEmissions = [...current.pendingEmissions];
  const emittedEffects = { ...(current.emittedEffects ?? {}) };
  let nextId = current.nextId;
  for (const killed of current.killContexts) {
    if (killed.generation !== 0 || killed.killReactionDepth !== 0 || !killed.sourceProjectile) continue;
    const rule = context.build.emissions.find((candidate) => candidate.kind === "killSpirits"
      && killed.reactiveEffectIds.includes(candidate.effectId));
    if (!rule || rule.kind !== "killSpirits") continue;
    const key = rootEmissionKey(rule.effectId, killed.rootTriggerId);
    if (emittedEffects[key]) continue;
    const source = cloneProjectile({
      ...killed.sourceProjectile,
      rootTriggerId: killed.rootTriggerId,
      lineageId: killed.lineageId ?? killed.sourceProjectile.lineageId,
      activatedEffectIds: killed.reactiveEffectIds,
      x: killed.x,
      y: killed.y,
      damage: killed.originPower,
      originPower: killed.originPower,
      emittedEffectIds: killed.sourceProjectile.emittedEffectIds.filter((effectId) => effectId !== rule.effectId),
    });
    const candidates = targets
      .filter((target) => target.id !== killed.victimId
        && (target.immortal || target.health > 0)
        && (target.x - killed.x) ** 2 + (target.y - killed.y) ** 2 <= rule.radius ** 2)
      .sort((a, b) => (a.x - killed.x) ** 2 + (a.y - killed.y) ** 2
        - ((b.x - killed.x) ** 2 + (b.y - killed.y) ** 2)
        || compareString(a.id, b.id));
    const selected = Array.from({ length: rule.count }, (_, index) => candidates[index]);
    const baseHeading = Math.atan2(source.vy, source.vx);
    const headings = selected.map((target, index) => target
      ? Math.atan2(target.y - killed.y, target.x - killed.x)
      : baseHeading + 2 * Math.PI * index / rule.count);
    const specs = emissionSpecs(source, rule, headings);
    const childIds = Array.from({ length: rule.count }, () => `projectile-${nextId++}`);
    pendingEmissions.push(buildGenerationOneEmission(source, rule, specs, current.step, {
      childIds,
      origin: killed,
      emissionEffectIds: context.build.emissions.map(({ effectId }) => effectId),
      soulTargetIds: selected.map((target) => target?.id),
    }));
    emittedEffects[key] = { rootTriggerId: killed.rootTriggerId };
  }
  const activeRoots = new Set([
    ...current.projectiles.map(({ rootTriggerId }) => rootTriggerId),
    ...current.scheduledProjectiles.map(({ rootTriggerId }) => rootTriggerId),
    ...pendingEmissions.map(({ rootTriggerId }) => rootTriggerId),
    ...current.areas.map(({ rootTriggerId }) => rootTriggerId),
    ...targets.flatMap(({ effects }) => effects?.hollowPoint ? [effects.hollowPoint.rootTriggerId] : []),
  ]);
  return {
    ...current,
    targets,
    pendingEmissions,
    areas: current.areas.filter(({ expiresAt }) => expiresAt > current.now),
    vfxCommands: current.vfxCommands.filter(({ expiresAt }) => expiresAt > current.now),
    metrics: retainTargetMetrics(current.metrics, targets.map(({ id }) => id)),
    events: [],
    segments: [],
    emissionRequests: [],
    killContexts: [],
    nextId,
    emittedEffects: Object.fromEntries(Object.entries(emittedEffects)
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    pendingEffectTokens: (current.pendingEffectTokens ?? [])
      .filter(({ rootTriggerId }) => rootTriggerId === undefined || activeRoots.has(rootTriggerId)),
    relayLedger: Object.fromEntries(Object.entries(current.relayLedger ?? {})
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
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
