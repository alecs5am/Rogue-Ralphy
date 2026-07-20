import { createMetrics, recordDamage, recordKill, recordTrigger, retainTargetMetrics, summarizeMetrics, type Metrics } from "./metrics";
import { advanceReload, ammoCount, attemptActiveReload, consumeRound, createCylinder, fireRateBuffAt, startReload, type CylinderState } from "./cylinder";
import { compileCombatBuild, type CombatBuild } from "./combat-build";
import { deriveWeapon, type ArtifactId, type ArtifactLoadout, type DerivedWeapon } from "./weapon";
import { type PendingEffectToken, type ProjectileState, type TeslaLink } from "./projectiles";
import { ROOM, ROOM_PROPS, TILE_SIZE, type Point } from "./room";
import { expandTrigger, type LocketState, type PlayerSatelliteState, type ScheduledProjectile } from "./trigger";
import {
  resolveCombatPhases,
  resolveReactiveKillPhase,
  resolveRootCleanupPhase,
  type AreaState,
  type CombatTargetState,
  type KillContext,
  type PendingEmission,
  type VfxCommand,
} from "./combat-effects";
import {
  createTargetEffects,
  effectiveSlow,
  normalizeTargetEffects,
  snareSlowAt,
  statusRootIds,
  type RootStatusRecord,
  type SnareAreaState,
  type WantedBrand,
} from "./statuses";
import type {
  BigIronPairHit,
  CrossfireParticipation,
  CrossfirePulseState,
  DescendantRecord,
  WakeTrailState,
} from "./areas";
import {
  advanceLocketOrbitals,
  createLocketOrbital,
  resolveBoundaryClamp,
  resolvePendingRefunds,
  resolveStillwater,
  type DecoyState,
  type PendingRefund,
  type ProtectiveOrbital,
  type RecoilWindow,
  type StillwaterState,
} from "./reactive";

export { ROOM, TILE_SIZE } from "./room";
export type { Point } from "./room";

export type InputIntent = {
  moveX: number; moveY: number; aimX: number; aimY: number;
  firing: boolean; reloadPressed: boolean; paused: boolean;
};

export type PlayerState = Point & {
  vx: number; vy: number;
  radius: number; health: number; maxHealth: number; speed: number; invulnerableUntil: number;
};

export type Resources = { coins: number; bombs: number; keys: number };
export const clampResource = (value: number): number => Math.max(0, Math.min(99, Math.trunc(value)));

export type TargetState = CombatTargetState;

export type { ProjectileState } from "./projectiles";

export type GameState = {
  room: { width: number; height: number; minX: number; maxX: number; minY: number; maxY: number };
  player: PlayerState; aim: Point; artifacts: ArtifactLoadout; build: CombatBuild; weapon: DerivedWeapon;
  resources: Resources;
  cylinder: CylinderState; scheduledProjectiles: ScheduledProjectile[]; pendingEmissions: PendingEmission[];
  projectiles: ProjectileState[]; targets: TargetState[]; areas: AreaState[]; vfxCommands: VfxCommand[];
  teslaLinks: TeslaLink[]; teslaCooldowns: Record<string, number>;
  satellites: PlayerSatelliteState[];
  wakeTrails: Record<string, WakeTrailState>; wakeCooldowns: Record<string, number>;
  crossfirePulses: CrossfirePulseState[]; crossfireParticipation: Record<string, CrossfireParticipation>;
  bigIronPairHits: Record<string, BigIronPairHit>; descendantsByRoot: Record<string, DescendantRecord>;
  relayLedger: Record<string, Readonly<{ rootTriggerId: string }>>;
  emittedEffects: Record<string, Readonly<{ rootTriggerId: string; lineageId?: string }>>;
  pendingEffectTokens: PendingEffectToken[];
  wantedBrand?: WantedBrand;
  hexCounter: number;
  snareRoots: Record<string, RootStatusRecord>;
  killReactionHistory: Record<string, RootStatusRecord>;
  metrics: Metrics; telemetry: ReturnType<typeof summarizeMetrics>;
  time: number; step: number; nextShotAt: number; nextId: number; rootSequence: number; paused: boolean; rng: () => number;
  dealerCounter: number; locketState: LocketState;
  stillwater: StillwaterState;
  recoilWindows: RecoilWindow[];
  pendingRefunds: PendingRefund[];
  bonanzaHistory: Record<string, RootStatusRecord>;
  locketOrbitals: ProtectiveOrbital[];
  decoy?: DecoyState;
  lastShotAt: number | null; lastHurtAt: number | null; diedAt: number | null;
};

