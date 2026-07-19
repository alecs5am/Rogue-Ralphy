import { createMetrics, recordDamage, recordKill, recordProjectile, recordProjectileOutcome, recordTrigger, retainTargetMetrics, summarizeMetrics, type Metrics } from "./metrics";
import { advanceReload, attemptActiveReload, createReloadState, fireRateBuffAt, startReload, type ReloadState } from "./reload";
import { buildShot, deriveWeapon, type ArtifactId, type ArtifactLoadout, type DerivedWeapon, type ProjectileSpec } from "./weapon";
import { advanceTrajectory, splitProjectile, type ProjectileState } from "./projectiles";
import { ROOM, ROOM_PROPS, TILE_SIZE, segmentCircleHitTime, type Point } from "./room";

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

export type TargetState = Point & {
  id: string; kind: "dummy" | "chaser"; radius: number; health: number; maxHealth: number;
  speed: number; frozenUntil: number;
};

export type { ProjectileState } from "./projectiles";

export type GameState = {
  room: { width: number; height: number; minX: number; maxX: number; minY: number; maxY: number };
  player: PlayerState; aim: Point; artifacts: ArtifactLoadout; weapon: DerivedWeapon;
  reload: ReloadState; projectiles: ProjectileState[]; targets: TargetState[];
  metrics: Metrics; telemetry: ReturnType<typeof summarizeMetrics>;
  time: number; nextShotAt: number; nextId: number; paused: boolean; rng: () => number;
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
  const muzzle = {
    x: state.player.x + Math.cos(aimAngle) * (state.player.radius + spec.radius + 2),
    y: state.player.y + Math.sin(aimAngle) * (state.player.radius + spec.radius + 2),
  };
  const spiral = spec.behaviors.spiral;
  const spiralOrigin = spiral ? Object.freeze(muzzle) : undefined;
  const spiralRadius = spiral?.initialRadius;
  const spiralAngle = spiral ? spec.heading : undefined;
  const x = muzzle.x + (spiral ? Math.cos(spec.heading) * spiral.initialRadius : 0);
  const y = muzzle.y + (spiral ? Math.sin(spec.heading) * spiral.initialRadius : 0);
  const vx = spiral
    ? Math.cos(spec.heading) * spiral.radialSpeed - Math.sin(spec.heading) * spiral.angularSpeed * spiral.initialRadius
    : Math.cos(spec.heading) * spec.speed;
  const vy = spiral
    ? Math.sin(spec.heading) * spiral.radialSpeed + Math.cos(spec.heading) * spiral.angularSpeed * spiral.initialRadius
    : Math.sin(spec.heading) * spec.speed;
  return {
    id: `projectile-${id}`,
    triggerId: spec.triggerId,
    x,
    y,
    vx,
    vy,
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
  };
}

function reflect(projectile: ProjectileState, nx: number, ny: number): void {
  const dot = projectile.vx * nx + projectile.vy * ny;
  projectile.vx -= 2 * dot * nx;
  projectile.vy -= 2 * dot * ny;
  projectile.remainingBounces -= 1;
  projectile.damage *= projectile.bounceRetention;
}

type WallHit = { time: number; nx: number; ny: number };

function firstWallHit(from: Point, to: Point, radius: number, room: GameState["room"]): WallHit | undefined {
  const hits: WallHit[] = [];
  if (to.x < room.minX + radius) hits.push({ time: (room.minX + radius - from.x) / (to.x - from.x), nx: 1, ny: 0 });
  else if (to.x > room.maxX - radius) hits.push({ time: (room.maxX - radius - from.x) / (to.x - from.x), nx: -1, ny: 0 });
  if (to.y < room.minY + radius) hits.push({ time: (room.minY + radius - from.y) / (to.y - from.y), nx: 0, ny: 1 });
  else if (to.y > room.maxY - radius) hits.push({ time: (room.maxY - radius - from.y) / (to.y - from.y), nx: 0, ny: -1 });
  hits.sort((a, b) => a.time - b.time);
  const first = hits[0];
  if (!first) return undefined;
  const simultaneous = hits.filter((hit) => Math.abs(hit.time - first.time) < 1e-12);
  return { time: first.time, nx: simultaneous.reduce((total, hit) => total + hit.nx, 0), ny: simultaneous.reduce((total, hit) => total + hit.ny, 0) };
}

