import { createMetrics, recordDamage, recordKill, recordTrigger, retainTargetMetrics, summarizeMetrics, type Metrics } from "./metrics";
import { ARTIFACT_IDS } from "./artifacts";
import { advanceReload, ammoCount, attemptActiveReload, consumeRound, createCylinder, fireRateBuffAt, startReload, type CylinderState } from "./cylinder";
import { compileCombatBuild, type CombatBuild } from "./combat-build";
import { deriveWeapon, type ArtifactId, type ArtifactLoadout, type DerivedWeapon } from "./weapon";
import { type PendingEffectToken, type ProjectileState, type TeslaLink } from "./projectiles";
import { ARENA_PROPS, ARENA_ROOM, ROOM, ROOM_PROPS, TILE_SIZE, type Point, type RoomProp } from "./room";
import { expandTrigger, type LocketState, type PlayerSatelliteState, type ScheduledProjectile } from "./trigger";
import {
  resolveCombatPhases,
  resolveReactiveKillPhase,
  resolveRootCleanupPhase,
  type AreaState,
  type CombatTargetState,
  type EnemyStyle,
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
export type PickupKind = "health" | "speed" | "damage" | "fireRate" | "reload" | "capacity";
export type PickupState = Point & { id: string; kind: PickupKind; radius: number };
export type PickupNotice = Readonly<{ text: string; expiresAt: number }>;
export type HazardState = Point & { id: string; vx: number; vy: number; radius: number; damage: number; expiresAt: number; boss?: boolean };
export type StatBonuses = { damage: number; fireRate: number; reload: number; capacity: number };
export type RunState = Readonly<{
  mode: "run";
  phase: "choice" | "combat" | "complete";
  wave: number;
  artifactsTaken: number;
  maxArtifacts: 10;
  choices: readonly ArtifactId[];
  bonusDrops: number;
}>;

export type { ProjectileState } from "./projectiles";

export type GameState = {
  room: { width: number; height: number; minX: number; maxX: number; minY: number; maxY: number };
  roomProps: readonly RoomProp[];
  player: PlayerState; aim: Point; artifacts: ArtifactLoadout; build: CombatBuild; weapon: DerivedWeapon;
  statBonuses: StatBonuses;
  resources: Resources;
  cylinder: CylinderState; scheduledProjectiles: ScheduledProjectile[]; pendingEmissions: PendingEmission[];
  projectiles: ProjectileState[]; targets: TargetState[]; areas: AreaState[]; vfxCommands: VfxCommand[];
  pickups: PickupState[]; hazards: HazardState[];
	pickupNotice?: PickupNotice;
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
  run?: RunState;
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
const ENEMY_KINDS = [
  "skullRaider", "candleShooter", "batSpirit", "tombBrute", "splitSlime",
  "sniperEye", "barrelBomber", "healerLantern", "fastBandit", "bellSummoner",
] as const satisfies readonly TargetState["kind"][];
const PICKUP_KINDS = ["health", "speed", "damage", "fireRate", "reload", "capacity"] as const;
const PICKUP_NOTICES: Record<PickupKind, string> = {
  health: "+1 HEART · +1 COIN",
  speed: "+12 MOVE SPEED",
  damage: "+8% DAMAGE",
  fireRate: "+8% FIRE RATE",
  reload: "+10% RELOAD",
  capacity: "+1 CHAMBER",
};
const FINAL_WAVE = 10;
const CRATE_POINTS: readonly Point[] = [
  { x: 650, y: 330 },
  { x: 950, y: 630 },
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
const isEnemy = (target: TargetState): boolean => !target.immortal && target.kind !== "destructibleCrate";
const isWaveObjective = (target: TargetState): boolean =>
  isEnemy(target) || (target.kind === "destructibleCrate" && target.ai?.dropsBonus === true);

function applyStatBonuses(weapon: DerivedWeapon, bonuses: StatBonuses): DerivedWeapon {
  const capacity = weapon.capacity + bonuses.capacity;
  const damage = weapon.damage * (1 + bonuses.damage * 0.08);
  const fireRate = weapon.fireRate * (1 + bonuses.fireRate * 0.08);
  const reloadDuration = weapon.reloadDuration / (1 + bonuses.reload * 0.1);
  const projectileBase = Object.freeze({ ...weapon.projectileBase, damage });
  return { ...weapon, capacity, damage, fireRate, reloadDuration, projectileBase };
}

function ensureCylinderCapacity(cylinder: CylinderState, capacity: number): CylinderState {
  if (cylinder.slots.length === capacity) return cylinder;
  const slots = cylinder.slots.slice(0, capacity) as { loaded: boolean; echo: null }[];
  while (slots.length < capacity) slots.push({ loaded: true, echo: null });
  return {
    ...cylinder,
    slots,
    nextSlot: Math.min(cylinder.nextSlot, Math.max(0, capacity - 1)),
    emptied: cylinder.emptied.filter((slot) => slot < capacity),
  };
}

function arenaPoint(state: GameState, index: number): Point {
  const angle = (index * 2.399963 + state.rng() * 0.7) % (Math.PI * 2);
  const radius = Math.min(state.room.width, state.room.height) * (0.28 + state.rng() * 0.18);
  return {
    x: clamp(state.player.x + Math.cos(angle) * radius, state.room.minX + 40, state.room.maxX - 40),
    y: clamp(state.player.y + Math.sin(angle) * radius, state.room.minY + 40, state.room.maxY - 40),
  };
}

function artifactChoices(state: GameState): readonly ArtifactId[] {
  const available = ARTIFACT_IDS.filter((id) => state.artifacts[id] !== true);
  if (available.length <= 2) return available;
  const offset = Math.floor(state.rng() * available.length) % available.length;
  return [available[offset]!, available[(offset + 1) % available.length]!];
}

export function createGame(rng: () => number = Math.random): GameState {
  const artifacts: ArtifactLoadout = {};
  const build = compileCombatBuild(artifacts);
  const statBonuses = { damage: 0, fireRate: 0, reload: 0, capacity: 0 };
  const weapon = applyStatBonuses(deriveWeapon(build, 0), statBonuses);
  const metrics = createMetrics();
  return {
    room: ROOM,
    roomProps: ROOM_PROPS,
    player: { ...PLAYER },
    aim: { x: 900, y: 270 },
    artifacts,
    build,
    statBonuses,
    resources: { coins: 0, bombs: 0, keys: 0 },
    weapon,
    cylinder: createCylinder(weapon.capacity, weapon.capacity),
    scheduledProjectiles: [],
    pendingEmissions: [],
    projectiles: [],
    targets: [],
    pickups: [],
    hazards: [],
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

export function createRunGame(rng: () => number = Math.random): GameState {
  const base = createGame(rng);
  const player = { ...base.player, x: ARENA_ROOM.width / 2, y: ARENA_ROOM.height / 2 };
  const runBase: GameState = {
    ...base,
    room: ARENA_ROOM,
    roomProps: ARENA_PROPS,
    player,
    aim: { x: player.x + 220, y: player.y },
    resources: { coins: 0, bombs: 0, keys: 0 },
    run: { mode: "run", phase: "choice", wave: 1, artifactsTaken: 0, maxArtifacts: 10, choices: [], bonusDrops: 0 },
  };
  return { ...runBase, run: { ...runBase.run!, choices: artifactChoices(runBase) } };
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
    weapon: applyStatBonuses(deriveWeapon(build, fireRateBuffAt(state.cylinder, state.time)), state.statBonuses),
    stillwater: artifacts.stillwater ? state.stillwater : { progress: 0, charged: false },
    locketState: artifacts.lastGaspLocket ? state.locketState : { armed: false, cadence: 0 },
  };
}

function enemyProfile(kind: TargetState["kind"], wave: number): Readonly<{
  style: EnemyStyle;
  radius: number;
  health: number;
  speed: number;
}> {
  const scale = 1 + Math.max(0, wave - 1) * 0.18;
  switch (kind) {
    case "candleShooter": return { style: "ranged", radius: 18, health: 52 * scale, speed: 62 };
    case "batSpirit": return { style: "zigzag", radius: 16, health: 46 * scale, speed: 128 };
    case "tombBrute": return { style: "brute", radius: 24, health: 145 * scale, speed: 48 };
    case "splitSlime": return { style: "splitter", radius: 20, health: 88 * scale, speed: 72 };
    case "sniperEye": return { style: "sniper", radius: 17, health: 62 * scale, speed: 46 };
    case "barrelBomber": return { style: "bomber", radius: 21, health: 76 * scale, speed: 92 };
    case "healerLantern": return { style: "healer", radius: 18, health: 68 * scale, speed: 68 };
    case "fastBandit": return { style: "bonus", radius: 16, health: 42 * scale, speed: 152 };
    case "bellSummoner": return { style: "summoner", radius: 19, health: 82 * scale, speed: 58 };
    case "sheriffBoss": return { style: "boss", radius: 42, health: 2_600, speed: 70 };
    default: return { style: "chase", radius: 18, health: 64 * scale, speed: 92 };
  }
}

function spawnRunTarget(state: GameState, kind: TargetState["kind"], position: Point, dropsBonus = false): GameState {
  const profile = enemyProfile(kind, state.run?.wave ?? 1);
  if (!canSpawn(state, position, profile.radius)) return state;
  const target: TargetState = {
    ...position,
    id: `${kind}-${state.nextId}`,
    kind,
    radius: profile.radius,
    health: profile.health,
    maxHealth: profile.health,
    immortal: false,
    speed: profile.speed,
    frozenUntil: 0,
    effects: createTargetEffects(),
    ai: {
      style: profile.style,
      nextShotAt: state.time + 0.8 + state.rng(),
      phase: state.rng() * Math.PI * 2,
		attackIndex: 0,
      ...(dropsBonus ? { dropsBonus: true, bonusKind: PICKUP_KINDS[Math.floor(state.rng() * PICKUP_KINDS.length) % PICKUP_KINDS.length] } : {}),
    },
  };
  return { ...state, targets: [...state.targets, target], nextId: state.nextId + 1 };
}

function spawnDestructibleCrate(state: GameState, position: Point, bonusKind: PickupKind): GameState {
  if (!canSpawn(state, position, 24)) return state;
  const target: TargetState = {
    ...position,
    id: `destructible-crate-${state.nextId}`,
    kind: "destructibleCrate",
    radius: 24,
    health: 70,
    maxHealth: 70,
    immortal: false,
    speed: 0,
    frozenUntil: 0,
    effects: createTargetEffects(),
	ai: { style: "bonus", nextShotAt: Number.MAX_SAFE_INTEGER, phase: 0, dropsBonus: true, bonusKind },
  };
  return { ...state, targets: [...state.targets, target], nextId: state.nextId + 1 };
}

function spawnRunTargetWithRetries(
  state: GameState,
  kind: TargetState["kind"],
  index: number,
  dropsBonus: boolean,
): GameState {
  for (let attempt = 0; attempt < (dropsBonus ? 8 : 1); attempt += 1) {
    const spawned = spawnRunTarget(state, kind, arenaPoint(state, index + attempt), dropsBonus);
    if (spawned !== state) return spawned;
  }
  return state;
}

function spawnRunWave(state: GameState): GameState {
  if (!state.run) return state;
  let next: GameState = { ...state, targets: [], projectiles: [], hazards: [], pickups: [], pendingEmissions: [], scheduledProjectiles: [] };
	for (let index = 0; index < CRATE_POINTS.length; index += 1) {
		const kind = PICKUP_KINDS[(state.run.wave + index) % PICKUP_KINDS.length]!;
		next = spawnDestructibleCrate(next, CRATE_POINTS[index]!, kind);
	}
  if (state.run.wave >= FINAL_WAVE) {
    next = spawnRunTarget(next, "sheriffBoss", { x: state.room.maxX - 180, y: state.room.height / 2 }, false);
    for (let index = 0; index < 4; index += 1) next = spawnRunTargetWithRetries(next, ENEMY_KINDS[index]!, index, index === 2);
  } else {
    const count = Math.min(8, 3 + state.run.wave);
    for (let index = 0; index < count; index += 1) {
      const kind = index === count - 1
		? "fastBandit"
		: ENEMY_KINDS[(index + state.run.wave - 1) % ENEMY_KINDS.length]!;
      next = spawnRunTargetWithRetries(next, kind, index, index === count - 1);
    }
  }
  return next;
}

export function chooseRunArtifact(state: GameState, id?: ArtifactId): GameState {
  if (!state.run || state.run.phase !== "choice") return state;
  const choices = state.run.choices.length > 0 ? state.run.choices : artifactChoices(state);
  const selected = choices.includes(id as ArtifactId) ? id : choices[0];
  const canTake = selected !== undefined && state.run.artifactsTaken < state.run.maxArtifacts && state.artifacts[selected] !== true;
  const withArtifact = canTake && selected ? setArtifact(state, selected, true) : state;
  return spawnRunWave({
    ...withArtifact,
    run: {
      ...state.run,
      phase: "combat",
      artifactsTaken: state.run.artifactsTaken + Number(canTake),
      choices: [],
    },
  });
}

export function collectPickup(state: GameState, id: string): GameState {
  const pickup = state.pickups.find((candidate) => candidate.id === id);
  if (!pickup) return state;
  const pickups = state.pickups.filter((candidate) => candidate.id !== id);
  let player = state.player;
  let statBonuses = state.statBonuses;
  let resources = state.resources;
  switch (pickup.kind) {
    case "health":
		player = { ...player, maxHealth: player.maxHealth + 20, health: player.health + 20 };
      resources = { ...resources, coins: clampResource(resources.coins + 1) };
      break;
    case "speed":
      player = { ...player, speed: player.speed + 12 };
      break;
    case "damage":
      statBonuses = { ...statBonuses, damage: statBonuses.damage + 1 };
      break;
    case "fireRate":
      statBonuses = { ...statBonuses, fireRate: statBonuses.fireRate + 1 };
      break;
    case "reload":
      statBonuses = { ...statBonuses, reload: statBonuses.reload + 1 };
      break;
    case "capacity":
      statBonuses = { ...statBonuses, capacity: statBonuses.capacity + 1 };
      break;
  }
  const weapon = applyStatBonuses(deriveWeapon(state.build, fireRateBuffAt(state.cylinder, state.time)), statBonuses);
	const run = state.run ? { ...state.run, bonusDrops: state.run.bonusDrops + 1 } : undefined;
  return {
		...state,
		pickups,
		player,
		statBonuses,
		resources,
		weapon,
		cylinder: ensureCylinderCapacity(state.cylinder, weapon.capacity),
		pickupNotice: { text: PICKUP_NOTICES[pickup.kind], expiresAt: state.time + 1.4 },
		...(run ? { run } : {}),
	};
}

function canSpawn(state: GameState, point: Point, radius: number): boolean {
  if (point.x - radius < state.room.minX || point.x + radius > state.room.maxX ||
      point.y - radius < state.room.minY || point.y + radius > state.room.maxY) return false;
  const body = { ...point, radius };
  return !overlaps(body, state.player)
    && state.targets.every((target) => !overlaps(body, target))
    && state.roomProps.every((prop) => !overlaps(body, { ...prop, radius: prop.collisionRadius }));
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
    hazards: [],
    pickups: [],
    pendingEmissions: [],
    areas: [],
    vfxCommands: state.vfxCommands.filter(({ kind, expiresAt }) => kind === "bonanza.delivery" && expiresAt > state.time),
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

function steerTarget(target: TargetState, player: PlayerState, dt: number, now: number): TargetState {
  if (!target.ai || target.kind === "destructibleCrate" || now < target.frozenUntil) return target;
  const dx = player.x - target.x;
  const dy = player.y - target.y;
  const distance = Math.hypot(dx, dy) || 1;
  let nx = dx / distance;
  let ny = dy / distance;
  if (target.ai.style === "ranged" || target.ai.style === "sniper" || target.ai.style === "healer") {
    const preferred = target.ai.style === "sniper" ? 420 : 300;
    const direction = distance < preferred ? -1 : 0.45;
    nx *= direction;
    ny *= direction;
  } else if (target.ai.style === "zigzag" || target.ai.style === "bomber") {
    const wave = Math.sin(now * 5 + target.ai.phase) * 0.85;
    const px = -ny;
    const py = nx;
    nx = nx * 0.75 + px * wave;
    ny = ny * 0.75 + py * wave;
	} else if (target.ai.style === "boss") {
		const healthRatio = target.health / target.maxHealth;
		const strafe = Math.sin(now * (healthRatio < 0.34 ? 3.8 : 2.5) + target.ai.phase);
		const px = -ny;
		const py = nx;
		nx = nx * 0.72 + px * strafe * 0.55;
		ny = ny * 0.72 + py * strafe * 0.55;
  }
  const length = Math.hypot(nx, ny) || 1;
	const aggression = target.ai.style === "boss"
		? target.health / target.maxHealth < 0.34 ? 1.7 : target.health / target.maxHealth < 0.67 ? 1.3 : 1
		: 1;
  return {
    ...target,
		x: clamp(target.x + nx / length * target.speed * aggression * dt, ROOM.minX + target.radius, ARENA_ROOM.maxX - target.radius),
		y: clamp(target.y + ny / length * target.speed * aggression * dt, ROOM.minY + target.radius, ARENA_ROOM.maxY - target.radius),
  };
}

function fireEnemyHazards(state: GameState, target: TargetState, now: number): Readonly<{ target: TargetState; hazards: HazardState[]; nextId: number }> {
	if (!target.ai || !["ranged", "sniper", "bomber", "boss"].includes(target.ai.style)) {
		return { target, hazards: [], nextId: state.nextId };
  }
  const dx = state.player.x - target.x;
  const dy = state.player.y - target.y;
	if (target.ai.style === "boss" && (Math.abs(dx) > 440 || Math.abs(dy) > 250)) {
		return {
			target: { ...target, ai: { ...target.ai, nextShotAt: Math.max(target.ai.nextShotAt, now + 0.45) } },
			hazards: [],
			nextId: state.nextId,
		};
	}
	if (now < target.ai.nextShotAt) return { target, hazards: [], nextId: state.nextId };
	const aimedAngle = Math.atan2(dy, dx);
	const healthRatio = target.health / target.maxHealth;
	const attackIndex = target.ai.attackIndex ?? 0;
	const bossCount = healthRatio > 0.67
		? 3
		: healthRatio > 0.34
			? attackIndex % 2 === 0 ? 8 : 5
			: attackIndex % 2 === 0 ? 12 : 7;
	const count = target.ai.style === "boss" ? bossCount : 1;
	const speed = target.ai.style === "sniper" ? 310 : target.ai.style === "boss" ? healthRatio > 0.67 ? 250 : 205 : 210;
	const cooldown = target.ai.style === "sniper"
		? 2.2
		: target.ai.style === "boss"
			? healthRatio > 0.67 ? 1.15 : healthRatio > 0.34 ? 0.9 : 0.62
			: 1.4;
	const hazards: HazardState[] = [];
	for (let index = 0; index < count; index += 1) {
		const radial = count === 8 || count === 12;
		const angle = target.ai.style !== "boss"
			? aimedAngle
			: radial
				? target.ai.phase + index * Math.PI * 2 / count
				: aimedAngle + (index - (count - 1) / 2) * (count === 3 ? 0.24 : 0.16);
		hazards.push({
			id: `hazard-${state.nextId + index}`,
			x: target.x,
			y: target.y,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			radius: target.ai.style === "boss" ? 11 : 8,
			damage: target.ai.style === "boss" ? 10 : 8,
			expiresAt: now + 4,
			...(target.ai.style === "boss" ? { boss: true } : {}),
		});
	}
  return {
		target: {
			...target,
			ai: {
				...target.ai,
				nextShotAt: now + cooldown + state.rng() * 0.2,
				phase: target.ai.phase + 0.28,
				attackIndex: attackIndex + 1,
			},
		},
		hazards,
		nextId: state.nextId + hazards.length,
  };
}

function advanceHazards(state: GameState, hazards: readonly HazardState[], player: PlayerState, dt: number, now: number): Readonly<{ hazards: HazardState[]; player: PlayerState; hurt: boolean }> {
  let hurt = false;
  let nextPlayer = player;
  const nextHazards: HazardState[] = [];
  for (const hazard of hazards) {
    const moved = { ...hazard, x: hazard.x + hazard.vx * dt, y: hazard.y + hazard.vy * dt };
    if (moved.expiresAt <= now || moved.x < state.room.minX || moved.x > state.room.maxX || moved.y < state.room.minY || moved.y > state.room.maxY) continue;
    if (nextPlayer.health > 0 && now >= nextPlayer.invulnerableUntil && overlaps(nextPlayer, moved)) {
      nextPlayer = { ...nextPlayer, health: Math.max(0, nextPlayer.health - moved.damage), invulnerableUntil: now + 0.45 };
      hurt = true;
      continue;
    }
    nextHazards.push(moved);
  }
  return { hazards: nextHazards, player: nextPlayer, hurt };
}

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
  let weapon = applyStatBonuses(deriveWeapon(state.build, fireRateBuffAt(cylinder, now)), state.statBonuses);
  if (canAct && input.reloadPressed) {
    if (cylinder.reloading && weapon.activeWindow > 0) cylinder = attemptActiveReload(cylinder, weapon, now);
    else if (!cylinder.reloading && ammoCount(cylinder) < weapon.capacity) cylinder = startReload(cylinder, weapon, now, "manual");
    weapon = applyStatBonuses(deriveWeapon(state.build, fireRateBuffAt(cylinder, now)), state.statBonuses);
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
  let x = clamp(nextX, state.room.minX + state.player.radius, state.room.maxX - state.player.radius);
  let y = clamp(nextY, state.room.minY + state.player.radius, state.room.maxY - state.player.radius);
  for (const prop of [
    ...state.roomProps.map((prop) => ({ ...prop, radius: prop.collisionRadius })),
    ...state.targets.filter(({ kind }) => kind === "destructibleCrate"),
  ]) {
    const dx = x - prop.x;
    const dy = y - prop.y;
    const distance = Math.hypot(dx, dy) || 1;
    const minimum = state.player.radius + prop.radius;
    if (distance >= minimum) continue;
    x = clamp(prop.x + dx / distance * minimum, state.room.minX + state.player.radius, state.room.maxX - state.player.radius);
    y = clamp(prop.y + dy / distance * minimum, state.room.minY + state.player.radius, state.room.maxY - state.player.radius);
  }
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

  let hazards = [...state.hazards];
  const advancedHazards = advanceHazards(state, hazards, player, dt, now);
  hazards = advancedHazards.hazards;
  player = advancedHazards.player;
  if (advancedHazards.hurt) {
    lastHurtAt = now;
    if (player.health === 0) diedAt = now;
  }

  const snares = state.areas.filter((area): area is SnareAreaState => "kind" in area && area.kind === "snare");
  const chasePoint = decoy ?? player;
  let nextId = state.nextId;
  let targets = state.targets.map((target) => {
    const effects = normalizeTargetEffects(target.effects, now);
    const normalized = { ...target, frozenUntil: now < target.frozenUntil ? target.frozenUntil : 0, effects };
    if (target.ai) {
      const steered = steerTarget(normalized, player, dt, now);
		const fired = fireEnemyHazards({ ...state, player, nextId }, steered, now);
      nextId = fired.nextId;
		hazards.push(...fired.hazards);
      return fired.target;
    }
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
    if (isEnemy(target) && diedAt === null && overlaps(player, target) && now >= player.invulnerableUntil) {
      const preHit = { x: player.x, y: player.y };
		const health = Math.max(0, player.health - (target.kind === "sheriffBoss" ? 18 : 10));
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
    props: state.roomProps,
    build: state.build,
    rng: state.rng,
    player,
    trajectoryTargets: targets,
    teslaLinks: state.teslaLinks,
    teslaCooldowns: state.teslaCooldowns,
    fireRate: weapon.fireRate,
    cylinder,
  } as const;
  let combat = resolveCombatPhases({
    projectiles: state.projectiles,
    targets,
    scheduledProjectiles,
    pendingEmissions: state.pendingEmissions,
    areas: state.areas,
    vfxCommands: state.vfxCommands,
    metrics,
    nextId,
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
  nextId = combat.nextId;
  let vfxCommands = [...combat.vfxCommands];
  const orbitalKills: KillContext[] = [];
  const orbitalResult = advanceLocketOrbitals(
    locketOrbitals,
    player,
    finalTargets.filter(isEnemy),
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
      geometry: Object.freeze({
        type: "target",
        targetId: hit.targetId,
        at: Object.freeze({ x: hit.x, y: hit.y }),
      }),
    });
  }
  let pickups = [...state.pickups];
  let killedTargets = targets.filter((target) =>
    !target.immortal && target.health > 0 && !finalTargets.some((candidate) => candidate.id === target.id && candidate.health > 0));
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
    killedTargets = [...killedTargets, ...finalTargets.filter((target) =>
      !target.immortal && target.health > 0 && !combat.targets.some((candidate) => candidate.id === target.id && candidate.health > 0))];
    finalTargets = [...combat.targets];
    nextId = combat.nextId;
    vfxCommands = [...combat.vfxCommands];
  }
	const rewardedTargets = new Set<string>();
	for (const killed of killedTargets) if (killed.ai?.dropsBonus && !rewardedTargets.has(killed.id)) {
		rewardedTargets.add(killed.id);
		const kind = killed.ai.bonusKind ?? PICKUP_KINDS[Math.floor(state.rng() * PICKUP_KINDS.length) % PICKUP_KINDS.length]!;
		pickups = [...pickups, { id: `pickup-${nextId++}`, kind, x: killed.x, y: killed.y, radius: 16 }];
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
      ...(refund.lineageId ? { lineageId: refund.lineageId } : {}),
      destination: "world",
      bornAt: now,
      expiresAt: now + 0.2,
      geometry: Object.freeze({ type: "point", at: Object.freeze({ x: player.x, y: player.y }) }),
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
    geometry: Object.freeze({ type: "point", at: Object.freeze({ x: player.x, y: player.y }) }),
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
    geometry: Object.freeze({ type: "point", at: Object.freeze({ x: decoy.x, y: decoy.y }) }),
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
    geometry: Object.freeze({
      type: "orbit",
      center: Object.freeze({ x: player.x, y: player.y }),
      slot: orbital.slot,
      radius: orbital.radius,
      angle: orbital.angle,
    }),
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
    pickups,
    hazards,
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
  let advanced = next;
    const combatCleared = advanced.run?.phase === "combat" && !advanced.targets.some(isWaveObjective);
	if (combatCleared && advanced.pickups.length > 0 && dt > 0) {
		const pull = 520 * dt;
		advanced = {
			...advanced,
			pickups: advanced.pickups.map((pickup) => {
				const dx = advanced.player.x - pickup.x;
				const dy = advanced.player.y - pickup.y;
				const distance = Math.hypot(dx, dy);
				if (distance === 0 || distance <= pull) return { ...pickup, x: advanced.player.x, y: advanced.player.y };
				return { ...pickup, x: pickup.x + dx / distance * pull, y: pickup.y + dy / distance * pull };
			}),
		};
	}
  for (const pickup of [...advanced.pickups]) {
    if (overlaps(advanced.player, pickup)) advanced = collectPickup(advanced, pickup.id);
  }
    if (advanced.run?.phase === "combat" && !advanced.targets.some(isWaveObjective) && advanced.pickups.length === 0) {
		if (advanced.run.wave >= FINAL_WAVE) {
      advanced = { ...advanced, run: { ...advanced.run, phase: "complete", choices: [] } };
    } else {
      const nextWave = { ...advanced, run: { ...advanced.run, phase: "choice" as const, wave: advanced.run.wave + 1 } };
      advanced = { ...nextWave, run: { ...nextWave.run, choices: artifactChoices(nextWave) } };
    }
  }
  return advanced;
}
