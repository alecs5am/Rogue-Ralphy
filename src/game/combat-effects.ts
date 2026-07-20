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
import {
  buildSpatialCandidates,
  canonicalPair,
  crossingOf,
  type BigIronPairHit,
  type CrossfireParticipation,
  type CrossfirePulseState,
  type DescendantRecord,
  type WakeTrailState,
} from "./areas";
import {
  advanceStatuses,
  applyDirectStatuses,
  jumpWantedBrand,
  normalizeTargetEffects,
  statusRootIds,
  type BurnStatus,
  type RootStatusRecord,
  type SnareAreaState,
  type StatusVfxRequest,
  type StatusTarget,
  type TargetEffects,
  type WantedBrand,
} from "./statuses";
import { queueBonanzaRefunds, sortPendingRefunds, type PendingRefund } from "./reactive";
import type { CylinderState } from "./cylinder";

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
  distanceEffect?: "shotgun" | "dustline" | MotionDistanceEffect;
}>;

export class DescendantOverflowError extends Error {
  override name = "DescendantOverflowError";

  constructor(rootTriggerId: string, limit: number) {
    super(`generation-one descendant overflow: ${rootTriggerId} exceeds ${limit} (generation-one descendant bound)`);
  }
}

export type { KillContext, PendingEmission } from "./emissions";

type GenericAreaState = Readonly<{
  id: string;
  effectId: string;
  artifactId: string;
  rootTriggerId: string;
  instanceKey: string;
  bornAt: number;
  expiresAt: number;
  tickInterval: number;
}>;

export type AreaState = GenericAreaState | SnareAreaState;

type VfxCommandBase = Readonly<{
  id: string;
  artifactId: string;
  effectId: string;
  rootTriggerId: string;
  lineageId?: string;
  bornAt: number;
  expiresAt: number;
}>;

type WorldVfxCommand<Kind extends string, Geometry> = VfxCommandBase & Readonly<{
  kind: Kind;
  destination: "world";
  geometry: Geometry;
}>;

type PointGeometry = Readonly<{ type: "point"; at: Point }>;
type TargetGeometry = Readonly<{ type: "target"; targetId: string; at: Point }>;
type SegmentGeometry = Readonly<{ type: "segment"; from: Point; to: Point }>;
type LinkGeometry = Readonly<{ type: "link"; from: Point; to: Point }>;
type RadiusGeometry = Readonly<{ type: "radius"; center: Point; radius: number }>;
type HeadingGeometry = Readonly<{ type: "heading"; at: Point; heading: number }>;
type TimedVfxSegment = Readonly<{
  from: Point;
  to: Point;
  bornAt: number;
  completeAt: number;
  expiresAt: number;
  width: number;
}>;
type PolylineGeometry = Readonly<{ type: "polyline"; segments: readonly TimedVfxSegment[] }>;
type PairGeometry = Readonly<{
  type: "pair";
  pairId: string;
  center: Point;
  length: number;
  first: SegmentGeometry;
  second: SegmentGeometry;
}>;
type OrbitGeometry = Readonly<{ type: "orbit"; center: Point; slot: number; radius: number; angle: number }>;
type HudDeliveryGeometry = Readonly<{
  type: "hudDelivery";
  from: Point;
  slot: number;
  arrivesAt: number;
}>;

export type VfxCommand =
  | WorldVfxCommand<"recoilBoots.skid" | "stillwater.ward" | "undertakersCoat.decoy", PointGeometry>
  | WorldVfxCommand<
    | "coldcaster.chill"
    | "coldcaster.freeze"
    | "cinderGospel.burn"
    | "wantedBrand.mark"
    | "widowsLedger.notch"
    | "lastGaspLocket.consume",
    TargetGeometry
  >
  | WorldVfxCommand<"widowsLedger.line", SegmentGeometry>
  | (WorldVfxCommand<"pinball.relay", LinkGeometry> & Readonly<{ targetId: string }>)
  | (WorldVfxCommand<"pinball.relay", PointGeometry> & Readonly<{ targetId: null }>)
  | WorldVfxCommand<
    | "hollowPoint.explosion"
    | "ectoplasmSnare.pool"
    | "bigIron.kineticExplosion"
    | "lastBell.ring"
    | "cinderGospel.emberRing",
    RadiusGeometry
  >
  | (WorldVfxCommand<"hexBell.pulse", RadiusGeometry> & Readonly<{ targetId: string }>)
  | WorldVfxCommand<"shotgun.split" | "dustlineDuel.snapshot" | "dustlineDuel.fire", HeadingGeometry>
  | WorldVfxCommand<"ectoplasmicWake.trail", PolylineGeometry>
  | WorldVfxCommand<"crossfireCovenant.cross", PairGeometry>
  | WorldVfxCommand<"lastGaspLocket.orbital", OrbitGeometry>
  | (VfxCommandBase & Readonly<{
    kind: "bonanza.delivery";
    destination: "hud";
    geometry: HudDeliveryGeometry;
  }>);

const immutablePoint = (point: Point): Point => Object.freeze({ x: point.x, y: point.y });
const pointGeometry = (at: Point): PointGeometry => Object.freeze({ type: "point", at: immutablePoint(at) });
const targetGeometry = (targetId: string, at: Point): TargetGeometry =>
  Object.freeze({ type: "target", targetId, at: immutablePoint(at) });
const segmentGeometry = (from: Point, to: Point): SegmentGeometry =>
  Object.freeze({ type: "segment", from: immutablePoint(from), to: immutablePoint(to) });
const linkGeometry = (from: Point, to: Point): LinkGeometry =>
  Object.freeze({ type: "link", from: immutablePoint(from), to: immutablePoint(to) });
const radiusGeometry = (center: Point, radius: number): RadiusGeometry =>
  Object.freeze({ type: "radius", center: immutablePoint(center), radius });
const headingGeometry = (at: Point, heading: number): HeadingGeometry =>
  Object.freeze({ type: "heading", at: immutablePoint(at), heading });
const assertNever = (value: never): never => {
  throw new Error(`Unhandled closed VFX variant: ${JSON.stringify(value)}`);
};

function assertVfxGeometry(command: VfxCommand): void {
  const geometry = command.geometry;
  switch (geometry.type) {
    case "point":
    case "target":
    case "segment":
    case "link":
    case "heading":
      return;
    case "radius":
      if (geometry.radius <= 0) throw new Error("VFX radius must be positive");
      return;
    case "polyline":
      if (geometry.segments.length === 0 || geometry.segments.some((segment) =>
        segment.width <= 0 || segment.completeAt < segment.bornAt || segment.expiresAt <= segment.completeAt)) {
        throw new Error("VFX polyline requires live positive-width timed segments");
      }
      return;
    case "pair":
      if (!geometry.pairId || geometry.length <= 0) throw new Error("VFX pair requires identity and positive length");
      return;
    case "orbit":
      if (!Number.isInteger(geometry.slot) || geometry.slot < 0 || geometry.slot > 2 || geometry.radius <= 0) {
        throw new Error("VFX orbit requires a valid slot and positive radius");
      }
      return;
    case "hudDelivery":
      if (!Number.isInteger(geometry.slot) || geometry.slot < 0 || geometry.slot > 5
        || geometry.arrivesAt < command.bornAt || geometry.arrivesAt > command.expiresAt) {
        throw new Error("HUD delivery requires slot zero through five and bounded arrival");
      }
      return;
    default:
      return assertNever(geometry);
  }
}

export type CombatTargetState = Readonly<Point & {
  id: string;
  kind: "dummy" | "chaser";
  radius: number;
  health: number;
  maxHealth: number;
  immortal: boolean;
  speed: number;
  frozenUntil: number;
  effects?: Partial<TargetEffects>;
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
  wantedBrand?: WantedBrand;
  hexCounter?: number;
  snareRoots?: Readonly<Record<string, RootStatusRecord>>;
  killReactionHistory?: Readonly<Record<string, RootStatusRecord>>;
  wakeTrails?: Readonly<Record<string, WakeTrailState>>;
  wakeCooldowns?: Readonly<Record<string, number>>;
  crossfirePulses?: readonly CrossfirePulseState[];
  crossfireParticipation?: Readonly<Record<string, CrossfireParticipation>>;
  bigIronPairHits?: Readonly<Record<string, BigIronPairHit>>;
  descendantsByRoot?: Readonly<Record<string, DescendantRecord>>;
  pendingRefunds?: readonly PendingRefund[];
  bonanzaHistory?: Readonly<Record<string, RootStatusRecord>>;
  retainedRootIds?: readonly string[];
  validationRootIds?: readonly string[];
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
  cylinder: CylinderState;
}>;

type SweptSegment = Readonly<{
  projectileId: string;
  source: ProjectileState;
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
  atTime?: number;
}>;

type CombatPhaseState = CombatRuntime & Readonly<{
  segments: readonly SweptSegment[];
  events: readonly CombatEvent[];
  emissionRequests: readonly EmissionRequest[];
  teslaLinks: readonly TeslaLink[];
  teslaCooldowns: Readonly<Record<string, number>>;
  killContexts: readonly KillContext[];
  terminalTimes: Readonly<Record<string, number>>;
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
  reactiveEffectIds: [...projectile.reactiveEffectIds],
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
  bigIronMain: projectile.bigIronMain && { ...projectile.bigIronMain },
  moonlet: projectile.moonlet && { ...projectile.moonlet },
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
  const effects = normalizeTargetEffects(target.effects, now);
  const hollowPoint = effects.hollowPoint;
  return {
    ...target,
    frozenUntil: now < target.frozenUntil ? target.frozenUntil : 0,
    effects: {
      ...effects,
      ...(effects.burn ? {
        burn: Object.freeze({
          ...effects.burn,
          reactiveEffectIds: Object.freeze([...effects.burn.reactiveEffectIds]),
          sourceProjectile: effects.burn.sourceProjectile && immutableProjectileSnapshot(effects.burn.sourceProjectile),
        }),
      } : {}),
      ...(hollowPoint ? { hollowPoint: Object.freeze({
        ...hollowPoint,
        reactiveEffectIds: Object.freeze([...hollowPoint.reactiveEffectIds]),
        sourceProjectile: immutableProjectileSnapshot(hollowPoint.sourceProjectile),
      }) } : {}),
      slows: Object.freeze(effects.slows.map((slow) => Object.freeze({ ...slow }))),
    },
  };
};

function phaseState(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const previous = runtime as Partial<CombatPhaseState>;
  const inferredDescendants: Record<string, DescendantRecord> = {};
  if (!runtime.descendantsByRoot) {
    const add = (rootTriggerId: string, count: number) => {
      inferredDescendants[rootTriggerId] = {
        rootTriggerId,
        count: (inferredDescendants[rootTriggerId]?.count ?? 0) + count,
        limit: 294,
      };
    };
    for (const projectile of runtime.projectiles) if (projectile.generation === 1) add(projectile.rootTriggerId, 1);
    for (const scheduled of runtime.scheduledProjectiles) if (scheduled.generation === 1) add(scheduled.rootTriggerId, 1);
    for (const pending of runtime.pendingEmissions) add(pending.rootTriggerId, pending.specs.length);
  }
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
    wantedBrand: runtime.wantedBrand,
    hexCounter: runtime.hexCounter ?? 0,
    snareRoots: runtime.snareRoots ?? {},
    killReactionHistory: runtime.killReactionHistory ?? {},
    wakeTrails: runtime.wakeTrails ?? {},
    wakeCooldowns: runtime.wakeCooldowns ?? {},
    crossfirePulses: runtime.crossfirePulses ?? [],
    crossfireParticipation: runtime.crossfireParticipation ?? {},
    bigIronPairHits: runtime.bigIronPairHits ?? {},
    descendantsByRoot: runtime.descendantsByRoot ?? inferredDescendants,
    pendingRefunds: runtime.pendingRefunds ?? [],
    bonanzaHistory: runtime.bonanzaHistory ?? {},
    terminalTimes: previous.terminalTimes ?? {},
  };
}

