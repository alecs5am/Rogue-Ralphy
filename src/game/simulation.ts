import { createMetrics, recordHit, recordKill, recordProjectile, recordProjectileOutcome, recordTrigger, retainTargetMetrics, summarizeMetrics, type Metrics } from "./metrics";
import { advanceReload, attemptActiveReload, createReloadState, fireRateBuffAt, startReload, type ReloadState } from "./reload";
import { buildShot, deriveWeapon, type ArtifactId, type ArtifactLoadout, type DerivedWeapon, type ProjectileSpec } from "./weapon";

export type Point = { x: number; y: number };
export type InputIntent = {
  moveX: number; moveY: number; aimX: number; aimY: number;
  firing: boolean; reloadPressed: boolean; paused: boolean;
};

export type PlayerState = Point & {
  radius: number; health: number; maxHealth: number; speed: number; invulnerableUntil: number;
};

export type TargetState = Point & {
  id: string; kind: "dummy" | "chaser"; radius: number; health: number; maxHealth: number;
  speed: number; frozenUntil: number;
};

export type ProjectileState = Point & {
  id: string; vx: number; vy: number; phase: "orbit" | "flight";
  orbitElapsed: number; orbitDuration: number; orbitAngle: number; orbitRadius: number;
  damage: number; speed: number; radius: number; lifetime: number; bornAt: number;
  remainingBounces: number; bounceRetention: number;
  freezeChance: number; freezeDuration: number;
  homingTurnRate: number; homingRadius: number; hitTargetIds: string[]; everHit: boolean;
};

export type GameState = {
  room: { width: number; height: number; minX: number; maxX: number; minY: number; maxY: number };
  player: PlayerState; aim: Point; artifacts: ArtifactLoadout; weapon: DerivedWeapon;
  reload: ReloadState; projectiles: ProjectileState[]; targets: TargetState[];
  metrics: Metrics; telemetry: ReturnType<typeof summarizeMetrics>;
  time: number; nextShotAt: number; nextId: number; paused: boolean; rng: () => number;
};

export const TILE_SIZE = 64;
export const ROOM_COLUMNS = 13;
export const ROOM_ROWS = 7;
export const ROOM = {
  width: (ROOM_COLUMNS + 2) * TILE_SIZE,
  height: (ROOM_ROWS + 2) * TILE_SIZE,
  minX: TILE_SIZE,
  maxX: (ROOM_COLUMNS + 1) * TILE_SIZE,
  minY: TILE_SIZE,
  maxY: (ROOM_ROWS + 1) * TILE_SIZE,
} as const;

const tileCenter = (column: number, row: number): Point => ({
  x: (column + 1.5) * TILE_SIZE,
  y: (row + 1.5) * TILE_SIZE,
});

const PLAYER = {
  x: ROOM.width / 2,
  y: ROOM.height / 2,
  radius: 18,
  health: 100,
  maxHealth: 100,
  speed: 240,
  invulnerableUntil: 0,
} as const;

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
const distanceSquared = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const overlaps = (a: Point & { radius: number }, b: Point & { radius: number }) => distanceSquared(a, b) < (a.radius + b.radius) ** 2;

export function createGame(rng: () => number = Math.random): GameState {
  const artifacts: ArtifactLoadout = {};
  const weapon = deriveWeapon(artifacts, 0);
  const metrics = createMetrics();
  return {
    room: ROOM,
    player: { ...PLAYER },
    aim: { x: 900, y: 270 },
    artifacts,
    weapon,
    reload: createReloadState(weapon),
    projectiles: [],
    targets: [],
    metrics,
    telemetry: summarizeMetrics(metrics, 0),
    time: 0,
    nextShotAt: 0,
    nextId: 1,
    paused: false,
    rng,
  };
}