const tileCenter = (column: number, row: number): Point => ({
  x: (column + 1.5) * TILE_SIZE,
  y: (row + 1.5) * TILE_SIZE,
});

const PLAYER = {
  x: ROOM.width / 2,
  y: ROOM.height / 2,
  vx: 0,
  vy: 0,
  radius: 18,
  health: 100,
  maxHealth: 100,
  speed: 240,
  invulnerableUntil: 0,
} as const;

const PLAYER_ACCELERATION = 800;

const DUMMY_POINTS: Point[] = [
  tileCenter(10, 3), tileCenter(10, 2), tileCenter(10, 4),
  tileCenter(8, 2), tileCenter(8, 4), tileCenter(11, 2), tileCenter(11, 4),
];
const EDGE_POINTS: Point[] = [
  tileCenter(1, 0), tileCenter(4, 0), tileCenter(8, 0), tileCenter(11, 0),
  tileCenter(12, 3), tileCenter(11, 6), tileCenter(8, 6), tileCenter(4, 6),
  tileCenter(1, 6), tileCenter(0, 3),
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const exceeds = (value: number, limit: number): boolean =>
  value - limit > Number.EPSILON * 128 * Math.max(1, Math.abs(value), Math.abs(limit));
function moveVelocityToward(
  vx: number,
  vy: number,
  targetVx: number,
  targetVy: number,
  maxDelta: number,
): { vx: number; vy: number } {
  const dx = targetVx - vx;
  const dy = targetVy - vy;
  const distance = Math.hypot(dx, dy);
  const tolerance = Number.EPSILON * 128 * Math.max(1, distance, maxDelta, Math.abs(vx), Math.abs(vy), Math.abs(targetVx), Math.abs(targetVy));
  if (distance === 0 || (maxDelta > 0 && distance <= maxDelta + tolerance)) return { vx: targetVx, vy: targetVy };
  const scale = maxDelta / distance;
  return { vx: vx + dx * scale, vy: vy + dy * scale };
}
const distanceSquared = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const overlaps = (a: Point & { radius: number }, b: Point & { radius: number }) => distanceSquared(a, b) < (a.radius + b.radius) ** 2;

export function createGame(rng: () => number = Math.random): GameState {
  const artifacts: ArtifactLoadout = {};
  const build = compileCombatBuild(artifacts);
  const weapon = deriveWeapon(build, 0);
  const metrics = createMetrics();
  return {
    room: ROOM,
    player: { ...PLAYER },
    aim: { x: 900, y: 270 },
    artifacts,
    build,
    resources: { coins: 0, bombs: 0, keys: 0 },
    weapon,
    cylinder: createCylinder(weapon.capacity),
    scheduledProjectiles: [],
    pendingEmissions: [],
    projectiles: [],
    targets: [],
    areas: [],
    vfxCommands: [],
    teslaLinks: [],
    teslaCooldowns: {},
    satellites: [],
    wakeTrails: {},
    wakeCooldowns: {},
    crossfirePulses: [],
    crossfireParticipation: {},
    bigIronPairHits: {},
    descendantsByRoot: {},
    relayLedger: {},
    emittedEffects: {},
    pendingEffectTokens: [],
    hexCounter: 0,
    snareRoots: {},
    killReactionHistory: {},
    metrics,
    telemetry: summarizeMetrics(metrics, 0),
    time: 0,
    step: 0,
    nextShotAt: 0,
    nextId: 1,
    rootSequence: 0,
    dealerCounter: 0,
    locketState: { armed: false, cadence: 0 },
    stillwater: { progress: 0, charged: false },
    recoilWindows: [],
    pendingRefunds: [],
    bonanzaHistory: {},
    locketOrbitals: [],
    paused: false,
    lastShotAt: null,
    lastHurtAt: null,
    diedAt: null,
    rng,
  };
}

export function setArtifact(state: GameState, id: ArtifactId, enabled: boolean): GameState {
  if (typeof enabled !== "boolean") throw new Error("artifact enabled must be boolean");
  const artifacts = { ...state.artifacts };
  if (enabled) artifacts[id] = true;
  else delete artifacts[id];
  return setArtifactLoadout(state, artifacts);
}

export function setArtifactLoadout(state: GameState, loadout: ArtifactLoadout): GameState {
  const artifacts = { ...loadout };
  const build = compileCombatBuild(artifacts);
  return {
    ...state,
    artifacts,
    build,
    weapon: deriveWeapon(build, fireRateBuffAt(state.cylinder, state.time)),
    stillwater: artifacts.stillwater ? state.stillwater : { progress: 0, charged: false },
    locketState: artifacts.lastGaspLocket ? state.locketState : { armed: false, cadence: 0 },
  };
}

function canSpawn(state: GameState, point: Point, radius: number): boolean {
  if (point.x - radius < state.room.minX || point.x + radius > state.room.maxX ||
      point.y - radius < state.room.minY || point.y + radius > state.room.maxY) return false;
  const body = { ...point, radius };
  return !overlaps(body, state.player) && state.targets.every((target) => !overlaps(body, target));
}

export function spawnDummy(state: GameState, position?: Point): GameState {
  const point = position ?? DUMMY_POINTS.find((candidate) => canSpawn(state, candidate, 22));
  if (!point || !canSpawn(state, point, 22)) return state;
  const target: TargetState = {
    ...point, id: `dummy-${state.nextId}`, kind: "dummy", radius: 22,
    health: 1, maxHealth: 1, immortal: true, speed: 0, frozenUntil: 0, effects: createTargetEffects(),
  };
  return { ...state, targets: [...state.targets, target], nextId: state.nextId + 1 };
}

export function spawnChaser(state: GameState, position?: Point): GameState {
  const point = position ?? (() => {
    const offset = Math.floor(state.rng() * EDGE_POINTS.length) % EDGE_POINTS.length;
    return Array.from({ length: EDGE_POINTS.length }, (_, index) => EDGE_POINTS[(offset + index) % EDGE_POINTS.length])
      .find((candidate): candidate is Point => candidate !== undefined && canSpawn(state, candidate, 18));
  })();
  if (!point || !canSpawn(state, point, 18)) return state;
  const target: TargetState = {
    ...point, id: `chaser-${state.nextId}`, kind: "chaser", radius: 18,
    health: 80, maxHealth: 80, immortal: false, speed: 85, frozenUntil: 0, effects: createTargetEffects(),
  };
  return { ...state, targets: [...state.targets, target], nextId: state.nextId + 1 };
}

export function spawnWave(state: GameState): GameState {
  let next = state;
  const offset = Math.floor(state.rng() * EDGE_POINTS.length) % EDGE_POINTS.length;
  for (let index = 0; index < EDGE_POINTS.length && next.targets.length - state.targets.length < 5; index += 1) {
    const point = EDGE_POINTS[(offset + index) % EDGE_POINTS.length];
    if (point) next = spawnChaser(next, point);
  }
  return next;
}

export function clearTargets(state: GameState): GameState {
  const metrics = retainTargetMetrics(state.metrics, []);
  const activeProjectileIds = new Set(state.projectiles.map(({ id }) => id));
  const activeRoots = new Set([
    ...state.locketOrbitals.map(({ rootTriggerId }) => rootTriggerId),
    ...state.projectiles.map(({ rootTriggerId }) => rootTriggerId),
    ...state.scheduledProjectiles.map(({ rootTriggerId }) => rootTriggerId),
    ...state.pendingRefunds.map(({ rootTriggerId }) => rootTriggerId),
  ]);
  const wakeTrails = Object.fromEntries(Object.entries(state.wakeTrails)
    .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId)));
  const activeWakeLineages = new Set(Object.keys(wakeTrails));
  return {
    ...state,
    targets: [],
    pendingEmissions: [],
    areas: [],
    vfxCommands: state.vfxCommands.filter(({ kind, expiresAt }) => kind === "bonanzaClip.delivery" && expiresAt > state.time),
    teslaLinks: [],
    teslaCooldowns: Object.fromEntries(Object.entries(state.teslaCooldowns).filter(([key, expiresAt]) => {
      if (expiresAt <= state.time) return false;
      const pairId = key.split("\0")[1];
      if (!pairId) return false;
      const [a, b] = pairId.split(":");
      return Boolean(a && b && activeProjectileIds.has(a) && activeProjectileIds.has(b));
    })),
    satellites: state.satellites.filter(({ expiresAt }) => expiresAt > state.time),
    wakeTrails,
    wakeCooldowns: Object.fromEntries(Object.entries(state.wakeCooldowns).filter(([key, expiresAt]) => {
      const lineageId = key.split("\0")[1];
      return expiresAt > state.time && Boolean(lineageId && activeWakeLineages.has(lineageId));
    })),
    crossfirePulses: [],
    crossfireParticipation: Object.fromEntries(Object.entries(state.crossfireParticipation)
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    bigIronPairHits: Object.fromEntries(Object.entries(state.bigIronPairHits)
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    descendantsByRoot: Object.fromEntries(Object.entries(state.descendantsByRoot)
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    relayLedger: Object.fromEntries(Object.entries(state.relayLedger)
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    emittedEffects: Object.fromEntries(Object.entries(state.emittedEffects)
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    pendingEffectTokens: state.pendingEffectTokens
      .filter(({ rootTriggerId }) => rootTriggerId === undefined || activeRoots.has(rootTriggerId)),
    wantedBrand: undefined,
    snareRoots: Object.fromEntries(Object.entries(state.snareRoots)
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    killReactionHistory: Object.fromEntries(Object.entries(state.killReactionHistory)
      .filter(([, { rootTriggerId }]) => activeRoots.has(rootTriggerId))),
    metrics,
    telemetry: summarizeMetrics(metrics, state.time),
  };
}
export const resetLab = (state: GameState): GameState => createGame(state.rng);

export function updateGame(state: GameState, input: InputIntent, dt: number, now: number): GameState {
  if (input.paused) return state.paused ? state : { ...state, paused: true };

  let lastShotAt = state.lastShotAt;
  let lastHurtAt = state.lastHurtAt;
  let diedAt = state.diedAt;
  const canAct = diedAt === null && state.player.health > 0;
  let decoy = state.decoy && state.decoy.expiresAt > now ? state.decoy : undefined;
  let recoilWindows = state.recoilWindows.filter(({ expiresAt, refunded }) => expiresAt > now && !refunded);
  let pendingRefunds = [...state.pendingRefunds];
  const validationRootIds = Object.freeze([
    ...state.locketOrbitals.map(({ rootTriggerId }) => rootTriggerId),
    ...statusRootIds(state.targets.map((target) => ({
      ...target,
      effects: normalizeTargetEffects(target.effects, state.time),
    }))),
  ]);
  let locketOrbitals = state.locketOrbitals.filter(({ expiresAt }) => expiresAt > now);
  let cylinder = advanceReload(state.cylinder, now);
  if (now >= cylinder.buffUntil && cylinder.fireRateBuff !== 0) cylinder = { ...cylinder, fireRateBuff: 0, buffUntil: 0 };
  let weapon = deriveWeapon(state.build, fireRateBuffAt(cylinder, now));
  if (canAct && input.reloadPressed) {
    if (cylinder.reloading && weapon.activeWindow > 0) cylinder = attemptActiveReload(cylinder, weapon, now);
    else if (!cylinder.reloading && ammoCount(cylinder) < weapon.capacity) cylinder = startReload(cylinder, weapon, now, "manual");
    weapon = deriveWeapon(state.build, fireRateBuffAt(cylinder, now));
  }

  const magnitude = Math.hypot(input.moveX, input.moveY);
  const movementScale = magnitude > 1 ? 1 / magnitude : 1;
  const velocity = canAct
    ? moveVelocityToward(
      state.player.vx,
      state.player.vy,
      input.moveX * movementScale * state.player.speed,
      input.moveY * movementScale * state.player.speed,
      PLAYER_ACCELERATION * dt,
    )
    : { vx: 0, vy: 0 };
  const nextX = state.player.x + velocity.vx * dt;
  const nextY = state.player.y + velocity.vy * dt;
  const x = clamp(nextX, state.room.minX + state.player.radius, state.room.maxX - state.player.radius);
  const y = clamp(nextY, state.room.minY + state.player.radius, state.room.maxY - state.player.radius);
  let player: PlayerState = {
    ...state.player,
    x,
    y,
    vx: x === nextX ? velocity.vx : 0,
    vy: y === nextY ? velocity.vy : 0,
  };
  const boundary = resolveBoundaryClamp({ recoilWindows, pendingRefunds }, {
    left: x !== nextX && velocity.vx < 0,
    right: x !== nextX && velocity.vx > 0,
    top: y !== nextY && velocity.vy < 0,
    bottom: y !== nextY && velocity.vy > 0,
  }, now, player);
  recoilWindows = boundary.recoilWindows;
  pendingRefunds = boundary.pendingRefunds;
  let stillwater = resolveStillwater(
    state.stillwater,
    state.artifacts.stillwater === true,
    Math.hypot(player.vx, player.vy),
    dt,
    false,
  );
  const aim = { x: input.aimX, y: input.aimY };
  let metrics = state.metrics;
  let scheduledProjectiles = [...state.scheduledProjectiles];
  let rootSequence = state.rootSequence;
  let dealerCounter = state.dealerCounter;
  let locketState: LocketState = state.artifacts.lastGaspLocket !== true || player.health > 40
    ? { armed: false, cadence: 0 }
    : state.locketState;
  let nextShotAt = state.nextShotAt;
  let satellites = state.satellites
    .filter(({ expiresAt }) => expiresAt > now)
    .map((satellite) => {
      const angle = satellite.phase + (now - satellite.bornAt) * Math.PI;
      return {
        ...satellite,
        x: player.x + Math.cos(angle) * satellite.radius,
        y: player.y + Math.sin(angle) * satellite.radius,
      };
    });
  let descendantsByRoot = { ...state.descendantsByRoot };

  if (canAct && input.firing && !cylinder.reloading && ammoCount(cylinder) > 0 && now >= nextShotAt) {
    const aimAngle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    const consumed = consumeRound(cylinder);
    rootSequence += 1;
    const trigger = expandTrigger({
      rootTriggerId: `trigger-${rootSequence}`,
      rootIndex: rootSequence,
      round: consumed.round!,
      aim: aimAngle,
      aimDistance: Math.hypot(input.aimX - player.x, input.aimY - player.y),
      origin: player,
      now,
      stationaryCharged: stillwater.charged,
      health: player.health,
      activeOrbitalCount: locketOrbitals.length,
      dealerCounter,
      locketState,
      build: state.build,
      weapon,
      rng: state.rng,
      satellites,
    });
    if (trigger.projectiles.length > 0 || trigger.locketOrbital) lastShotAt = now;
    scheduledProjectiles.push(...trigger.projectiles);
    dealerCounter = trigger.dealerCounter;
    locketState = trigger.locketState;
    satellites = [...trigger.satellites];
    if (stillwater.charged) stillwater = { progress: 0, charged: false };
    if (trigger.locketOrbital) locketOrbitals.push(createLocketOrbital(trigger.locketOrbital, locketOrbitals, now));
    const recoil = state.build.triggers.find((rule) => rule.kind === "recoil");
    if (recoil?.kind === "recoil") {
      const vector = { x: -Math.cos(aimAngle) * recoil.impulse, y: -Math.sin(aimAngle) * recoil.impulse };
      player = { ...player, vx: player.vx + vector.x, vy: player.vy + vector.y };
      recoilWindows.push({
        effectId: "recoilBoots.recoil",
        rootTriggerId: trigger.rootTriggerId,
        rootIndex: trigger.rootIndex,
        vector,
        expiresAt: now + recoil.duration,
        refunded: false,
      });
    }
    const descendantCount = trigger.projectiles.filter(({ generation }) => generation === 1).length;
    if (descendantCount > 0 || state.build.maxDescendants > 0) descendantsByRoot[trigger.rootTriggerId] = {
      rootTriggerId: trigger.rootTriggerId,
      count: (descendantsByRoot[trigger.rootTriggerId]?.count ?? 0) + descendantCount,
      limit: Math.min(294, Math.max(state.build.maxDescendants, descendantCount)),
    };
    cylinder = consumed.state;
    metrics = recordTrigger(metrics);
    nextShotAt = now + 1 / weapon.fireRate;
    if (ammoCount(cylinder) === 0) cylinder = startReload(cylinder, weapon, now, "automatic");
  }

  const snares = state.areas.filter((area): area is SnareAreaState => "kind" in area && area.kind === "snare");
  const chasePoint = decoy ?? player;
  let targets = state.targets.map((target) => {
    const effects = normalizeTargetEffects(target.effects, now);
    const normalized = { ...target, frozenUntil: now < target.frozenUntil ? target.frozenUntil : 0, effects };
    if (target.kind !== "chaser" || now < target.frozenUntil) return normalized;
    const dx = chasePoint.x - target.x;
    const dy = chasePoint.y - target.y;
    const distance = Math.hypot(dx, dy) || 1;
    const slow = effectiveSlow(effects.slows, now, snareSlowAt(target, snares, now));
    return {
      ...normalized,
      x: clamp(target.x + dx / distance * target.speed * slow * dt, state.room.minX + target.radius, state.room.maxX - target.radius),
      y: clamp(target.y + dy / distance * target.speed * slow * dt, state.room.minY + target.radius, state.room.maxY - target.radius),
    };
  });

  let acceptedDamage = false;
  const coat = state.build.triggers.find((rule) => rule.kind === "hurtDecoy");
  for (const target of [...targets].sort((a, b) => a.id.localeCompare(b.id))) {
    if (target.kind === "chaser" && diedAt === null && overlaps(player, target) && now >= player.invulnerableUntil) {
      const preHit = { x: player.x, y: player.y };
      const health = Math.max(0, player.health - 10);
      acceptedDamage = true;
      lastHurtAt = now;
      if (health === 0) diedAt = now;
      const invulnerability = coat?.kind === "hurtDecoy" && health > 0 ? coat.invulnerability : 0.5;
      player = {
        ...player,
        health,
        vx: health === 0 ? 0 : player.vx,
        vy: health === 0 ? 0 : player.vy,
        invulnerableUntil: now + invulnerability,
      };
      if (coat?.kind === "hurtDecoy" && health > 0) decoy = { ...preHit, expiresAt: now + coat.duration };
      break;
    }
  }
  if (acceptedDamage) stillwater = resolveStillwater(stillwater, state.artifacts.stillwater === true, 0, 0, true);

  const combatContext = {
    dt,
    room: state.room,
    props: ROOM_PROPS,
    build: state.build,
    rng: state.rng,
    player,
    trajectoryTargets: targets,
    teslaLinks: state.teslaLinks,
    teslaCooldowns: state.teslaCooldowns,
    fireRate: weapon.fireRate,
  } as const;
  let combat = resolveCombatPhases({
    projectiles: state.projectiles,
    targets,
    scheduledProjectiles,
    pendingEmissions: state.pendingEmissions,
    areas: state.areas,
    vfxCommands: state.vfxCommands,
    metrics,
    nextId: state.nextId,
    step: state.step + 1,
    now,
    relayLedger: state.relayLedger,
    emittedEffects: state.emittedEffects,
    pendingEffectTokens: state.pendingEffectTokens,
    wantedBrand: state.wantedBrand,
    hexCounter: state.hexCounter,
    snareRoots: state.snareRoots,
    killReactionHistory: state.killReactionHistory,
    wakeTrails: state.wakeTrails,
    wakeCooldowns: state.wakeCooldowns,
    crossfirePulses: state.crossfirePulses,
    crossfireParticipation: state.crossfireParticipation,
    bigIronPairHits: state.bigIronPairHits,
    descendantsByRoot,
    pendingRefunds,
    bonanzaHistory: state.bonanzaHistory,
    retainedRootIds: Object.freeze(locketOrbitals.map(({ rootTriggerId }) => rootTriggerId)),
    validationRootIds,
  }, combatContext);
  metrics = combat.metrics;
  let finalTargets = [...combat.targets];
  let nextId = combat.nextId;
  let vfxCommands = [...combat.vfxCommands];
  const orbitalKills: KillContext[] = [];
  const orbitalResult = advanceLocketOrbitals(
    locketOrbitals,
    player,
    finalTargets.filter(({ kind }) => kind === "chaser"),
    dt,
    now,
  );
  locketOrbitals = orbitalResult.orbitals;
  for (const hit of orbitalResult.hits) {
    const target = finalTargets.find(({ id }) => id === hit.targetId);
    if (!target || (!target.immortal && target.health <= 0)) continue;
    const healthBefore = target.health;
    const damaged = target.immortal ? target : { ...target, health: target.health - hit.damage };
    finalTargets = finalTargets.map((candidate) => candidate.id === target.id ? damaged : candidate);
    metrics = recordDamage(metrics, {
      source: "reactive",
      damage: hit.damage,
      time: hit.time,
      targetId: hit.targetId,
      artifactId: hit.artifactId,
      effectId: hit.effectId,
      rootTriggerId: hit.rootTriggerId,
      lineageId: hit.lineageId,
      killReactionDepth: 0,
      originPower: hit.originPower,
      generation: 0,
      reactiveEffectIds: hit.reactiveEffectIds,
      x: hit.x,
      y: hit.y,
    });
    if (!damaged.immortal && healthBefore > 0 && damaged.health <= 0) {
      metrics = recordKill(metrics, damaged.id);
      orbitalKills.push(Object.freeze({
        victimId: damaged.id,
        x: damaged.x,
        y: damaged.y,
        time: hit.time,
        source: "reactive",
        generation: 0,
        reactiveEffectIds: Object.freeze([...hit.reactiveEffectIds]),
        artifactId: hit.artifactId,
        effectId: hit.effectId,
        rootTriggerId: hit.rootTriggerId,
        lineageId: hit.lineageId,
        originPower: hit.originPower,
        killReactionDepth: 0,
        sourceSnapshot: Object.freeze({
          rootIndex: hit.rootIndex,
          localOrdinal: hit.localOrdinal,
          triggeredAt: hit.triggeredAt,
          effectIds: Object.freeze([...new Set([...hit.eligibleEffectIds, ...hit.reactiveEffectIds])]),
          spec: hit.sourceSpec,
          killReaction: hit.killReaction,
        }),
        targetEffects: normalizeTargetEffects(damaged.effects, hit.time),
      }));
    }
    vfxCommands.push({
      id: `vfx-${nextId++}`,
      kind: "lastGaspLocket.consume",
      artifactId: "lastGaspLocket",
      effectId: "lastGaspLocket.orbital",
      rootTriggerId: hit.rootTriggerId,
      lineageId: hit.lineageId,
      destination: "world",
      bornAt: hit.time,
      expiresAt: hit.time + 0.2,
      x: hit.x,
      y: hit.y,
      targetId: hit.targetId,
    });
  }
  finalTargets = finalTargets.filter((target) => target.immortal || target.health > 0);
  if (orbitalKills.length > 0) {
    combat = resolveReactiveKillPhase({
      ...combat,
      targets: finalTargets,
      metrics,
      vfxCommands,
      nextId,
    }, combatContext, orbitalKills);
    metrics = combat.metrics;
    finalTargets = [...combat.targets];
    nextId = combat.nextId;
    vfxCommands = [...combat.vfxCommands];
  }

  const resolvedRefunds = resolvePendingRefunds(cylinder, combat.pendingRefunds ?? pendingRefunds, now);
  cylinder = resolvedRefunds.cylinder;
  pendingRefunds = resolvedRefunds.pendingRefunds;
  combat = resolveRootCleanupPhase({
    ...combat,
    targets: finalTargets,
    metrics,
    vfxCommands,
    nextId,
    pendingRefunds,
  }, combatContext, locketOrbitals.map(({ rootTriggerId }) => rootTriggerId));
  metrics = combat.metrics;
  finalTargets = [...combat.targets];
  nextId = combat.nextId;
  vfxCommands = [...combat.vfxCommands];
  pendingRefunds = [...(combat.pendingRefunds ?? [])];
  const bonanzaHistory = { ...(combat.bonanzaHistory ?? {}) };
  for (const refund of resolvedRefunds.resolved.filter(({ effectId }) => effectId === "recoilBoots.recoil")) {
    vfxCommands.push({
      id: `vfx-${nextId++}`,
      kind: "recoilBoots.skid",
      artifactId: "recoilBoots",
      effectId: refund.effectId,
      rootTriggerId: refund.rootTriggerId,
      lineageId: refund.lineageId,
      destination: "world",
      bornAt: now,
      expiresAt: now + 0.2,
      x: player.x,
      y: player.y,
    });
  }
  const priorStillwater = vfxCommands.find(({ id }) => id === "reactive:stillwater");
  const withoutReactiveState = vfxCommands.filter(({ id, kind }) =>
    id !== "reactive:stillwater" && id !== "reactive:coat" && kind !== "lastGaspLocket.orbital");
  if (state.artifacts.stillwater && (stillwater.progress > 0 || stillwater.charged)) withoutReactiveState.push({
    id: "reactive:stillwater",
    kind: "stillwater.ward",
    artifactId: "stillwater",
    effectId: "stillwater.charge",
    rootTriggerId: "player",
    destination: "world",
    bornAt: Math.max(priorStillwater?.bornAt ?? now - stillwater.progress, now - 2.9),
    expiresAt: now + 1 / 120,
    x: player.x,
    y: player.y,
  });
  if (decoy) withoutReactiveState.push({
    id: "reactive:coat",
    kind: "undertakersCoat.decoy",
    artifactId: "undertakersCoat",
    effectId: "undertakersCoat.decoy",
    rootTriggerId: "player",
    destination: "world",
    bornAt: decoy.expiresAt - 1,
    expiresAt: decoy.expiresAt,
    x: decoy.x,
    y: decoy.y,
  });
  for (const orbital of locketOrbitals) withoutReactiveState.push({
    id: `reactive:${orbital.id}`,
    kind: "lastGaspLocket.orbital",
    artifactId: "lastGaspLocket",
    effectId: "lastGaspLocket.orbital",
    rootTriggerId: orbital.rootTriggerId,
    lineageId: orbital.lineageId,
    destination: "world",
    bornAt: orbital.bornAt,
    expiresAt: orbital.expiresAt,
    x: player.x + Math.cos(orbital.angle) * orbital.radius,
    y: player.y + Math.sin(orbital.angle) * orbital.radius,
  });
  const recoilRule = state.build.triggers.find((rule) => rule.kind === "recoil");
  const reloadRule = state.build.triggers.find((rule) => rule.kind === "activeReload");
  const maximumFireRate = deriveWeapon(state.build, reloadRule?.kind === "activeReload" ? reloadRule.buff : 0).fireRate;
  const recoilBound = Math.ceil(maximumFireRate * (recoilRule?.kind === "recoil" ? recoilRule.duration : 0.35));
  if (recoilWindows.length > recoilBound) throw new Error(`Recoil window count exceeds derived bound ${recoilBound}`);
  if (locketOrbitals.length > 3) throw new Error("Last Gasp Locket orbital cap exceeds three");
  const vfxIds = withoutReactiveState.map(({ id }) => id);
  if (new Set(vfxIds).size !== vfxIds.length) throw new Error("duplicate reactive VFX id");
  if (withoutReactiveState.some(({ artifactId, effectId, rootTriggerId, destination, bornAt, expiresAt }) =>
    !artifactId || !effectId || !rootTriggerId || (destination !== "world" && destination !== "hud")
    || expiresAt <= bornAt || exceeds(expiresAt - bornAt, 3))) {
    throw new Error("invalid reactive VFX provenance or lifetime");
  }
  metrics = { ...metrics, hitEvents: metrics.hitEvents.filter(({ time }) => time > now - 3) };
  const telemetry = summarizeMetrics(metrics, now);
  const next: GameState = {
    ...state,
    player,
    aim,
    weapon,
    cylinder,
    scheduledProjectiles: [...combat.scheduledProjectiles],
    pendingEmissions: [...combat.pendingEmissions],
    projectiles: [...combat.projectiles],
    targets: finalTargets,
    areas: [...combat.areas],
    vfxCommands: withoutReactiveState,
    teslaLinks: [...combat.teslaLinks],
    teslaCooldowns: { ...combat.teslaCooldowns },
    satellites,
    wakeTrails: { ...(combat.wakeTrails ?? {}) },
    wakeCooldowns: { ...(combat.wakeCooldowns ?? {}) },
    crossfirePulses: [...(combat.crossfirePulses ?? [])],
    crossfireParticipation: { ...(combat.crossfireParticipation ?? {}) },
    bigIronPairHits: { ...(combat.bigIronPairHits ?? {}) },
    descendantsByRoot: { ...(combat.descendantsByRoot ?? {}) },
    relayLedger: { ...(combat.relayLedger ?? {}) },
    emittedEffects: { ...(combat.emittedEffects ?? {}) },
    pendingEffectTokens: [...(combat.pendingEffectTokens ?? [])],
    wantedBrand: combat.wantedBrand,
    hexCounter: combat.hexCounter ?? 0,
    snareRoots: { ...(combat.snareRoots ?? {}) },
    killReactionHistory: { ...(combat.killReactionHistory ?? {}) },
    pendingRefunds,
    bonanzaHistory,
    recoilWindows,
    stillwater,
    locketOrbitals,
    decoy,
    metrics,
    telemetry,
    time: now,
    step: combat.step,
    nextShotAt,
    nextId,
    rootSequence,
    dealerCounter,
    locketState,
    paused: false,
    lastShotAt,
    lastHurtAt,
    diedAt,
  };
  if (next.wantedBrand === undefined) delete next.wantedBrand;
  if (next.decoy === undefined) delete next.decoy;
  return next;
}