function assertFinite(value: unknown, path = "combat runtime", seen = new Set<object>()): void {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path} must be finite`);
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) assertFinite(child, `${path}.${key}`, seen);
}

const rootEmissionKey = (effectId: string, rootTriggerId: string): string => `root\0${effectId}\0${rootTriggerId}`;

function generationZeroProjectileBound(build: CombatBuild): number {
  const twin = build.triggers.some(({ kind }) => kind === "twin");
  const tesla = build.triggers.some(({ kind }) => kind === "fractionalMultishot");
  const fan = build.triggers.find((rule) => rule.kind === "fan");
  const dealer = build.triggers.some(({ kind }) => kind === "numberedSidePair");
  return ((twin ? 2 : 1) + Number(tesla)) * (fan?.kind === "fan" ? fan.delays.length : 1)
    + (dealer ? 2 : 0);
}

function vfxProviderWeight(build: CombatBuild): number {
  const statusProviders = build.impacts.filter(({ kind }) =>
    kind === "chill" || kind === "burn" || kind === "brand" || kind === "hitCounter"
    || kind === "poolOnHit" || kind === "statusPulse").length;
  const relayProviders = build.motions.filter(({ kind }) => kind === "relay").length;
  const pulseProviders = build.emissions.reduce((total, rule) =>
    total + (rule.kind === "pulseRing" ? rule.count : 0), 0);
  const reactionProviders = build.areas.filter(({ effectId }) => effectId === "cinderGospel.emberRing").length;
  return Math.max(1, statusProviders + relayProviders + pulseProviders + reactionProviders);
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
  if (runtime.descendantsByRoot) {
    for (const [rootTriggerId, record] of Object.entries(runtime.descendantsByRoot)) {
      if (record.rootTriggerId !== rootTriggerId || !Number.isInteger(record.count) || record.count < 0) {
        throw new Error("invalid cumulative descendant ledger");
      }
      descendantsByRoot.set(rootTriggerId, record.count);
    }
  } else {
    for (const projectile of runtime.projectiles) if (projectile.generation === 1) countDescendants(projectile.rootTriggerId, 1);
    for (const scheduled of runtime.scheduledProjectiles) if (scheduled.generation === 1) countDescendants(scheduled.rootTriggerId, 1);
    for (const pending of runtime.pendingEmissions) countDescendants(pending.rootTriggerId, pending.specs.length);
  }
  for (const [rootTriggerId, count] of descendantsByRoot) {
    const descendantLimit = runtime.descendantsByRoot
      ? Math.min(294, runtime.descendantsByRoot[rootTriggerId]?.limit ?? context.build.maxDescendants)
      : 294;
    if (count > descendantLimit) {
      throw new DescendantOverflowError(rootTriggerId, descendantLimit);
    }
  }
  for (const event of runtime.metrics.hitEvents) {
    if (event.killReactionDepth !== 0 && event.killReactionDepth !== 1) throw new Error("kill reaction depth exceeds one");
  }

  const areaInstances = new Set<string>();
  for (const area of runtime.areas) {
    if (area.expiresAt <= area.bornAt || tolerantDifference(area.expiresAt - area.bornAt, 3) > 0) {
      throw new Error("area lifetime must be positive and at most three seconds");
    }
    if (tolerantDifference(area.tickInterval, 0.1) < 0) throw new Error("area tick rate must not exceed ten hertz");
    const key = `${area.effectId}\0${area.rootTriggerId}\0${area.instanceKey}`;
    if (areaInstances.has(key)) throw new Error("duplicate area instance");
    areaInstances.add(key);
    if ("kind" in area && area.kind === "snare" && (
      area.radius !== 40 || tolerantDifference(area.expiresAt - area.bornAt, 1.5) !== 0
      || tolerantDifference(area.tickInterval, 0.1) !== 0 || area.slow !== 0.5
    )) throw new Error("Snare runtime geometry must remain 40 px for 1.5 seconds at 10 Hz with 0.50 slow");
    if ("kind" in area && area.kind === "snare" && (area.damage <= 0 || area.nextTickAt < area.bornAt)) {
      throw new Error("Snare runtime damage and tick deadline must be positive");
    }
  }
  const sourceBound = generationZeroProjectileBound(context.build) + context.build.maxDescendants;
  const areaLimit = Math.max(1, Math.ceil(context.fireRate * 3) * sourceBound * Math.max(1, runtime.targets.length));
  if (runtime.areas.length > areaLimit) throw new Error(`area live count exceeds derived bound ${areaLimit}`);

  for (const target of runtime.targets) {
    const effects = normalizeTargetEffects(target.effects);
    if (target.frozenUntil < 0 || effects.chill.expiresAt < 0 || effects.ledger.expiresAt < 0) {
      throw new Error("status deadlines must be nonnegative");
    }
    if (!Number.isInteger(effects.chill.count) || effects.chill.count < 0 || effects.chill.count > 2) {
      throw new Error("chill counter must be an integer from zero through two");
    }
    if (!Number.isInteger(effects.ledger.count) || effects.ledger.count < 0 || effects.ledger.count > 4) {
      throw new Error("Ledger counter must be an integer from zero through four");
    }
    if (effects.burn && (!Number.isInteger(effects.burn.remainingTicks) || effects.burn.remainingTicks < 1 || effects.burn.remainingTicks > 4)) {
      throw new Error("burn remaining ticks must be an integer from one through four");
    }
    if (effects.burn && (effects.burn.potency <= 0 || effects.burn.nextTickAt < 0 || effects.burn.originPower <= 0)) {
      throw new Error("burn potency, origin power, and tick deadline must be positive");
    }
    if (effects.slows.some(({ multiplier }) => multiplier <= 0 || multiplier > 1)) throw new Error("slow multiplier must be in (0, 1]");
    if (effects.slows.some(({ until }) => until < 0)) throw new Error("slow deadlines must be nonnegative");
    if (new Set(effects.slows.map(({ effectId }) => effectId)).size !== effects.slows.length) {
      throw new Error("duplicate durable slow effect");
    }
    const slowLimit = Math.max(1, context.build.impacts.filter(({ kind }) => kind === "statusPulse").length);
    if (effects.slows.length > slowLimit) throw new Error(`durable slow live count exceeds derived bound ${slowLimit} per target`);
  }
  if (!Number.isInteger(runtime.hexCounter ?? 0) || (runtime.hexCounter ?? 0) < 0 || (runtime.hexCounter ?? 0) > 3) {
    throw new Error("Hex counter must be an integer from zero through three");
  }
  if (runtime.wantedBrand && runtime.wantedBrand.expiresAt < 0) throw new Error("Wanted Brand deadline must be nonnegative");

  const liveRootIds = new Set([
    ...(runtime.validationRootIds ?? []),
    ...(runtime.retainedRootIds ?? []),
    ...runtime.projectiles.map(({ rootTriggerId }) => rootTriggerId),
    ...runtime.scheduledProjectiles.map(({ rootTriggerId }) => rootTriggerId),
    ...runtime.pendingEmissions.map(({ rootTriggerId }) => rootTriggerId),
    ...(runtime.pendingRefunds ?? []).map(({ rootTriggerId }) => rootTriggerId),
    ...runtime.areas.map(({ rootTriggerId }) => rootTriggerId),
    ...Object.values(runtime.wakeTrails ?? {}).map(({ rootTriggerId }) => rootTriggerId),
    ...(runtime.crossfirePulses ?? []).map(({ rootTriggerId }) => rootTriggerId),
    ...statusRootIds(runtime.targets.map((target) => ({
      ...target,
      effects: normalizeTargetEffects(target.effects),
    })) as StatusTarget[]),
  ]);
  const snareEntries = Object.entries(runtime.snareRoots ?? {});
  const snareLimit = liveRootIds.size * Math.max(1, context.build.impacts.filter(({ kind }) => kind === "poolOnHit").length);
  if (snareEntries.length > snareLimit) throw new Error(`Snare ledger live count exceeds derived bound ${snareLimit}`);
  for (const [key, record] of snareEntries) {
    if (!record.rootTriggerId || key !== `ectoplasmSnare.pool\0${record.rootTriggerId}` || !liveRootIds.has(record.rootTriggerId)) {
      throw new Error("invalid Snare ledger record");
    }
  }
  const reactionEntries = Object.entries(runtime.killReactionHistory ?? {});
  const reactionLimit = liveRootIds.size * Math.max(1, context.build.areas.filter(({ effectId }) => effectId === "cinderGospel.emberRing").length);
  if (reactionEntries.length > reactionLimit) throw new Error(`kill-reaction ledger live count exceeds derived bound ${reactionLimit}`);
  for (const [key, record] of reactionEntries) {
    if (!record.rootTriggerId || key !== rootEmissionKey("cinderGospel.emberRing", record.rootTriggerId)
      || !liveRootIds.has(record.rootTriggerId)) {
      throw new Error("invalid kill-reaction ledger record");
    }
  }

  const refundKeys = new Set<string>();
  for (const refund of runtime.pendingRefunds ?? []) {
    const key = `${refund.effectId}\0${refund.rootTriggerId}`;
    if (refundKeys.has(key)) throw new Error("duplicate root-scoped pending refund");
    if (!Number.isSafeInteger(refund.rootIndex) || refund.rootIndex < 0 || refund.arrivesAt < 0) {
      throw new Error("pending refund ordering and deadline must be nonnegative");
    }
    if (refund.effectId === "bonanzaClip.refund"
      && (!Number.isInteger(refund.slot) || refund.slot < 0 || refund.slot > 5)) {
      throw new Error("Bonanza pending refund requires slot zero through five");
    }
    refundKeys.add(key);
  }
  const bonanzaEntries = Object.entries(runtime.bonanzaHistory ?? {});
  if (bonanzaEntries.length > liveRootIds.size) throw new Error("Bonanza history exceeds one record per live root");
  for (const [key, record] of bonanzaEntries) {
    if (key !== `bonanzaClip.refund\0${record.rootTriggerId}` || !liveRootIds.has(record.rootTriggerId)) {
      throw new Error("invalid Bonanza root history");
    }
  }
  const dustlineKeys = runtime.pendingEmissions
    .filter(({ effectId }) => effectId === "dustlineDuel.afterimage")
    .map(({ rootTriggerId, lineageId }) => `${rootTriggerId}\0${lineageId}`);
  if (new Set(dustlineKeys).size !== dustlineKeys.length) throw new Error("duplicate Dustline afterimage lineage");

  const vfxIds = new Set<string>();
  for (const command of runtime.vfxCommands) {
    if (command.expiresAt <= command.bornAt || tolerantDifference(command.expiresAt - command.bornAt, 3) > 0) {
      throw new Error("VFX lifetime must be positive and at most three seconds");
    }
    if (!command.artifactId || !command.effectId || !command.rootTriggerId
      || (command.destination !== "world" && command.destination !== "hud")) {
      throw new Error("VFX command requires complete semantic provenance");
    }
    assertVfxGeometry(command);
    if (vfxIds.has(command.id)) throw new Error("duplicate VFX id");
    vfxIds.add(command.id);
  }
  const targetBound = Math.max(1, runtime.targets.length);
  const vfxLimit = Math.max(1, Math.ceil(context.fireRate * 3 * sourceBound * vfxProviderWeight(context.build) * targetBound));
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
  const muzzle = scheduled.exactOrigin ? { ...origin } : {
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
    reactiveEffectIds: [...(scheduled.reactiveEffectIds ?? [])],
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
  const duePending = pending.filter(({ atStep, atTime }) => atStep <= runtime.step && (atTime === undefined || atTime <= runtime.now));
  const futurePending = pending.filter(({ atStep, atTime }) => atStep > runtime.step || (atTime !== undefined && atTime > runtime.now));
  let nextId = runtime.nextId;
  const created = dueSchedules.map((scheduledProjectile) => {
    const siblings = dueSchedules.filter((candidate) => candidate.rootTriggerId === scheduledProjectile.rootTriggerId
      && candidate.at === scheduledProjectile.at && candidate.generation === scheduledProjectile.generation);
    const childIndex = siblings.findIndex((candidate) => candidate === scheduledProjectile);
    return materializeScheduled(scheduledProjectile, context, runtime.now, `projectile-${nextId++}`, childIndex, siblings.length);
  });
  const mainByLineage = new Map(created.filter(({ generation }) => generation === 0)
    .map((projectile) => [projectile.lineageId, projectile]));
  dueSchedules.forEach((scheduledProjectile, index) => {
    if (!scheduledProjectile.moonlet) return;
    const moonlet = created[index]!;
    const parent = mainByLineage.get(scheduledProjectile.moonlet.parentLineageId);
    if (!parent) throw new Error(`Big Iron moonlet is missing parent ${scheduledProjectile.moonlet.parentLineageId}`);
    const angle = scheduledProjectile.spec.motionPhase ?? scheduledProjectile.spec.heading;
    moonlet.x = parent.x + Math.cos(angle) * scheduledProjectile.moonlet.orbitRadius;
    moonlet.y = parent.y + Math.sin(angle) * scheduledProjectile.moonlet.orbitRadius;
    moonlet.vx = parent.vx - Math.sin(angle) * scheduledProjectile.moonlet.angularSpeed * scheduledProjectile.moonlet.orbitRadius;
    moonlet.vy = parent.vy + Math.cos(angle) * scheduledProjectile.moonlet.angularSpeed * scheduledProjectile.moonlet.orbitRadius;
    moonlet.moonlet = {
      mainId: parent.id,
      parentId: parent.id,
      orbitRadius: scheduledProjectile.moonlet.orbitRadius,
      angularSpeed: scheduledProjectile.moonlet.angularSpeed,
      angle,
      expiresAt: runtime.now + scheduledProjectile.spec.lifetime,
      remainingRange: scheduledProjectile.moonlet.remainingRange,
      mainDamage: scheduledProjectile.moonlet.mainDamage,
      pairWindow: scheduledProjectile.moonlet.pairWindow,
      explosionRadius: scheduledProjectile.moonlet.explosionRadius,
      explosionDamageScale: scheduledProjectile.moonlet.explosionDamageScale,
      knockback: scheduledProjectile.moonlet.knockback,
    };
    parent.moonletId = moonlet.id;
    parent.bigIronMain = { moonletId: moonlet.id, mainDamage: scheduledProjectile.moonlet.mainDamage, heading: scheduledProjectile.spec.heading };
  });
  for (const emission of duePending) {
    const materialized = materializePending(emission, context, runtime.now, nextId);
    created.push(...materialized.projectiles);
    nextId = materialized.nextId;
  }
  let metrics = runtime.metrics;
  const vfxCommands = [...runtime.vfxCommands];
  for (const _ of created) metrics = recordProjectile(metrics);
  for (const emission of duePending.filter(({ effectId }) => effectId === "dustlineDuel.afterimage")) {
    const template = emission.templates?.[0];
    const point = template ?? context.player;
    vfxCommands.push({
      id: `vfx-${nextId++}`,
      kind: "dustlineDuel.fire",
      artifactId: "dustlineDuel",
      effectId: emission.effectId,
      rootTriggerId: emission.rootTriggerId,
      lineageId: emission.lineageId,
      destination: "world",
      bornAt: runtime.now,
      expiresAt: runtime.now + 0.15,
      geometry: headingGeometry(point, template ? Math.atan2(template.vy, template.vx) : 0),
    });
  }
  return {
    ...phaseState(runtime, context),
    projectiles: [...runtime.projectiles.map(cloneProjectile), ...created],
    targets: runtime.targets.map((target) => cloneTarget(target)),
    scheduledProjectiles: futureSchedules,
    pendingEmissions: futurePending,
    metrics,
    vfxCommands,
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
  const brandRule = context.build.impacts.find((rule) => rule.kind === "brand");
  const projectiles = current.projectiles.map((source) => {
    const projectile = cloneProjectile(source);
    if (source.moonlet?.parentId) return projectile;
    const liveDuration = Math.max(0, Math.min(
      context.dt,
      projectile.lifetime - Math.max(0, current.now - context.dt - projectile.bornAt),
    ));
    const motionStart = current.now - context.dt;
    const brandDuration = projectile.generation === 0 && current.wantedBrand && brandRule?.kind === "brand"
      && motionStart < current.wantedBrand.expiresAt
      ? Math.min(liveDuration, current.wantedBrand.expiresAt - motionStart)
      : 0;
    const move = (moving: ProjectileState, duration: number, offset: number, branded: boolean) => {
      moving.wantedTargetId = branded ? current.wantedBrand?.targetId : undefined;
      moving.wantedTurnRate = branded && brandRule?.kind === "brand" ? brandRule.steering : undefined;
      return applyMotionRules(moving, context.trajectoryTargets ?? current.targets, duration, motionStart + offset + duration);
    };
    let result = move(projectile, brandDuration > 0 ? brandDuration : liveDuration, 0, brandDuration > 0);
    if (brandDuration > 0 && brandDuration < liveDuration) {
      const first = result;
      const second = move(cloneProjectile(first.projectile), liveDuration - brandDuration, brandDuration, false);
      const normalizePath = (path: typeof first.path, offset: number, duration: number) => path.map((part) => ({
        ...part,
        startTime: liveDuration === 0 ? 0 : (offset + part.startTime * duration) / liveDuration,
        endTime: liveDuration === 0 ? 1 : (offset + part.endTime * duration) / liveDuration,
      }));
      result = {
        ...second,
        path: [
          ...normalizePath(first.path, 0, brandDuration),
          ...normalizePath(second.path, brandDuration, liveDuration - brandDuration),
        ],
      };
    }
    const timeScale = context.dt === 0 ? 1 : liveDuration / context.dt;
    result.path.forEach((path, index) => segments.push({
      projectileId: projectile.id,
      source: immutableProjectileSnapshot(source),
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
  const movedById = new Map(projectiles.map((projectile) => [projectile.id, projectile]));
  current.projectiles.forEach((source, index) => {
    if (!source.moonlet?.parentId) return;
    const projectile = projectiles[index]!;
    const parent = movedById.get(source.moonlet.parentId);
    if (!parent) {
      projectile.moonlet = { ...source.moonlet, parentId: undefined };
      return;
    }
    const liveDuration = Math.max(0, Math.min(context.dt, source.moonlet.expiresAt - (current.now - context.dt)));
    const angle = source.moonlet.angle + source.moonlet.angularSpeed * liveDuration;
    projectile.x = parent.x + Math.cos(angle) * source.moonlet.orbitRadius;
    projectile.y = parent.y + Math.sin(angle) * source.moonlet.orbitRadius;
    projectile.vx = parent.vx - Math.sin(angle) * source.moonlet.angularSpeed * source.moonlet.orbitRadius;
    projectile.vy = parent.vy + Math.cos(angle) * source.moonlet.angularSpeed * source.moonlet.orbitRadius;
    projectile.moonlet = { ...source.moonlet, angle };
    const distance = Math.hypot(projectile.x - source.x, projectile.y - source.y);
    segments.push({
      projectileId: projectile.id,
      source: immutableProjectileSnapshot(source),
      index: 0,
      from: { x: source.x, y: source.y },
      to: { x: projectile.x, y: projectile.y },
      distance,
      startTime: 0,
      endTime: context.dt === 0 ? 0 : liveDuration / context.dt,
      liveDuration,
      expiresAfterMove: current.now >= source.moonlet.expiresAt,
      startTravelled: source.travelled,
      endTravelled: source.travelled + distance,
      startRadius: source.radius,
      endRadius: projectile.radius,
      startDamage: source.damage,
      endDamage: projectile.damage,
      leg: source.returnLeg ?? "outbound",
    });
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
    const dustlineToken = projectile.pendingEffectTokens?.find(({ effectId }) => effectId === "dustlineDuel.afterimage");
    const dustlineDistance = projectile.generation === 0
      && projectile.activatedEffectIds.includes("dustlineDuel.threshold")
      && !projectile.emittedEffectIds.includes("dustlineDuel.threshold")
      ? 192
      : dustlineToken?.distance;
    if (dustlineDistance !== undefined) {
      const remaining = dustlineDistance - segment.startTravelled;
      if (remaining >= -EPSILON && remaining <= segment.distance + EPSILON) {
        const time = segment.distance === 0 ? 0 : Math.max(0, remaining / segment.distance);
        events.push({ ...eventFields(time), kind: "distance", distanceEffect: "dustline", projectileId: projectile.id, point: pointAt(segment, time), segment: path });
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

function emissionSpecs(source: ProjectileState, rule: EmissionRule, headings: readonly number[]): ProjectileSpec[] {
  const damageScale = "damageScale" in rule ? rule.damageScale : 1;
  const radiusScale = "radiusScale" in rule ? rule.radiusScale : 1;
  const { split: _, crossfire: __, ...behaviors } = source.behaviors;
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
  if (rule.kind === "afterimage") return [heading];
  return [];
}

function dustlineAfterimageRule(source: ProjectileState, build: CombatBuild): Extract<EmissionRule, { kind: "afterimage" }> | undefined {
  const current = build.emissions.find((candidate): candidate is Extract<EmissionRule, { kind: "afterimage" }> =>
    candidate.kind === "afterimage" && candidate.effectId === "dustlineDuel.afterimage");
  if (current) return current;
  return source.activatedEffectIds.includes("dustlineDuel.afterimage") ? Object.freeze({
    family: "emission" as const,
    kind: "afterimage" as const,
    artifactId: "dustlineDuel" as const,
    effectId: "dustlineDuel.afterimage",
    phase: 90,
    delay: 0.12,
    range: 192,
    damageScale: 0.35,
  }) : undefined;
}

function captureKillContext(
  target: CombatTargetState,
  healthBefore: number,
  event: DamageEvent,
  projectile?: ProjectileState,
  burn?: BurnStatus,
): KillContext | undefined {
  if (target.immortal || healthBefore <= 0 || target.health > 0) return undefined;
  const sourceProjectile = projectile && immutableProjectileSnapshot(projectile);
  const targetEffects = normalizeTargetEffects(target.effects, event.time);
  return Object.freeze({
    victimId: target.id,
    x: target.x,
    y: target.y,
    time: event.time,
    source: event.source,
    generation: event.generation ?? projectile?.generation ?? 0,
    reactiveEffectIds: Object.freeze([...(event.reactiveEffectIds ?? projectile?.reactiveEffectIds ?? [])]),
    artifactId: event.artifactId,
    effectId: event.effectId,
    rootTriggerId: event.rootTriggerId,
    lineageId: event.lineageId,
    projectileId: event.projectileId,
    originPower: event.originPower,
    killReactionDepth: event.killReactionDepth,
    sourceProjectile: sourceProjectile && Object.freeze(sourceProjectile),
    targetEffects: Object.freeze({ ...targetEffects, ...(burn ? { burn: Object.freeze({ ...burn }) } : {}) }),
  });
}

function directProvenance(projectile: ProjectileState): Readonly<{ artifactId: string; effectId: string }> {
  return projectile.generation === 1 && projectile.emission
    ? projectile.emission
    : { artifactId: "baseRevolver", effectId: "baseRevolver.direct" };
}

function statusRequestToVfx(request: StatusVfxRequest): VfxCommand {
  switch (request.kind) {
    case "coldcaster.chill":
    case "coldcaster.freeze":
    case "cinderGospel.burn":
    case "wantedBrand.mark":
    case "widowsLedger.notch":
    case "widowsLedger.line":
    case "ectoplasmSnare.pool":
    case "hexBell.pulse":
      return Object.freeze({ ...request, destination: "world" });
    default:
      return assertNever(request);
  }
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
  const releasedMoonlets = new Set<string>();
  const releasedMoonletAt = new Map<string, number>();
  const terminalTimes = { ...current.terminalTimes };
  const emissionRequests: EmissionRequest[] = [];
  const vfxCommands = [...current.vfxCommands];
  const relayLedger = { ...(current.relayLedger ?? {}) };
  const emittedEffects = { ...(current.emittedEffects ?? {}) };
  const pendingEffectTokens = [...(current.pendingEffectTokens ?? [])];
  const killContexts = [...current.killContexts];
  const areas = [...current.areas];
  let wantedBrand = current.wantedBrand;
  let hexCounter = current.hexCounter ?? 0;
  let snareRoots = { ...(current.snareRoots ?? {}) };
  const bigIronPairHits = { ...(current.bigIronPairHits ?? {}) };
  let nextId = current.nextId;
  let metrics = current.metrics;

  const upsertVfx = (command: VfxCommand): void => {
    const index = vfxCommands.findIndex(({ id }) => id === command.id);
    if (index >= 0) vfxCommands[index] = command;
    else vfxCommands.push(command);
  };

  const releaseMoonlet = (main: ProjectileState, event: CombatEvent): void => {
    const moonlet = main.bigIronMain && projectileById.get(main.bigIronMain.moonletId);
    if (!moonlet?.moonlet || moonlet.moonlet.parentId !== main.id || removed.has(moonlet.id)) return;
    const motionStart = current.segments.find(({ projectileId }) => projectileId === moonlet.id)?.source.moonlet;
    const angle = (motionStart?.angle ?? moonlet.moonlet.angle) + moonlet.moonlet.angularSpeed * context.dt * event.eventTime;
    const tangent = angle + Math.sign(moonlet.moonlet.angularSpeed || 1) * Math.PI / 2;
    const speed = Math.max(moonlet.speed, Math.abs(moonlet.moonlet.angularSpeed) * moonlet.moonlet.orbitRadius);
    moonlet.x = event.point.x;
    moonlet.y = event.point.y;
    moonlet.vx = Math.cos(tangent) * speed;
    moonlet.vy = Math.sin(tangent) * speed;
    moonlet.speed = speed;
    moonlet.moonlet = { ...moonlet.moonlet, parentId: undefined, angle };
    moonlet.maxTravel = moonlet.travelled + moonlet.moonlet.remainingRange;
    releasedMoonlets.add(moonlet.id);
    releasedMoonletAt.set(moonlet.id, event.eventTime);
  };

  const settleAttachedMoonlet = (main: ProjectileState, event: CombatEvent): void => {
    const moonlet = main.bigIronMain && projectileById.get(main.bigIronMain.moonletId);
    if (!moonlet?.moonlet || moonlet.moonlet.parentId !== main.id
      || removed.has(moonlet.id) || settled.has(moonlet.id)) return;
    const motionSegment = current.segments.find(({ projectileId }) => projectileId === moonlet.id);
    const motionStart = motionSegment?.source.moonlet;
    const angle = (motionStart?.angle ?? moonlet.moonlet.angle)
      + moonlet.moonlet.angularSpeed * context.dt * event.eventTime;
    moonlet.x = main.x + Math.cos(angle) * moonlet.moonlet.orbitRadius;
    moonlet.y = main.y + Math.sin(angle) * moonlet.moonlet.orbitRadius;
    moonlet.vx = main.vx - Math.sin(angle) * moonlet.moonlet.angularSpeed * moonlet.moonlet.orbitRadius;
    moonlet.vy = main.vy + Math.cos(angle) * moonlet.moonlet.angularSpeed * moonlet.moonlet.orbitRadius;
    if (motionSegment) {
      const local = motionSegment.endTime === motionSegment.startTime ? 0
        : clamp((event.eventTime - motionSegment.startTime) / (motionSegment.endTime - motionSegment.startTime), 0, 1);
      moonlet.travelled = motionSegment.startTravelled + motionSegment.distance * local;
    }
    moonlet.moonlet = { ...moonlet.moonlet, angle };
    terminalTimes[moonlet.id] = event.eventTime;
    settled.add(moonlet.id);
  };

  const stopProjectile = (projectile: ProjectileState, event: CombatEvent): void => {
    terminalTimes[projectile.id] = event.eventTime;
    releaseMoonlet(projectile, event);
  };

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
    const releasedAt = releasedMoonletAt.get(event.projectileId);
    if (releasedAt !== undefined && event.eventTime > releasedAt + EPSILON) continue;
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
        stopProjectile(projectile, event);
        removed.add(projectile.id);
        continue;
      }
      if (event.distanceEffect === "dustline") {
        if (projectile.generation === 0 && projectile.emittedEffectIds.includes("dustlineDuel.threshold")) continue;
        if (projectile.generation === 1
          && !projectile.pendingEffectTokens?.some(({ effectId }) => effectId === "dustlineDuel.afterimage")) continue;
        projectile.penetration = { obstacles: true, targets: true };
        projectile.behaviors = Object.freeze({
          ...projectile.behaviors,
          penetration: projectile.penetration,
        });
        projectile.pendingEffectTokens = projectile.pendingEffectTokens
          ?.filter(({ effectId }) => effectId !== "dustlineDuel.afterimage");
        if (projectile.generation === 0) {
          projectile.emittedEffectIds = [...projectile.emittedEffectIds, "dustlineDuel.threshold"];
          const rule = dustlineAfterimageRule(projectile, context.build);
          const key = lineageEmissionKey("dustlineDuel.afterimage", projectile.lineageId);
          if (rule?.kind === "afterimage" && !emittedEffects[key]) {
            const source = cloneProjectile(projectile);
            const crossedAt = current.now - context.dt + event.eventTime * context.dt;
            emissionRequests.push({
              projectile: source,
              rule,
              specs: emissionSpecs(source, rule, headingsFor(source, rule)),
              origin: event.point,
              atTime: crossedAt + rule.delay,
            });
            projectile.emittedEffectIds = [...projectile.emittedEffectIds, rule.effectId];
            emittedEffects[key] = { rootTriggerId: projectile.rootTriggerId, lineageId: projectile.lineageId };
            vfxCommands.push({
              id: `vfx-${nextId++}`,
              kind: "dustlineDuel.snapshot",
              artifactId: "dustlineDuel",
              effectId: rule.effectId,
              rootTriggerId: projectile.rootTriggerId,
              lineageId: projectile.lineageId,
              destination: "world",
              bornAt: crossedAt,
              expiresAt: crossedAt + 0.2,
              geometry: headingGeometry(event.point, Math.atan2(projectile.vy, projectile.vx)),
            });
          }
        }
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
        if (rule.kind === "splitCone") {
          const crossedAt = current.now - context.dt + event.eventTime * context.dt;
          vfxCommands.push({
            id: `vfx-${nextId++}`,
            kind: "shotgun.split",
            artifactId: rule.artifactId,
            effectId: rule.effectId,
            rootTriggerId: projectile.rootTriggerId,
            lineageId: projectile.lineageId,
            destination: "world",
            bornAt: crossedAt,
            expiresAt: crossedAt + 0.2,
            geometry: headingGeometry(event.point, Math.atan2(projectile.vy, projectile.vx)),
          });
          if (pendingTokens) pendingEffectTokens.push(...pendingTokens);
        }
      }
      const dustline = dustlineAfterimageRule(projectile, context.build);
      const dustlineKey = lineageEmissionKey("dustlineDuel.afterimage", projectile.lineageId);
      if (dustline?.kind === "afterimage"
        && projectile.activatedEffectIds.includes(dustline.effectId)
        && !emittedEffects[dustlineKey]) {
        const source = cloneProjectile(projectile);
        const crossedAt = current.now - context.dt + event.eventTime * context.dt;
        emissionRequests.push({
          projectile: source,
          rule: dustline,
          specs: emissionSpecs(source, dustline, headingsFor(source, dustline)),
          origin: event.point,
          atTime: crossedAt + dustline.delay,
        });
        projectile.emittedEffectIds = [...projectile.emittedEffectIds, dustline.effectId, "dustlineDuel.threshold"];
        emittedEffects[dustlineKey] = { rootTriggerId: projectile.rootTriggerId, lineageId: projectile.lineageId };
        vfxCommands.push({
          id: `vfx-${nextId++}`,
          kind: "dustlineDuel.snapshot",
          artifactId: "dustlineDuel",
          effectId: dustline.effectId,
          rootTriggerId: projectile.rootTriggerId,
          lineageId: projectile.lineageId,
          destination: "world",
          bornAt: crossedAt,
          expiresAt: crossedAt + 0.2,
          geometry: headingGeometry(event.point, Math.atan2(projectile.vy, projectile.vx)),
        });
      }
      metrics = recordProjectileOutcome(metrics, projectile.everHit);
      stopProjectile(projectile, event);
      removed.add(projectile.id);
      continue;
    }
    if (event.kind === "range" || event.kind === "lifetime") {
      queueNaturalExpiry(projectile, event.point);
      metrics = recordProjectileOutcome(metrics, projectile.everHit);
      stopProjectile(projectile, event);
      removed.add(projectile.id);
      continue;
    }
    if (event.kind === "prop" || event.kind === "wall") {
      if (projectile.remainingBounces <= 0) {
        metrics = recordProjectileOutcome(metrics, projectile.everHit);
        stopProjectile(projectile, event);
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
          const relayTarget = targets
            .filter((target) => target.health > 0 && Math.hypot(target.x - event.point.x, target.y - event.point.y) <= relay.radius)
            .sort((a, b) => Math.hypot(a.x - event.point.x, a.y - event.point.y)
              - Math.hypot(b.x - event.point.x, b.y - event.point.y) || a.id.localeCompare(b.id))[0];
          if (relayTarget) projectile.relayTargetId = relayTarget.id;
          else delete projectile.relayTargetId;
          const relayAt = current.now - context.dt + event.eventTime * context.dt;
          const relayCommand: VfxCommand = relayTarget ? {
            id: `vfx-${nextId++}`,
            kind: "pinball.relay",
            artifactId: "pinball",
            effectId: "pinball.relay",
            rootTriggerId: projectile.rootTriggerId,
            lineageId: projectile.lineageId,
            destination: "world",
            bornAt: relayAt,
            expiresAt: relayAt + 0.18,
            targetId: relayTarget.id,
            geometry: linkGeometry(event.point, relayTarget),
          } : {
            id: `vfx-${nextId++}`,
            kind: "pinball.relay",
            artifactId: "pinball",
            effectId: "pinball.relay",
            rootTriggerId: projectile.rootTriggerId,
            lineageId: projectile.lineageId,
            destination: "world",
            bornAt: relayAt,
            expiresAt: relayAt + 0.18,
            targetId: null,
            geometry: pointGeometry(event.point),
          };
          vfxCommands.push(Object.freeze(relayCommand));
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
          stopProjectile(projectile, event);
          removed.add(projectile.id);
        } else {
          settleAttachedMoonlet(projectile, event);
          terminalTimes[projectile.id] = event.eventTime;
          settled.add(projectile.id);
        }
      }
      continue;
    }

    let target = targetById.get(event.targetId!)!;
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
    const healthAfterDirect = target.health;
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
      reactiveEffectIds: projectile.reactiveEffectIds,
      firstProjectileHit: firstHit,
      x: target.x,
      y: target.y,
    };
    metrics = recordDamage(metrics, damageEvent);
    const secondaryKills: KillContext[] = [];

    const moonlet = projectile.moonlet
      ?? (projectile.bigIronMain ? projectileById.get(projectile.bigIronMain.moonletId)?.moonlet : undefined);
    const mainId = projectile.bigIronMain ? projectile.id : moonlet?.mainId;
    const moonletId = projectile.bigIronMain?.moonletId ?? (moonlet ? projectile.id : undefined);
    if (mainId && moonletId && moonlet) {
      const pairId = canonicalPair(mainId, moonletId);
      const key = `bigIron.kineticExplosion\0${pairId}\0${target.id}`;
      const previous = bigIronPairHits[key];
      if (!previous) bigIronPairHits[key] = {
        rootTriggerId: projectile.rootTriggerId,
        mainId,
        moonletId,
        targetId: target.id,
        firstAt: damageEvent.time,
        firstProjectileId: projectile.id,
        mainDamage: moonlet.mainDamage,
        heading: projectileById.get(mainId)?.bigIronMain?.heading ?? Math.atan2(projectile.vy, projectile.vx),
        spent: false,
      };
      else if (!previous.spent && previous.firstProjectileId !== projectile.id
        && damageEvent.time - previous.firstAt <= moonlet.pairWindow + EPSILON) {
        bigIronPairHits[key] = { ...previous, spent: true };
        const main = projectileById.get(mainId);
        const explosionDamage = previous.mainDamage * moonlet.explosionDamageScale;
        for (const nearby of targets) {
          if ((!nearby.immortal && nearby.health <= 0)
            || Math.hypot(nearby.x - event.point.x, nearby.y - event.point.y) > moonlet.explosionRadius + nearby.radius) continue;
          const beforeExplosion = nearby.health;
          if (!nearby.immortal) (nearby as { health: number }).health -= explosionDamage;
          const dx = nearby.x - event.point.x;
          const dy = nearby.y - event.point.y;
          const distance = Math.hypot(dx, dy);
          const direction = distance > EPSILON
            ? { x: dx / distance, y: dy / distance }
            : { x: Math.cos(previous.heading), y: Math.sin(previous.heading) };
          (nearby as { x: number }).x = clamp(nearby.x + direction.x * moonlet.knockback, context.room.minX + nearby.radius, context.room.maxX - nearby.radius);
          (nearby as { y: number }).y = clamp(nearby.y + direction.y * moonlet.knockback, context.room.minY + nearby.radius, context.room.maxY - nearby.radius);
          const explosionEvent: DamageEvent = {
            source: "area",
            damage: explosionDamage,
            time: damageEvent.time,
            targetId: nearby.id,
            artifactId: "bigIron",
            effectId: "bigIron.kineticExplosion",
            rootTriggerId: main?.rootTriggerId ?? projectile.rootTriggerId,
            lineageId: main?.lineageId ?? projectile.lineageId,
            projectileId: mainId,
            killReactionDepth: 0,
            originPower: main?.originPower ?? previous.mainDamage,
            generation: 0,
            reactiveEffectIds: main?.reactiveEffectIds ?? [],
            x: nearby.x,
            y: nearby.y,
          };
          metrics = recordDamage(metrics, explosionEvent);
          const killed = captureKillContext(nearby, beforeExplosion, explosionEvent, main);
          if (killed) {
            secondaryKills.push(killed);
            metrics = recordKill(metrics, nearby.id);
          }
        }
        vfxCommands.push({
          id: `vfx-${nextId++}`,
          kind: "bigIron.kineticExplosion",
          artifactId: "bigIron",
          effectId: "bigIron.kineticExplosion",
          rootTriggerId: projectile.rootTriggerId,
          lineageId: projectile.lineageId,
          destination: "world",
          bornAt: damageEvent.time,
          expiresAt: damageEvent.time + 0.25,
          geometry: radiusGeometry(event.point, moonlet.explosionRadius),
        });
      }
    }

    let charge = target.effects?.hollowPoint;
    if (charge && charge.expiresAt <= damageEvent.time) {
      (target as { effects: TargetEffects }).effects = { ...normalizeTargetEffects(target.effects), hollowPoint: undefined };
      charge = undefined;
    }
    if (charge) {
      (target as { effects: TargetEffects }).effects = { ...normalizeTargetEffects(target.effects), hollowPoint: undefined };
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
          secondaryKills.push(explosionKill);
          metrics = recordKill(metrics, nearby.id);
        }
      }
      const hollow = context.build.areas.find((rule) => rule.effectId === "hollowPoint.explosion");
      const explosionRadius = hollow?.kind === "explosion" ? hollow.radius : 64;
      vfxCommands.push(Object.freeze({
        id: `vfx-${nextId++}`,
        kind: "hollowPoint.explosion",
        artifactId: "hollowPoint",
        effectId: "hollowPoint.explosion",
        rootTriggerId: charge.rootTriggerId,
        ...(charge.lineageId ? { lineageId: charge.lineageId } : {}),
        destination: "world",
        bornAt: damageEvent.time,
        expiresAt: damageEvent.time + 0.25,
        geometry: radiusGeometry(target, explosionRadius),
      }));
    } else {
      const hollow = context.build.impacts.find((rule) => rule.kind === "embeddedCharge"
        && projectile.activatedEffectIds.includes(rule.effectId));
      if (hollow?.kind === "embeddedCharge" && (target.immortal || target.health > 0)) {
        (target as { effects: TargetEffects }).effects = {
          ...normalizeTargetEffects(target.effects),
          hollowPoint: Object.freeze({
            damage: originPower * hollow.storedDamageScale,
            expiresAt: damageEvent.time + hollow.duration,
            rootTriggerId: projectile.rootTriggerId,
            lineageId: projectile.lineageId,
            projectileId: projectile.id,
            originPower,
            generation: projectile.generation,
            reactiveEffectIds: Object.freeze([...projectile.reactiveEffectIds]),
            sourceProjectile: immutableProjectileSnapshot(projectile),
          }),
        };
      }
    }

    const applied = applyDirectStatuses({
      runtime: {
        targets: targets.map((candidate) => ({
          ...candidate,
          effects: normalizeTargetEffects(candidate.effects, damageEvent.time),
        })) as StatusTarget[],
        wantedBrand,
        hexCounter,
        snareRoots,
      },
      targetId: target.id,
      targetWasAlive: target.immortal || healthBefore > 0,
      projectile,
      build: context.build,
      now: damageEvent.time,
      impactPoint: event.point,
      player: context.player,
    });
    targets.splice(0, targets.length, ...applied.targets.map((candidate) => cloneTarget(candidate, damageEvent.time)));
    targetById.clear();
    for (const candidate of targets) targetById.set(candidate.id, candidate);
    target = targetById.get(event.targetId!)!;
    wantedBrand = applied.wantedBrand;
    hexCounter = applied.hexCounter;
    snareRoots = { ...applied.snareRoots };
    for (const area of applied.areas) areas.push({
      ...area,
      id: `area-${nextId++}`,
      sourceProjectile: area.sourceProjectile && immutableProjectileSnapshot(area.sourceProjectile),
    });
    for (const command of applied.vfx) upsertVfx(statusRequestToVfx(command));

    if (applied.shatter) {
      const key = lineageEmissionKey(applied.shatter.rule.effectId, projectile.lineageId);
      if (!emittedEffects[key]) {
        const source = cloneProjectile(projectile);
        emissionRequests.push({
          projectile: source,
          rule: applied.shatter.rule,
          specs: emissionSpecs(source, applied.shatter.rule, applied.shatter.headings),
          origin: event.point,
        });
        projectile.emittedEffectIds = [...projectile.emittedEffectIds, applied.shatter.rule.effectId];
        emittedEffects[key] = { rootTriggerId: projectile.rootTriggerId, lineageId: projectile.lineageId };
      }
    }

    const directKill = captureKillContext({ ...target, health: healthAfterDirect }, healthBefore, damageEvent, projectile);
    if (directKill) {
      killContexts.push(directKill);
      metrics = recordKill(metrics, target.id);
    }
    killContexts.push(...secondaryKills.map((killed) => killed.victimId === target.id
      ? Object.freeze({
        ...killed,
        targetEffects: Object.freeze(normalizeTargetEffects(target.effects, damageEvent.time)),
      })
      : killed));

    for (const request of applied.damages) {
      const marked = targetById.get(request.event.targetId);
      if (!marked || (!marked.immortal && marked.health <= 0)) continue;
      const before = marked.health;
      if (!marked.immortal) (marked as { health: number }).health -= request.event.damage;
      metrics = recordDamage(metrics, request.event);
      const killed = captureKillContext(marked, before, request.event, request.sourceProjectile, request.burn);
      if (killed) {
        killContexts.push(killed);
        metrics = recordKill(metrics, marked.id);
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
        stopProjectile(projectile, event);
        removed.add(projectile.id);
      } else {
        settleAttachedMoonlet(projectile, event);
        terminalTimes[projectile.id] = event.eventTime;
        settled.add(projectile.id);
      }
    } else {
      metrics = recordProjectileOutcome(metrics, projectile.everHit);
      stopProjectile(projectile, event);
      removed.add(projectile.id);
    }
  }

  for (const projectile of projectiles) {
    if (removed.has(projectile.id) || settled.has(projectile.id) || releasedMoonlets.has(projectile.id)) continue;
    const final = finalProjectiles.get(projectile.id);
    if (!final) continue;
    const outboundHitTargetIds = [...(projectile.outboundHitTargetIds ?? [])];
    const returnHitTargetIds = [...(projectile.returnHitTargetIds ?? [])];
    const everHit = projectile.everHit;
    const originPower = projectile.originPower;
    const emittedEffectIds = [...projectile.emittedEffectIds];
    const penetration = projectile.penetration && { ...projectile.penetration };
    const pendingTokens = projectile.pendingEffectTokens && [...projectile.pendingEffectTokens];
    Object.assign(projectile, cloneProjectile(final));
    projectile.outboundHitTargetIds = outboundHitTargetIds;
    projectile.returnHitTargetIds = returnHitTargetIds;
    projectile.hitTargetIds = projectile.returnLeg === "return" ? returnHitTargetIds : outboundHitTargetIds;
    projectile.everHit = everHit;
    projectile.originPower = originPower;
    projectile.emittedEffectIds = emittedEffectIds;
    projectile.penetration = penetration;
    projectile.pendingEffectTokens = pendingTokens;
    projectile.behaviors = Object.freeze({
      ...projectile.behaviors,
      ...(penetration && { penetration }),
    });
  }

  const clippedSegments = current.segments.flatMap((segment) => {
    const terminal = terminalTimes[segment.projectileId];
    if (terminal === undefined || terminal >= segment.endTime - EPSILON) return [segment];
    if (terminal <= segment.startTime + EPSILON) return [];
    const local = (terminal - segment.startTime) / (segment.endTime - segment.startTime);
    return [{
      ...segment,
      to: pointAt(segment, local),
      distance: segment.distance * local,
      endTime: terminal,
      endTravelled: segment.startTravelled + (segment.endTravelled - segment.startTravelled) * local,
      endRadius: segment.startRadius + (segment.endRadius - segment.startRadius) * local,
      endDamage: segment.startDamage + (segment.endDamage - segment.startDamage) * local,
      expiresAfterMove: true,
    }];
  });

  return {
    ...current,
    projectiles: projectiles.filter(({ id }) => !removed.has(id)),
    targets,
    areas,
    metrics,
    emissionRequests,
    vfxCommands,
    relayLedger,
    emittedEffects,
    pendingEffectTokens,
    killContexts,
    wantedBrand,
    hexCounter,
    snareRoots,
    bigIronPairHits,
    terminalTimes,
    segments: clippedSegments,
    nextId,
  };
}

export function resolveEmissionPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  let nextId = current.nextId;
  const pending = [...current.pendingEmissions];
  const descendantsByRoot = { ...(current.descendantsByRoot ?? {}) };
  const creationEffectIds = [
    ...context.build.emissions.map(({ effectId }) => effectId),
    ...context.build.motions.filter(({ kind }) => kind === "distanceThreshold").map(({ effectId }) => effectId),
    "dustlineDuel.afterimage",
    "dustlineDuel.threshold",
  ];
  for (const request of current.emissionRequests) {
    const count = request.specs?.length ?? (request.rule.kind === "splitCone" ? request.rule.count : 0);
    const previousDescendants = descendantsByRoot[request.projectile.rootTriggerId];
    const descendantCount = (previousDescendants?.count ?? 0) + count;
    const limit = Math.min(294, previousDescendants?.limit ?? context.build.maxDescendants);
    if (descendantCount > limit) {
      throw new DescendantOverflowError(request.projectile.rootTriggerId, limit);
    }
    descendantsByRoot[request.projectile.rootTriggerId] = {
      rootTriggerId: request.projectile.rootTriggerId,
      count: descendantCount,
      limit,
    };
    const nextIds = Array.from({ length: count }, () => `projectile-${nextId++}`);
    const built = request.rule.kind === "splitCone"
      ? queueEmission(request.projectile, request.rule, {
        step: current.step,
        nextIds,
        emissionEffectIds: creationEffectIds,
        pendingTokens: request.pendingTokens,
      })
      : buildGenerationOneEmission(request.projectile, request.rule, request.specs ?? [], current.step, {
        childIds: nextIds,
        origin: request.origin,
        emissionEffectIds: creationEffectIds,
        pendingTokens: request.pendingTokens,
        soulTargetIds: request.soulTargetIds,
      });
    pending.push(request.atTime === undefined ? built : Object.freeze({ ...built, atTime: request.atTime }));
  }
  return { ...current, pendingEmissions: pending, nextId, emissionRequests: [], descendantsByRoot };
}

export function resolveAreaPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  const projectiles = current.projectiles.map(cloneProjectile);
  const statusUpdate = advanceStatuses({
    targets: current.targets.map((target) => ({
      ...target,
      effects: normalizeTargetEffects(target.effects),
    })) as StatusTarget[],
    areas: current.areas.filter((area): area is SnareAreaState => "kind" in area && area.kind === "snare"),
    now: current.now,
  });
  let targets = statusUpdate.targets.map((target) => cloneTarget(target, current.now));
  const areas: AreaState[] = [
    ...current.areas.filter((area) => !("kind" in area) && area.expiresAt > current.now),
    ...statusUpdate.areas,
  ];
  const vfxCommands = [...current.vfxCommands];
  const killContexts = [...current.killContexts];
  let nextId = current.nextId;
  let metrics = current.metrics;
  let wakeTrails = Object.fromEntries(Object.entries(current.wakeTrails ?? {}).map(([lineageId, trail]) => [lineageId, {
    ...trail,
    segments: trail.segments.map((segment) => ({
      ...segment,
      sourceProjectile: immutableProjectileSnapshot(segment.sourceProjectile),
    })),
  }])) as Record<string, WakeTrailState>;
  let wakeCooldowns = { ...(current.wakeCooldowns ?? {}) };
  const crossfirePulses = [...(current.crossfirePulses ?? [])].filter(({ expiresAt }) => expiresAt > current.now);
  const crossfireParticipation = { ...(current.crossfireParticipation ?? {}) };
  for (const request of statusUpdate.damages) {
    const index = targets.findIndex(({ id }) => id === request.event.targetId);
    const target = targets[index];
    if (!target || (!target.immortal && target.health <= 0)) continue;
    const healthBefore = target.health;
    const damaged = target.immortal ? target : { ...target, health: target.health - request.event.damage };
    targets[index] = damaged;
    metrics = recordDamage(metrics, request.event);
    const killed = captureKillContext(damaged, healthBefore, request.event, request.sourceProjectile, request.burn);
    if (killed) {
      killContexts.push(killed);
      metrics = recordKill(metrics, damaged.id);
    }
  }
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
          reactiveEffectIds: projectile.reactiveEffectIds,
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
        effectId: "lastBell.rings",
        rootTriggerId: projectile.rootTriggerId,
        lineageId: projectile.lineageId,
        destination: "world",
        bornAt: pulseAt,
        expiresAt: pulseAt + 0.2,
        geometry: radiusGeometry(projectile, pulse.radius),
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
      const key = `teslaBullets.link\0${link.id}\0${target.id}`;
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
        originPower: source.originPower,
        generation: source.generation,
        reactiveEffectIds: source.reactiveEffectIds,
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
  const liveProjectileIds = new Set(projectiles.map(({ id }) => id));
  cooldowns = Object.fromEntries(Object.entries(cooldowns).filter(([key, nextAllowedAt]) => {
    if (nextAllowedAt <= current.now) return false;
    const pairId = key.split("\0")[1];
    if (!pairId) return false;
    const [a, b] = pairId.split(":");
    return Boolean(a && b && liveProjectileIds.has(a) && liveProjectileIds.has(b));
  }));

  const currentWakeRule = context.build.areas.find((rule) => rule.kind === "trail");
  for (const segment of current.segments) {
    const source = segment.source;
    const previous = wakeTrails[source.lineageId];
    const wakeRule = currentWakeRule?.kind === "trail" && source.activatedEffectIds.includes(currentWakeRule.effectId)
      ? currentWakeRule
      : previous && source.activatedEffectIds.includes(previous.effectId) ? {
        artifactId: previous.artifactId,
        effectId: previous.effectId,
        width: previous.width,
        duration: previous.duration,
        tickRate: 1 / previous.tickInterval,
        damageScale: previous.damageScale,
        cooldown: previous.cooldown,
      } : undefined;
    if (!wakeRule || source.generation !== 0 || segment.distance <= EPSILON) continue;
    const bornAt = current.now - context.dt + segment.startTime * context.dt;
    const completeAt = current.now - context.dt + segment.endTime * context.dt;
    const wakeSegment = {
      id: `${source.lineageId}:${current.step}:${segment.index}`,
      from: { ...segment.from },
      to: { ...segment.to },
      bornAt,
      completeAt,
      expiresAt: completeAt + wakeRule.duration,
      duration: wakeRule.duration,
      width: wakeRule.width,
      damage: segment.startDamage * wakeRule.damageScale,
      sourceProjectile: immutableProjectileSnapshot(source),
    };
    const segments = [
      ...(previous?.segments ?? []),
      wakeSegment,
    ].sort((a, b) => a.bornAt - b.bornAt || a.id.localeCompare(b.id));
    wakeTrails[source.lineageId] = {
      lineageId: source.lineageId,
      rootTriggerId: source.rootTriggerId,
      artifactId: wakeRule.artifactId,
      effectId: wakeRule.effectId,
      nextTickAt: previous?.nextTickAt ?? bornAt + 1 / wakeRule.tickRate,
      tickInterval: 1 / wakeRule.tickRate,
      cooldown: wakeRule.cooldown,
      width: wakeRule.width,
      duration: wakeRule.duration,
      damageScale: wakeRule.damageScale,
      segments,
    };
  }
  wakeTrails = Object.fromEntries(Object.entries(wakeTrails).flatMap(([lineageId, trail]) => {
    const segments = trail.segments;
    let nextTickAt = trail.nextTickAt;
    while (nextTickAt <= current.now + EPSILON) {
      const active = segments.flatMap((segment) => {
        if (nextTickAt < segment.bornAt - EPSILON || nextTickAt >= segment.expiresAt - EPSILON) return [];
        const formationDuration = segment.completeAt - segment.bornAt;
        if (formationDuration <= EPSILON) return [{ segment, from: segment.from, to: segment.to }];
        const endProgress = clamp((nextTickAt - segment.bornAt) / formationDuration, 0, 1);
        const rawStart = (nextTickAt - segment.duration - segment.bornAt) / formationDuration;
        const startProgress = clamp(rawStart + (rawStart >= 0 ? EPSILON : 0), 0, 1);
        if (endProgress < startProgress) return [];
        const pointAt = (progress: number) => ({
          x: segment.from.x + (segment.to.x - segment.from.x) * progress,
          y: segment.from.y + (segment.to.y - segment.from.y) * progress,
        });
        return [{ segment, from: pointAt(startProgress), to: pointAt(endProgress) }];
      });
      if (active.length > 0) targets = targets.map((target) => {
        if (!target.immortal && target.health <= 0) return target;
        const key = `${trail.effectId}\0${lineageId}\0${target.id}`;
        if (nextTickAt < (wakeCooldowns[key] ?? 0) - EPSILON) return target;
        const hit = active.find((candidate) => segmentCircleHitTime(
          candidate.from,
          candidate.to,
          target,
          target.radius + candidate.segment.width / 2,
        ) !== null);
        if (!hit) return target;
        const { segment } = hit;
        const source = segment.sourceProjectile;
        const healthBefore = target.health;
        const damaged = target.immortal ? target : { ...target, health: target.health - segment.damage };
        const event: DamageEvent = {
          source: "area",
          damage: segment.damage,
          time: nextTickAt,
          targetId: target.id,
          artifactId: trail.artifactId,
          effectId: trail.effectId,
          rootTriggerId: source.rootTriggerId,
          lineageId: source.lineageId,
          projectileId: source.id,
          killReactionDepth: 0,
          originPower: source.originPower,
          generation: source.generation,
          reactiveEffectIds: source.reactiveEffectIds,
          x: target.x,
          y: target.y,
        };
        metrics = recordDamage(metrics, event);
        const killed = captureKillContext(damaged, healthBefore, event, source);
        if (killed) {
          killContexts.push(killed);
          metrics = recordKill(metrics, damaged.id);
        }
        wakeCooldowns[key] = nextTickAt + trail.cooldown;
        return damaged;
      });
      nextTickAt += trail.tickInterval;
    }
    const liveSegments = segments.filter(({ expiresAt }) => tolerantDifference(expiresAt, current.now) > 0);
    if (liveSegments.length === 0) return [];
    if (liveSegments.length + 1 > 97) throw new Error(`Wake trail point bound exceeds 97 for ${lineageId}`);
    const expiresAt = Math.max(...liveSegments.map((segment) => segment.expiresAt));
    const vfxId = `area:wake:${lineageId}`;
    const prior = vfxCommands.find(({ id }) => id === vfxId);
    const command: VfxCommand = {
      id: vfxId,
      kind: "ectoplasmicWake.trail",
      artifactId: trail.artifactId,
      effectId: trail.effectId,
      rootTriggerId: trail.rootTriggerId,
      lineageId,
      destination: "world",
      bornAt: prior?.bornAt ?? liveSegments[0]!.bornAt,
      expiresAt,
      geometry: Object.freeze({
        type: "polyline",
        segments: Object.freeze(liveSegments.map((segment) => Object.freeze({
          from: immutablePoint(segment.from),
          to: immutablePoint(segment.to),
          bornAt: segment.bornAt,
          completeAt: segment.completeAt,
          expiresAt: segment.expiresAt,
          width: segment.width,
        }))),
      }),
    };
    const commandIndex = vfxCommands.findIndex(({ id }) => id === vfxId);
    if (commandIndex >= 0) vfxCommands[commandIndex] = command;
    else vfxCommands.push(command);
    return [[lineageId, { ...trail, nextTickAt, segments: liveSegments }]];
  }));
  const activeLineages = new Set(Object.keys(wakeTrails));
  wakeCooldowns = Object.fromEntries(Object.entries(wakeCooldowns).filter(([key, expiresAt]) => {
    const lineageId = key.split("\0")[1];
    return expiresAt > current.now && Boolean(lineageId && activeLineages.has(lineageId));
  }));

  const crossfireFor = (source: ProjectileState) => {
    const snapshot = source.behaviors.crossfire;
    return snapshot && source.activatedEffectIds.includes(snapshot.effectId) ? snapshot : undefined;
  };
  const paths = new Map<string, typeof current.segments>();
  for (const segment of current.segments) {
    if (segment.source.generation !== 0 || !crossfireFor(segment.source)) continue;
    paths.set(segment.projectileId, [...(paths.get(segment.projectileId) ?? []), segment]);
  }
  const candidates = buildSpatialCandidates([...paths].map(([id, segments]) => ({ id, segments })));
  const crossings = candidates.flatMap(({ id: pairId, a, b }) => {
    const found = (paths.get(a) ?? []).flatMap((aSegment) => (paths.get(b) ?? []).flatMap((bSegment) => {
      const crossing = crossingOf(aSegment, bSegment);
      if (!crossing) return [];
      const sharedBirth = crossing.aTime <= EPSILON && crossing.bTime <= EPSILON
        && Math.hypot(aSegment.from.x - bSegment.from.x, aSegment.from.y - bSegment.from.y) <= EPSILON;
      if (sharedBirth) return [];
      const aTerminal = current.terminalTimes[a];
      const bTerminal = current.terminalTimes[b];
      if ((aTerminal !== undefined && tolerantDifference(crossing.crossingTime, aTerminal) >= 0)
        || (bTerminal !== undefined && tolerantDifference(crossing.crossingTime, bTerminal) >= 0)) return [];
      return [{ pairId, a, b, aSegment, bSegment, ...crossing }];
    }));
    return found.sort((first, second) => first.crossingTime - second.crossingTime)[0] ?? [];
  }).sort((a, b) => a.crossingTime - b.crossingTime || a.pairId.localeCompare(b.pairId));

  for (const crossing of crossings) {
    if (crossfireParticipation[crossing.a] || crossfireParticipation[crossing.b]) continue;
    const crossfireRule = crossfireFor(crossing.aSegment.source)!;
    crossfireParticipation[crossing.a] = { rootTriggerId: crossing.aSegment.source.rootTriggerId, pairId: crossing.pairId };
    crossfireParticipation[crossing.b] = { rootTriggerId: crossing.bSegment.source.rootTriggerId, pairId: crossing.pairId };
    const damageAt = (segment: SweptSegment, time: number) => {
      const local = segment.endTime === segment.startTime ? 0 : (time - segment.startTime) / (segment.endTime - segment.startTime);
      return segment.startDamage + (segment.endDamage - segment.startDamage) * clamp(local, 0, 1);
    };
    const aDamage = damageAt(crossing.aSegment, crossing.aTime);
    const bDamage = damageAt(crossing.bSegment, crossing.bTime);
    const source = aDamage < bDamage || (aDamage === bDamage && crossing.a < crossing.b)
      ? crossing.aSegment.source : crossing.bSegment.source;
    const damage = Math.min(aDamage, bDamage) * crossfireRule.damageScale;
    const pulseAt = current.now - context.dt + crossing.crossingTime * context.dt;
    const direction = (segment: SweptSegment) => {
      const dx = segment.to.x - segment.from.x;
      const dy = segment.to.y - segment.from.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    };
    const aDirection = direction(crossing.aSegment);
    const bDirection = direction(crossing.bSegment);
    const half = crossfireRule.length / 2;
    targets = targets.map((target) => {
      if (!target.immortal && target.health <= 0) return target;
      const intersects = [aDirection, bDirection].some((axis) => segmentCircleHitTime(
        { x: crossing.point.x - axis.x * half, y: crossing.point.y - axis.y * half },
        { x: crossing.point.x + axis.x * half, y: crossing.point.y + axis.y * half },
        target,
        target.radius,
      ) !== null);
      if (!intersects) return target;
      const healthBefore = target.health;
      const damaged = target.immortal ? target : { ...target, health: target.health - damage };
      const event: DamageEvent = {
        source: "area",
        damage,
        time: pulseAt,
        targetId: target.id,
        artifactId: crossfireRule.artifactId,
        effectId: crossfireRule.effectId,
        rootTriggerId: source.rootTriggerId,
        lineageId: source.lineageId,
        projectileId: source.id,
        killReactionDepth: 0,
        originPower: source.originPower,
        generation: 0,
        reactiveEffectIds: source.reactiveEffectIds,
        x: target.x,
        y: target.y,
      };
      metrics = recordDamage(metrics, event);
      const killed = captureKillContext(damaged, healthBefore, event, source);
      if (killed) {
        killContexts.push(killed);
        metrics = recordKill(metrics, damaged.id);
      }
      return damaged;
    });
    crossfirePulses.push({
      id: `crossfire:${current.step}:${crossing.pairId}`,
      pairId: crossing.pairId,
      rootTriggerId: source.rootTriggerId,
      bornAt: pulseAt,
      expiresAt: pulseAt + crossfireRule.duration,
      x: crossing.point.x,
      y: crossing.point.y,
      ax: aDirection.x,
      ay: aDirection.y,
      bx: bDirection.x,
      by: bDirection.y,
      length: crossfireRule.length,
      damage,
      projectileId: source.id,
    });
    vfxCommands.push({
      id: `vfx-${nextId++}`,
      kind: "crossfireCovenant.cross",
      artifactId: crossfireRule.artifactId,
      effectId: crossfireRule.effectId,
      rootTriggerId: source.rootTriggerId,
      lineageId: source.lineageId,
      destination: "world",
      bornAt: pulseAt,
      expiresAt: pulseAt + crossfireRule.duration,
      geometry: Object.freeze({
        type: "pair",
        pairId: crossing.pairId,
        center: immutablePoint(crossing.point),
        length: crossfireRule.length,
        first: segmentGeometry(
          { x: crossing.point.x - aDirection.x * half, y: crossing.point.y - aDirection.y * half },
          { x: crossing.point.x + aDirection.x * half, y: crossing.point.y + aDirection.y * half },
        ),
        second: segmentGeometry(
          { x: crossing.point.x - bDirection.x * half, y: crossing.point.y - bDirection.y * half },
          { x: crossing.point.x + bDirection.x * half, y: crossing.point.y + bDirection.y * half },
        ),
      }),
    });
  }
  return {
    ...current,
    projectiles,
    targets,
    areas,
    vfxCommands,
    metrics,
    nextId,
    teslaLinks: links,
    teslaCooldowns: cooldowns,
    killContexts,
    wakeTrails,
    wakeCooldowns,
    crossfirePulses,
    crossfireParticipation,
  };
}

function sourceProjectileForKill(killed: KillContext, context: CombatContext): ProjectileState | undefined {
  if (killed.sourceProjectile) return killed.sourceProjectile;
  const snapshot = killed.sourceSnapshot;
  if (!snapshot) return undefined;
  const source = materializeScheduled({
    at: snapshot.triggeredAt,
    generation: 0,
    rootTriggerId: killed.rootTriggerId,
    rootIndex: snapshot.rootIndex,
    localOrdinal: snapshot.localOrdinal,
    lineageId: killed.lineageId ?? `${killed.rootTriggerId}:${snapshot.localOrdinal}`,
    effectIds: snapshot.effectIds,
    reactiveEffectIds: killed.reactiveEffectIds,
    spec: snapshot.spec,
    origin: Object.freeze({ x: killed.x, y: killed.y }),
    aim: snapshot.spec.heading,
    exactOrigin: true,
  }, context, snapshot.triggeredAt, `reactive-source:${killed.rootTriggerId}:${snapshot.localOrdinal}`, 0, 1);
  return immutableProjectileSnapshot({
    ...source,
    x: killed.x,
    y: killed.y,
    damage: killed.originPower,
    originPower: killed.originPower,
  });
}

function pruneInactiveRootState(current: CombatPhaseState): CombatPhaseState {
  const areas = current.areas.filter(({ expiresAt }) => expiresAt > current.now);
  const crossfirePulses = (current.crossfirePulses ?? []).filter(({ expiresAt }) => expiresAt > current.now);
  const activeRoots = new Set([
    ...(current.retainedRootIds ?? []),
    ...current.projectiles.map(({ rootTriggerId }) => rootTriggerId),
    ...current.scheduledProjectiles.map(({ rootTriggerId }) => rootTriggerId),
    ...current.pendingEmissions.map(({ rootTriggerId }) => rootTriggerId),
    ...areas.map(({ rootTriggerId }) => rootTriggerId),
    ...Object.values(current.wakeTrails ?? {}).map(({ rootTriggerId }) => rootTriggerId),
    ...crossfirePulses.map(({ rootTriggerId }) => rootTriggerId),
    ...statusRootIds(current.targets.map((target) => ({
      ...target,
      effects: normalizeTargetEffects(target.effects, current.now),
    })) as StatusTarget[]),
    ...(current.pendingRefunds ?? []).map(({ rootTriggerId }) => rootTriggerId),
  ]);
  return {
    ...current,
    validationRootIds: Object.freeze([...(current.retainedRootIds ?? [])]),
    areas,
    emittedEffects: Object.fromEntries(Object.entries(current.emittedEffects ?? {})
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    killReactionHistory: Object.fromEntries(Object.entries(current.killReactionHistory ?? {})
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    snareRoots: Object.fromEntries(Object.entries(current.snareRoots ?? {})
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    pendingEffectTokens: (current.pendingEffectTokens ?? [])
      .filter(({ rootTriggerId }) => rootTriggerId === undefined || activeRoots.has(rootTriggerId)),
    relayLedger: Object.fromEntries(Object.entries(current.relayLedger ?? {})
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    crossfirePulses,
    crossfireParticipation: Object.fromEntries(Object.entries(current.crossfireParticipation ?? {})
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    bigIronPairHits: Object.fromEntries(Object.entries(current.bigIronPairHits ?? {})
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    descendantsByRoot: Object.fromEntries(Object.entries(current.descendantsByRoot ?? {})
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    bonanzaHistory: Object.fromEntries(Object.entries(current.bonanzaHistory ?? {})
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
  };
}

export function resolveKillAndCleanupPhase(runtime: CombatRuntime | CombatPhaseState, context: CombatContext): CombatPhaseState {
  const current = phaseState(runtime, context);
  let targets = current.targets.map((target) => cloneTarget(target, current.now));
  const pendingEmissions = [...current.pendingEmissions];
  const emittedEffects = { ...(current.emittedEffects ?? {}) };
  const killReactionHistory = { ...(current.killReactionHistory ?? {}) };
  const deaths: Readonly<{ id: string; x: number; y: number }>[] = current.killContexts.map(({ victimId: id, x, y }) => ({ id, x, y }));
  const reactionDeaths: Readonly<{ id: string; x: number; y: number }>[] = [];
  let wantedBrand = current.wantedBrand;
  let metrics = current.metrics;
  let vfxCommands = [...current.vfxCommands];
  let nextId = current.nextId;
  const descendantsByRoot = { ...(current.descendantsByRoot ?? {}) };
  let pendingRefunds = [...(current.pendingRefunds ?? [])];
  let bonanzaHistory = { ...(current.bonanzaHistory ?? {}) };

  const bonanza = context.build.triggers.find((rule) => rule.kind === "ammoReturn");
  if (bonanza?.kind === "ammoReturn"
    || current.killContexts.some(({ reactiveEffectIds }) => reactiveEffectIds.includes("bonanzaClip.refund"))) {
    const delivery = bonanza?.kind === "ammoReturn" ? bonanza.delivery : 0.25;
    const queued = queueBonanzaRefunds(
      current.killContexts,
      bonanzaHistory,
      delivery,
      context.cylinder,
      pendingRefunds,
    );
    pendingRefunds = sortPendingRefunds([...pendingRefunds, ...queued.pendingRefunds]);
    bonanzaHistory = queued.history;
    for (const refund of queued.pendingRefunds) vfxCommands.push({
      id: `vfx-${nextId++}`,
      kind: "bonanza.delivery",
      artifactId: "bonanzaClip",
      effectId: refund.effectId,
      rootTriggerId: refund.rootTriggerId,
      ...(refund.lineageId ? { lineageId: refund.lineageId } : {}),
      destination: "hud",
      bornAt: refund.arrivesAt - delivery,
      expiresAt: refund.arrivesAt + 0.2,
      geometry: Object.freeze({
        type: "hudDelivery",
        from: immutablePoint(refund.from),
        slot: refund.slot,
        arrivesAt: refund.arrivesAt,
      }),
    });
  }

  for (const killed of current.killContexts) {
    const burn = killed.targetEffects?.burn;
    const cinder = context.build.areas.find((candidate) => candidate.kind === "explosion"
      && candidate.effectId === "cinderGospel.emberRing");
    if (killed.generation === 0 && killed.killReactionDepth === 0 && burn?.reactiveEligible
      && cinder?.kind === "explosion") {
      const key = rootEmissionKey(cinder.effectId, burn.rootTriggerId);
      if (!killReactionHistory[key]) {
        killReactionHistory[key] = { rootTriggerId: burn.rootTriggerId };
        targets = targets.map((target) => {
          if ((!target.immortal && target.health <= 0)
            || (target.x - killed.x) ** 2 + (target.y - killed.y) ** 2 > cinder.radius ** 2) return target;
          const damage = burn.originPower * cinder.damageScale;
          const healthBefore = target.health;
          const damaged = target.immortal ? target : { ...target, health: target.health - damage };
          const event: DamageEvent = {
            source: "reactive",
            damage,
            time: killed.time,
            targetId: target.id,
            artifactId: cinder.artifactId,
            effectId: cinder.effectId,
            rootTriggerId: burn.rootTriggerId,
            lineageId: burn.lineageId,
            projectileId: burn.projectileId,
            killReactionDepth: 1,
            originPower: burn.originPower,
            generation: 0,
            reactiveEffectIds: [],
            x: target.x,
            y: target.y,
          };
          metrics = recordDamage(metrics, event);
          if (!damaged.immortal && healthBefore > 0 && damaged.health <= 0) {
            metrics = recordKill(metrics, damaged.id);
            reactionDeaths.push({ id: damaged.id, x: damaged.x, y: damaged.y });
          }
          return damaged;
        });
        vfxCommands.push({
          id: `vfx-${nextId++}`,
          kind: "cinderGospel.emberRing",
          artifactId: cinder.artifactId,
          effectId: cinder.effectId,
          rootTriggerId: burn.rootTriggerId,
          ...(burn.lineageId ? { lineageId: burn.lineageId } : {}),
          destination: "world",
          bornAt: killed.time,
          expiresAt: killed.time + 0.25,
          geometry: radiusGeometry(killed, cinder.radius),
        });
      }
    }

    if (killed.generation !== 0 || killed.killReactionDepth !== 0) continue;
    const snapshottedRule = killed.sourceSnapshot?.killReaction?.rule;
    const rule = snapshottedRule && killed.reactiveEffectIds.includes(snapshottedRule.effectId)
      ? snapshottedRule
      : context.build.emissions.find((candidate) => candidate.kind === "killSpirits"
        && killed.reactiveEffectIds.includes(candidate.effectId));
    if (!rule || rule.kind !== "killSpirits") continue;
    const sourceProjectile = sourceProjectileForKill(killed, context);
    if (!sourceProjectile) continue;
    const key = rootEmissionKey(rule.effectId, killed.rootTriggerId);
    if (emittedEffects[key]) continue;
    const source = cloneProjectile({
      ...sourceProjectile,
      rootTriggerId: killed.rootTriggerId,
      lineageId: killed.lineageId ?? sourceProjectile.lineageId,
      activatedEffectIds: killed.sourceSnapshot?.effectIds ?? killed.reactiveEffectIds,
      x: killed.x,
      y: killed.y,
      damage: killed.originPower,
      originPower: killed.originPower,
      emittedEffectIds: sourceProjectile.emittedEffectIds.filter((effectId) => effectId !== rule.effectId),
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
    const previousDescendants = descendantsByRoot[killed.rootTriggerId];
    const descendantCount = (previousDescendants?.count ?? 0) + specs.length;
    const descendantLimit = Math.min(294, previousDescendants?.limit
      ?? killed.sourceSnapshot?.killReaction?.descendantLimit
      ?? context.build.maxDescendants);
    if (descendantCount > descendantLimit) {
      throw new DescendantOverflowError(killed.rootTriggerId, descendantLimit);
    }
    descendantsByRoot[killed.rootTriggerId] = {
      rootTriggerId: killed.rootTriggerId,
      count: descendantCount,
      limit: descendantLimit,
    };
    const childIds = Array.from({ length: rule.count }, () => `projectile-${nextId++}`);
    pendingEmissions.push(buildGenerationOneEmission(source, rule, specs, current.step, {
      childIds,
      origin: killed,
      emissionEffectIds: [...new Set([...context.build.emissions.map(({ effectId }) => effectId), rule.effectId])],
      soulTargetIds: selected.map((target) => target?.id),
    }));
    emittedEffects[key] = { rootTriggerId: killed.rootTriggerId };
  }

  const brandRule = context.build.impacts.find((rule) => rule.kind === "brand");
  if (brandRule?.kind === "brand") {
    for (const death of [...deaths, ...reactionDeaths]) {
      wantedBrand = jumpWantedBrand(
        wantedBrand,
        death,
        targets.map((target) => ({ ...target, effects: normalizeTargetEffects(target.effects, current.now) })) as StatusTarget[],
        current.now,
        brandRule.jumpRadius,
      );
    }
  } else wantedBrand = undefined;
  vfxCommands = vfxCommands.filter(({ kind }) => kind !== "wantedBrand.mark");
  if (wantedBrand && current.now < wantedBrand.expiresAt) {
    const marked = targets.find(({ id }) => id === wantedBrand!.targetId);
    if (marked && (marked.immortal || marked.health > 0)) vfxCommands.push({
      id: `status:wantedBrand.mark:${marked.id}`,
      kind: "wantedBrand.mark",
      artifactId: wantedBrand.artifactId,
      effectId: wantedBrand.effectId,
      rootTriggerId: wantedBrand.rootTriggerId,
      ...(wantedBrand.lineageId ? { lineageId: wantedBrand.lineageId } : {}),
      destination: "world",
      bornAt: wantedBrand.markedAt,
      expiresAt: wantedBrand.expiresAt,
      geometry: targetGeometry(marked.id, marked),
    });
    else wantedBrand = undefined;
  } else wantedBrand = undefined;

  targets = targets
    .filter((target) => target.immortal || target.health > 0)
    .map((target) => cloneTarget(target, current.now));
  return pruneInactiveRootState({
    ...current,
    targets,
    pendingEmissions,
    vfxCommands: vfxCommands.filter(({ expiresAt }) => expiresAt > current.now),
    metrics: retainTargetMetrics(metrics, targets.map(({ id }) => id)),
    events: [],
    segments: [],
    emissionRequests: [],
    killContexts: [],
    terminalTimes: {},
    nextId,
    emittedEffects,
    killReactionHistory,
    wantedBrand,
    descendantsByRoot,
    pendingRefunds,
    bonanzaHistory,
  });
}

export function resolveRootCleanupPhase(
  runtime: CombatRuntime | CombatPhaseState,
  context: CombatContext,
  retainedRootIds: readonly string[],
): CombatPhaseState {
  const roots = Object.freeze([...retainedRootIds]);
  const resolved = pruneInactiveRootState(phaseState({
    ...runtime,
    retainedRootIds: roots,
    validationRootIds: roots,
  }, context));
  assertRuntime(resolved, context);
  return resolved;
}

export function resolveReactiveKillPhase(
  runtime: CombatRuntime | CombatPhaseState,
  context: CombatContext,
  killContexts: readonly KillContext[],
): CombatPhaseState {
  const resolved = resolveKillAndCleanupPhase({
    ...phaseState(runtime, context),
    killContexts: Object.freeze([...killContexts]),
  }, context);
  assertRuntime(resolved, context);
  return resolved;
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