export function setArtifact(state: GameState, id: ArtifactId, enabled: boolean): GameState {
  if (typeof enabled !== "boolean") throw new Error("artifact enabled must be boolean");
  const artifacts = { ...state.artifacts };
  if (enabled) artifacts[id] = true;
  else delete artifacts[id];
  return {
    ...state,
    artifacts,
    weapon: deriveWeapon(artifacts, fireRateBuffAt(state.reload, state.time)),
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
    health: Number.POSITIVE_INFINITY, maxHealth: Number.POSITIVE_INFINITY, speed: 0, frozenUntil: 0,
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
    health: 80, maxHealth: 80, speed: 85, frozenUntil: 0,
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
  return { ...state, targets: [], metrics, telemetry: summarizeMetrics(metrics, state.time) };
}
export const resetLab = (state: GameState): GameState => createGame(state.rng);

function makeProjectile(spec: ProjectileSpec, state: GameState, aimAngle: number, now: number, id: number): ProjectileState {
  const phase = spec.orbitDuration > 0 ? "orbit" : "flight";
  const angle = phase === "orbit" ? spec.orbitAngle : aimAngle;
  const offset = phase === "orbit" ? spec.orbitRadius : state.player.radius + spec.radius + 2;
  return {
    id: `projectile-${id}`,
    x: state.player.x + Math.cos(angle) * offset,
    y: state.player.y + Math.sin(angle) * offset,
    vx: phase === "flight" ? Math.cos(spec.heading) * spec.speed : 0,
    vy: phase === "flight" ? Math.sin(spec.heading) * spec.speed : 0,
    phase,
    orbitElapsed: 0,
    orbitDuration: spec.orbitDuration,
    orbitAngle: spec.orbitAngle,
    orbitRadius: spec.orbitRadius,
    damage: spec.damage,
    speed: spec.speed,
    radius: spec.radius,
    lifetime: spec.lifetime,
    bornAt: now,
    remainingBounces: spec.bounces,
    bounceRetention: spec.bounceRetention,
    freezeChance: spec.freezeChance,
    freezeDuration: spec.freezeDuration,
    homingTurnRate: spec.homingTurnRate,
    homingRadius: spec.homingRadius,
    hitTargetIds: [],
    everHit: false,
  };
}

function turnToward(current: number, desired: number, limit: number): number {
  const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  return current + clamp(difference, -limit, limit);
}

function advanceProjectile(projectile: ProjectileState, state: GameState, input: InputIntent, dt: number): ProjectileState {
  const next = { ...projectile, hitTargetIds: [...projectile.hitTargetIds] };
  if (next.phase === "orbit") {
    next.orbitElapsed += dt;
    next.orbitAngle += Math.PI * 2 * dt;
    next.x = state.player.x + Math.cos(next.orbitAngle) * next.orbitRadius;
    next.y = state.player.y + Math.sin(next.orbitAngle) * next.orbitRadius;
    if (next.orbitElapsed < next.orbitDuration) return next;
    const heading = Math.atan2(input.aimY - state.player.y, input.aimX - state.player.x);
    next.phase = "flight";
    next.vx = Math.cos(heading) * next.speed;
    next.vy = Math.sin(heading) * next.speed;
  }

  if (next.homingTurnRate > 0 && next.homingRadius > 0) {
    const target = state.targets
      .filter((candidate) => candidate.health > 0 && distanceSquared(next, candidate) <= next.homingRadius ** 2)
      .sort((a, b) => distanceSquared(next, a) - distanceSquared(next, b))[0];
    if (target) {
      const heading = turnToward(Math.atan2(next.vy, next.vx), Math.atan2(target.y - next.y, target.x - next.x), next.homingTurnRate * dt);
      next.vx = Math.cos(heading) * next.speed;
      next.vy = Math.sin(heading) * next.speed;
    }
  }
  next.x += next.vx * dt;
  next.y += next.vy * dt;
  return next;
}

function reflect(projectile: ProjectileState, nx: number, ny: number): void {
  const dot = projectile.vx * nx + projectile.vy * ny;
  projectile.vx -= 2 * dot * nx;
  projectile.vy -= 2 * dot * ny;
  projectile.remainingBounces -= 1;
  projectile.damage *= projectile.bounceRetention;
  projectile.hitTargetIds = [];
}

function bounceOffWalls(projectile: ProjectileState, room: GameState["room"]): boolean {
  let nx = 0;
  let ny = 0;
  if (projectile.x - projectile.radius < room.minX) { projectile.x = room.minX + projectile.radius; nx = 1; }
  else if (projectile.x + projectile.radius > room.maxX) { projectile.x = room.maxX - projectile.radius; nx = -1; }
  if (projectile.y - projectile.radius < room.minY) { projectile.y = room.minY + projectile.radius; ny = 1; }
  else if (projectile.y + projectile.radius > room.maxY) { projectile.y = room.maxY - projectile.radius; ny = -1; }
  if (nx === 0 && ny === 0) return false;
  if (projectile.remainingBounces <= 0) return true;
  const length = Math.hypot(nx, ny);
  reflect(projectile, nx / length, ny / length);
  return false;
}

function bounceOffTarget(projectile: ProjectileState, target: TargetState): void {
  let nx = projectile.x - target.x;
  let ny = projectile.y - target.y;
  const length = Math.hypot(nx, ny);
  if (length === 0) {
    const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
    nx = -projectile.vx / speed;
    ny = -projectile.vy / speed;
  } else {
    nx /= length;
    ny /= length;
  }
  projectile.x = target.x + nx * (target.radius + projectile.radius + 0.01);
  projectile.y = target.y + ny * (target.radius + projectile.radius + 0.01);
  reflect(projectile, nx, ny);
}

export function updateGame(state: GameState, input: InputIntent, dt: number, now: number): GameState {
  if (input.paused) return state.paused ? state : { ...state, paused: true };

  let reload = advanceReload(state.reload, now);
  if (now >= reload.buffUntil && reload.fireRateBuff !== 0) reload = { ...reload, fireRateBuff: 0, buffUntil: 0 };
  let weapon = deriveWeapon(state.artifacts, fireRateBuffAt(reload, now));
  if (input.reloadPressed) {
    if (reload.reloading && weapon.activeWindow > 0) reload = attemptActiveReload(reload, weapon, now);
    else if (!reload.reloading && reload.ammo < reload.capacity) reload = startReload(reload, weapon, now);
    weapon = deriveWeapon(state.artifacts, fireRateBuffAt(reload, now));
  }

  const magnitude = Math.hypot(input.moveX, input.moveY);
  const movementScale = magnitude > 1 ? 1 / magnitude : 1;
  let player: PlayerState = {
    ...state.player,
    x: clamp(state.player.x + input.moveX * movementScale * state.player.speed * dt, state.room.minX + state.player.radius, state.room.maxX - state.player.radius),
    y: clamp(state.player.y + input.moveY * movementScale * state.player.speed * dt, state.room.minY + state.player.radius, state.room.maxY - state.player.radius),
  };
  const aim = { x: input.aimX, y: input.aimY };
  let metrics = state.metrics;
  let projectiles = state.projectiles;
  let nextId = state.nextId;
  let nextShotAt = state.nextShotAt;

  if (input.firing && !reload.reloading && reload.ammo > 0 && now >= nextShotAt) {
    const aimAngle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    const shot = buildShot(weapon, aimAngle);
    const firingState = { ...state, player };
    const created = shot.projectiles.map((spec) => makeProjectile(spec, firingState, aimAngle, now, nextId++));
    projectiles = [...projectiles, ...created];
    reload = { ...reload, ammo: reload.ammo - shot.roundsConsumed };
    metrics = recordTrigger(metrics);
    for (const _ of created) metrics = recordProjectile(metrics);
    nextShotAt = now + 1 / weapon.fireRate;
    if (reload.ammo === 0) reload = startReload(reload, weapon, now);
  }

  const movingState = { ...state, player, targets: state.targets };
  projectiles = projectiles.map((projectile) => advanceProjectile(projectile, movingState, input, dt));
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
    if (target.kind === "chaser" && overlaps(player, target) && now >= player.invulnerableUntil) {
      player = { ...player, health: Math.max(0, player.health - 10), invulnerableUntil: now + 0.5 };
      break;
    }
  }

  const survivingProjectiles: ProjectileState[] = [];
  for (const projectile of projectiles) {
    if (now - projectile.bornAt >= projectile.lifetime) {
      metrics = recordProjectileOutcome(metrics, projectile.everHit);
      continue;
    }
    if (projectile.phase === "orbit") { survivingProjectiles.push(projectile); continue; }
    if (bounceOffWalls(projectile, state.room)) {
      metrics = recordProjectileOutcome(metrics, projectile.everHit);
      continue;
    }

    let consumed = false;
    for (const target of targets) {
      if (target.health <= 0 || projectile.hitTargetIds.includes(target.id) || !overlaps(projectile, target)) continue;
      const wasAlive = target.kind === "dummy" || target.health > 0;
      target.health -= projectile.damage;
      if (projectile.freezeChance > 0 && state.rng() < projectile.freezeChance) {
        target.frozenUntil = Math.max(target.frozenUntil, now + projectile.freezeDuration);
      }
      const firstHit = !projectile.everHit;
      projectile.everHit = true;
      metrics = recordHit(metrics, projectile.damage, now, target.id, firstHit, target);
      if (wasAlive && target.kind === "chaser" && target.health <= 0) metrics = recordKill(metrics, target.id);
      projectile.hitTargetIds.push(target.id);
      if (projectile.remainingBounces > 0) bounceOffTarget(projectile, target);
      else consumed = true;
      break;
    }
    if (consumed) metrics = recordProjectileOutcome(metrics, projectile.everHit);
    else survivingProjectiles.push(projectile);
  }

  targets = targets.filter((target) => target.kind === "dummy" || target.health > 0);
  metrics = retainTargetMetrics(metrics, targets.map((target) => target.id));
  const telemetry = summarizeMetrics(metrics, now);
  return {
    ...state, player, aim, weapon, reload, projectiles: survivingProjectiles, targets, metrics, telemetry,
    time: now, nextShotAt, nextId, paused: false,
  };
}