function bounceOffWall(projectile: ProjectileState, hit: WallHit): boolean {
  if (projectile.remainingBounces <= 0) return true;
  const length = Math.hypot(hit.nx, hit.ny);
  reflect(projectile, hit.nx / length, hit.ny / length);
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

function bounceOffProp(projectile: ProjectileState, prop: (typeof ROOM_PROPS)[number]): boolean {
  if (projectile.remainingBounces <= 0) return true;
  let nx = projectile.x - prop.x;
  let ny = projectile.y - prop.y;
  const length = Math.hypot(nx, ny);
  if (length === 0) {
    const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
    nx = -projectile.vx / speed;
    ny = -projectile.vy / speed;
  } else {
    nx /= length;
    ny /= length;
  }
  projectile.x = prop.x + nx * (prop.collisionRadius + projectile.radius + 0.01);
  projectile.y = prop.y + ny * (prop.collisionRadius + projectile.radius + 0.01);
  reflect(projectile, nx, ny);
  return false;
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
  const velocity = moveVelocityToward(
    state.player.vx,
    state.player.vy,
    input.moveX * movementScale * state.player.speed,
    input.moveY * movementScale * state.player.speed,
    PLAYER_ACCELERATION * dt,
  );
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
  let projectiles = state.projectiles;
  let nextId = state.nextId;
  let nextShotAt = state.nextShotAt;

  if (input.firing && !reload.reloading && reload.ammo > 0 && now >= nextShotAt) {
    const aimAngle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    const shot = buildShot(weapon, aimAngle, state.rng, `trigger-${nextId}`);
    const firingState = { ...state, player };
    const created = shot.projectiles.map((spec) => makeProjectile(spec, firingState, aimAngle, now, nextId++));
    projectiles = [...projectiles, ...created];
    reload = { ...reload, ammo: reload.ammo - shot.roundsConsumed };
    metrics = recordTrigger(metrics);
    for (const _ of created) metrics = recordProjectile(metrics);
    nextShotAt = now + 1 / weapon.fireRate;
    if (reload.ammo === 0) reload = startReload(reload, weapon, now);
  }

  const projectileStarts = new Map(projectiles.map((projectile) => [projectile.id, { x: projectile.x, y: projectile.y }]));
  const trajectoryStarts = new Map(projectiles.map((projectile) => [projectile.id, {
    spiralRadius: projectile.spiralRadius,
    spiralAngle: projectile.spiralAngle,
  }]));
  projectiles = projectiles.map((projectile) => advanceTrajectory(projectile, state.targets, dt));
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
  const addSplitChildren = (projectile: ProjectileState) => {
    const split = projectile.behaviors.split!;
    const children = splitProjectile(projectile, Array.from({ length: split.count }, () => `projectile-${nextId++}`));
    survivingProjectiles.push(...children);
    for (const _ of children) metrics = recordProjectile(metrics);
  };
  for (const projectile of projectiles) {
    if (now - projectile.bornAt >= projectile.lifetime) {
      metrics = recordProjectileOutcome(metrics, projectile.everHit);
      continue;
    }
    const end = { x: projectile.x, y: projectile.y };
    const start = projectileStarts.get(projectile.id)!;
    let from = start;
    projectile.x = from.x;
    projectile.y = from.y;

    while (true) {
      const segmentDistance = Math.hypot(end.x - from.x, end.y - from.y);
      const propHit = projectile.penetration?.obstacles ? undefined : ROOM_PROPS
        .map((prop) => ({ kind: "prop" as const, prop, time: segmentCircleHitTime(from, end, prop, prop.collisionRadius + projectile.radius) }))
        .filter((hit): hit is { kind: "prop"; prop: (typeof ROOM_PROPS)[number]; time: number } => hit.time !== null)
        .sort((a, b) => a.time - b.time)[0];
      const wall = firstWallHit(from, end, projectile.radius, state.room);
      const wallHit = wall && { kind: "wall" as const, ...wall };
      const targetHit = targets
        .filter((target) => target.health > 0 && !projectile.hitTargetIds.includes(target.id))
        .map((target) => ({ kind: "target" as const, target, time: segmentCircleHitTime(from, end, target, target.radius + projectile.radius) }))
        .filter((hit): hit is { kind: "target"; target: TargetState; time: number } => hit.time !== null)
        .sort((a, b) => a.time - b.time)[0];
      const splitRemaining = (projectile.behaviors.split?.distance ?? Number.POSITIVE_INFINITY) - projectile.travelled;
      const splitHit = splitRemaining <= segmentDistance
        ? { kind: "split" as const, time: segmentDistance === 0 ? 0 : Math.max(0, splitRemaining / segmentDistance) }
        : undefined;
      const rangeRemaining = (projectile.maxTravel ?? Number.POSITIVE_INFINITY) - projectile.travelled;
      const rangeHit = rangeRemaining <= segmentDistance
        ? { kind: "range" as const, time: segmentDistance === 0 ? 0 : Math.max(0, rangeRemaining / segmentDistance) }
        : undefined;
      const priorities = { prop: 0, wall: 1, target: 2, split: 3, range: 4 } as const;
      const event = [propHit, wallHit, targetHit, splitHit, rangeHit]
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
        .sort((a, b) => {
          const difference = a.time - b.time;
          const tolerance = Number.EPSILON * 128 * Math.max(1, Math.abs(a.time), Math.abs(b.time));
          return Math.abs(difference) <= tolerance ? priorities[a.kind] - priorities[b.kind] : difference;
        })[0];

      if (!event) {
        projectile.x = end.x;
        projectile.y = end.y;
        projectile.travelled += segmentDistance;
        survivingProjectiles.push(projectile);
        break;
      }

      projectile.x = from.x + (end.x - from.x) * event.time;
      projectile.y = from.y + (end.y - from.y) * event.time;
      projectile.travelled += segmentDistance * event.time;

      if (event.kind !== "target" || !projectile.penetration?.targets) {
        const fullDistance = Math.hypot(end.x - start.x, end.y - start.y);
        const fraction = fullDistance === 0 ? 0 : Math.hypot(projectile.x - start.x, projectile.y - start.y) / fullDistance;
        const trajectoryStart = trajectoryStarts.get(projectile.id)!;
        if (trajectoryStart.spiralRadius !== undefined && projectile.spiralRadius !== undefined) {
          projectile.spiralRadius = trajectoryStart.spiralRadius + (projectile.spiralRadius - trajectoryStart.spiralRadius) * fraction;
        }
        if (trajectoryStart.spiralAngle !== undefined && projectile.spiralAngle !== undefined) {
          projectile.spiralAngle = trajectoryStart.spiralAngle + (projectile.spiralAngle - trajectoryStart.spiralAngle) * fraction;
        }
      }

      if (event.kind === "split") {
        addSplitChildren(projectile);
        break;
      }
      if (event.kind === "range") {
        metrics = recordProjectileOutcome(metrics, projectile.everHit);
        break;
      }
      if (event.kind === "prop") {
        if (bounceOffProp(projectile, event.prop)) metrics = recordProjectileOutcome(metrics, projectile.everHit);
        else survivingProjectiles.push(projectile);
        break;
      }
      if (event.kind === "wall") {
        if (bounceOffWall(projectile, event)) metrics = recordProjectileOutcome(metrics, projectile.everHit);
        else survivingProjectiles.push(projectile);
        break;
      }

      const target = event.target;
      const wasAlive = target.kind === "dummy" || target.health > 0;
      target.health -= projectile.damage;
      if (projectile.freezeChance > 0 && state.rng() < projectile.freezeChance) {
        target.frozenUntil = Math.max(target.frozenUntil, now + projectile.freezeDuration);
      }
      const firstHit = !projectile.everHit;
      projectile.everHit = true;
      metrics = recordDamage(metrics, {
        source: "direct", damage: projectile.damage, time: now, targetId: target.id,
        projectileId: projectile.id, triggerId: projectile.triggerId, firstProjectileHit: firstHit,
        x: target.x, y: target.y,
      });
      if (wasAlive && target.kind === "chaser" && target.health <= 0) metrics = recordKill(metrics, target.id);
      projectile.hitTargetIds.push(target.id);
      if (projectile.penetration?.targets) {
        from = { x: projectile.x, y: projectile.y };
        continue;
      }
      if (projectile.remainingBounces > 0) {
        bounceOffTarget(projectile, target);
        survivingProjectiles.push(projectile);
      } else {
        metrics = recordProjectileOutcome(metrics, projectile.everHit);
      }
      break;
    }
  }

  targets = targets.filter((target) => target.kind === "dummy" || target.health > 0);
  metrics = retainTargetMetrics(metrics, targets.map((target) => target.id));
  const telemetry = summarizeMetrics(metrics, now);
  return {
    ...state, player, aim, weapon, reload, projectiles: survivingProjectiles, targets, metrics, telemetry,
    time: now, nextShotAt, nextId, paused: false,
  };
}
