import { createMetrics, recordTrigger, retainTargetMetrics, summarizeMetrics, type Metrics } from "./metrics";
import { advanceReload, ammoCount, attemptActiveReload, consumeRound, createCylinder, fireRateBuffAt, startReload, type CylinderState } from "./cylinder";
import { compileCombatBuild, type CombatBuild } from "./combat-build";
import { deriveWeapon, type ArtifactId, type ArtifactLoadout, type DerivedWeapon } from "./weapon";
import { type ProjectileState, type TeslaLink } from "./projectiles";
import { ROOM, ROOM_PROPS, TILE_SIZE, type Point } from "./room";
import { expandTrigger, type LocketState, type ScheduledProjectile } from "./trigger";
import {
  resolveCombatPhases,
  type AreaState,
  type CombatTargetState,
  type PendingEmission,
  type VfxCommand,
} from "./combat-effects";

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
  relayLedger: Record<string, Readonly<{ rootTriggerId: string }>>;
  metrics: Metrics; telemetry: ReturnType<typeof summarizeMetrics>;
  time: number; step: number; nextShotAt: number; nextId: number; rootSequence: number; paused: boolean; rng: () => number;
  dealerCounter: number; locketState: LocketState;
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
    relayLedger: {},
    metrics,
    telemetry: summarizeMetrics(metrics, 0),
    time: 0,
    step: 0,
    nextShotAt: 0,
    nextId: 1,
    rootSequence: 0,
    dealerCounter: 0,
    locketState: { armed: false, cadence: 0 },
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
    health: 1, maxHealth: 1, immortal: true, speed: 0, frozenUntil: 0,
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
    health: 80, maxHealth: 80, immortal: false, speed: 85, frozenUntil: 0,
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
  const activeRoots = new Set([
    ...state.projectiles.map(({ rootTriggerId }) => rootTriggerId),
    ...state.scheduledProjectiles.map(({ rootTriggerId }) => rootTriggerId),
  ]);
  return {
    ...state,
    targets: [],
    pendingEmissions: [],
    areas: [],
    vfxCommands: [],
    teslaLinks: [],
    teslaCooldowns: {},
    relayLedger: Object.fromEntries(Object.entries(state.relayLedger)
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
  const aim = { x: input.aimX, y: input.aimY };
  let metrics = state.metrics;
  let scheduledProjectiles = [...state.scheduledProjectiles];
  let rootSequence = state.rootSequence;
  let dealerCounter = state.dealerCounter;
  let locketState: LocketState = player.health > 40 ? { armed: false, cadence: 0 } : state.locketState;
  let nextShotAt = state.nextShotAt;

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
      stationaryCharged: false,
      lowHealth: player.health <= 40,
      dealerCounter,
      locketState,
      build: state.build,
      weapon,
      rng: state.rng,
    });
    if (trigger.projectiles.length > 0) lastShotAt = now;
    scheduledProjectiles.push(...trigger.projectiles);
    dealerCounter = trigger.dealerCounter;
    locketState = trigger.locketState;
    cylinder = consumed.state;
    metrics = recordTrigger(metrics);
    nextShotAt = now + 1 / weapon.fireRate;
    if (ammoCount(cylinder) === 0) cylinder = startReload(cylinder, weapon, now, "automatic");
  }

  let targets = state.targets.map((target) => {
    if (target.kind !== "chaser" || now < target.frozenUntil) return { ...target };
    const dx = player.x - target.x;
    const dy = player.y - target.y;
    const distance = Math.hypot(dx, dy) || 1;
    return {
      ...target,
      x: clamp(target.x + dx / distance * target.speed * dt, state.room.minX + target.radius, state.room.maxX - target.radius),
      y: clamp(target.y + dy / distance * target.speed * dt, state.room.minY + target.radius, state.room.maxY - target.radius),
    };
  });

  for (const target of targets) {
    if (target.kind === "chaser" && diedAt === null && overlaps(player, target) && now >= player.invulnerableUntil) {
      const health = Math.max(0, player.health - 10);
      lastHurtAt = now;
      if (health === 0) diedAt = now;
      player = {
        ...player,
        health,
        vx: health === 0 ? 0 : player.vx,
        vy: health === 0 ? 0 : player.vy,
        invulnerableUntil: now + 0.5,
      };
      break;
    }
  }

  const combat = resolveCombatPhases({
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
  }, {
    dt,
    room: state.room,
    props: ROOM_PROPS,
    build: state.build,
    rng: state.rng,
    player,
    trajectoryTargets: state.targets,
    teslaLinks: state.teslaLinks,
    teslaCooldowns: state.teslaCooldowns,
    fireRate: weapon.fireRate,
  });
  metrics = combat.metrics;
  const telemetry = summarizeMetrics(metrics, now);
  return {
    ...state,
    player,
    aim,
    weapon,
    cylinder,
    scheduledProjectiles: [...combat.scheduledProjectiles],
    pendingEmissions: [...combat.pendingEmissions],
    projectiles: [...combat.projectiles],
    targets: [...combat.targets],
    areas: [...combat.areas],
    vfxCommands: [...combat.vfxCommands],
    teslaLinks: [...combat.teslaLinks],
    teslaCooldowns: { ...combat.teslaCooldowns },
    relayLedger: { ...(combat.relayLedger ?? {}) },
    metrics,
    telemetry,
    time: now,
    step: combat.step,
    nextShotAt,
    nextId: combat.nextId,
    rootSequence,
    dealerCounter,
    locketState,
    paused: false,
    lastShotAt,
    lastHurtAt,
    diedAt,
  };
}
