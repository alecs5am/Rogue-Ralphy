import { expect, test } from "bun:test";
import { ARTIFACT_IDS, type ArtifactLoadout } from "./artifacts";
import { compileCombatBuild, type CombatBuild } from "./combat-build";
import { resolveCombatPhases, type CombatContext, type CombatRuntime } from "./combat-effects";
import { createMetrics } from "./metrics";
import { createCylinder } from "./cylinder";
import type { ProjectileState } from "./projectiles";
import { ROOM } from "./room";
import {
  createGame,
  setArtifactLoadout,
  spawnChaser,
  spawnDummy,
  updateGame,
  type GameState,
  type InputIntent,
} from "./simulation";

const allArtifacts = Object.fromEntries(ARTIFACT_IDS.map((id) => [id, true])) as ArtifactLoadout;
const STEP = 1 / 120;

const activeProjectile = (): ProjectileState => ({
  id: "projectile-1",
  triggerId: "trigger-1",
  generation: 0,
  rootTriggerId: "trigger-1",
  lineageId: "trigger-1:0",
  localOrdinal: 0,
  activatedEffectIds: ["baseRevolver.direct"],
  reactiveEffectIds: [],
  emittedEffectIds: [],
  originPower: 20,
  x: 480,
  y: 288,
  vx: 0,
  vy: 0,
  damage: 20,
  speed: 620,
  radius: 5,
  lifetime: 8,
  bornAt: 0,
  remainingBounces: 0,
  bounceRetention: 1,
  freezeChance: 0,
  freezeDuration: 0,
  behaviors: {},
  hitTargetIds: [],
  everHit: false,
  travelled: 0,
});

const runtime = (overrides: Partial<CombatRuntime> = {}): CombatRuntime => ({
  projectiles: [],
  targets: [],
  scheduledProjectiles: [],
  pendingEmissions: [],
  areas: [],
  vfxCommands: [],
  metrics: createMetrics(),
  nextId: 100,
  step: 1,
  now: 0,
  ...overrides,
});

const context = (build: CombatBuild, overrides: Partial<CombatContext> = {}): CombatContext => ({
  dt: 0,
  room: ROOM,
  props: [],
  build,
  rng: () => 0.9,
  player: { x: 480, y: 288, radius: 18 },
  trajectoryTargets: [],
  teslaLinks: [],
  teslaCooldowns: {},
  fireRate: 3,
  cylinder: createCylinder(),
  ...overrides,
});

test("the cumulative all-artifact boundary accepts child 294 and names the child-295 overflow", () => {
  const build = compileCombatBuild(allArtifacts);
  expect(build.maxDescendants).toBe(294);
  const source = {
    ...activeProjectile(),
    x: ROOM.maxX - 6,
    y: 288,
    vx: 620,
    remainingBounces: 1,
    bounceRetention: 0.9,
    activatedEffectIds: ["baseRevolver.direct", "pinball.bounce", "pinball.relay", "bootlegMint.copy"],
    reactiveEffectIds: ["baseRevolver.direct", "pinball.bounce", "pinball.relay", "bootlegMint.copy"],
    behaviors: { relay: { speedScale: 1.35, radius: 160, turnRate: 3 * Math.PI } },
    motionRules: build.motions.filter(({ artifactId }) => artifactId === "pinball"),
  } satisfies ProjectileState;
  const accepted = resolveCombatPhases(runtime({
    now: 0.01,
    projectiles: [source],
    descendantsByRoot: { "trigger-1": { rootTriggerId: "trigger-1", count: 293, limit: 294 } },
  }), context(build, { dt: 0.01 }));
  expect(accepted.descendantsByRoot?.["trigger-1"]).toEqual({ rootTriggerId: "trigger-1", count: 294, limit: 294 });
  expect(accepted.pendingEmissions.filter(({ effectId }) => effectId === "bootlegMint.copy")).toHaveLength(1);

  let overflow: unknown;
  try {
    resolveCombatPhases(runtime({
      now: 0.01,
      projectiles: [source],
      descendantsByRoot: { "trigger-1": { rootTriggerId: "trigger-1", count: 294, limit: 294 } },
    }), context(build, { dt: 0.01 }));
  } catch (error) {
    overflow = error;
  }
  expect(overflow).toBeInstanceOf(Error);
  expect((overflow as Error).name).toBe("DescendantOverflowError");
  expect((overflow as Error).message).toContain("trigger-1 exceeds 294");
});

type TapeRng = (() => number) & Readonly<{ values: number[] }>;

function tapeRng(seed: number): TapeRng {
  const tape = [0.9, 0.9, 0.1, 0.8, 0.2, 0.7, 0.32, 0.6, 0.34, 0.05];
  const values: number[] = [];
  let cursor = 0;
  let state = seed >>> 0;
  const rng = (() => {
    const value = cursor < tape.length
      ? tape[cursor]!
      : ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000);
    cursor += 1;
    values.push(value);
    return value;
  }) as TapeRng;
  Object.defineProperty(rng, "values", { value: values, enumerable: true });
  return rng;
}

const targetBodiesDoNotOverlap = (state: GameState): boolean => {
  const bodies = state.targets;
  for (let a = 0; a < bodies.length; a += 1) {
    for (let b = a + 1; b < bodies.length; b += 1) {
      const left = bodies[a]!;
      const right = bodies[b]!;
      if (Math.hypot(left.x - right.x, left.y - right.y) < left.radius + right.radius) return false;
    }
  }
  return true;
};

const directions = [
  { moveX: -1, moveY: 0 },
  { moveX: 0, moveY: 1 },
  { moveX: 1, moveY: 0 },
  { moveX: 0, moveY: -1 },
] as const;

const movementAt = (tick: number, period = 120) => directions[Math.floor((tick - 1) / period) % directions.length]!;

function perimeterIntent(state: GameState): Pick<InputIntent, "moveX" | "moveY" | "aimX" | "aimY"> {
  const edge = state.player.radius + 0.01;
  const left = state.player.x - state.room.minX <= edge;
  const right = state.room.maxX - state.player.x <= edge;
  const top = state.player.y - state.room.minY <= edge;
  const bottom = state.room.maxY - state.player.y <= edge;
  if (left && top) return { moveX: 1, moveY: 0, aimX: state.player.x, aimY: state.room.minY - 100 };
  if (right && top) return { moveX: 0, moveY: 1, aimX: state.room.maxX + 100, aimY: state.player.y };
  if (right && bottom) return { moveX: -1, moveY: 0, aimX: state.player.x, aimY: state.room.maxY + 100 };
  if (left && bottom) return { moveX: 0, moveY: -1, aimX: state.room.minX - 100, aimY: state.player.y };
  const boundaries = [
    { distance: state.player.x - state.room.minX, moveX: 0, moveY: -1, aimX: state.room.minX - 100, aimY: state.player.y },
    { distance: state.room.maxY - state.player.y, moveX: -1, moveY: 0, aimX: state.player.x, aimY: state.room.maxY + 100 },
    { distance: state.room.maxX - state.player.x, moveX: 0, moveY: 1, aimX: state.room.maxX + 100, aimY: state.player.y },
    { distance: state.player.y - state.room.minY, moveX: 1, moveY: 0, aimX: state.player.x, aimY: state.room.minY - 100 },
  ] as const;
  return boundaries.reduce((nearest, candidate) => candidate.distance < nearest.distance ? candidate : nearest);
}

type Maxima = Record<
  | "projectiles" | "scheduledProjectiles" | "pendingEmissions" | "areas" | "vfxCommands"
  | "teslaLinks" | "teslaCooldowns" | "hitHistory" | "targetStatuses" | "wakeTrails"
  | "wakePoints" | "wakeCooldowns" | "crossfirePulses" | "crossfireParticipation"
  | "bigIronPairHits" | "descendantRoots" | "relayLedger" | "emittedEffects"
  | "pendingEffectTokens" | "satellites" | "recoilWindows" | "pendingRefunds"
  | "bonanzaHistory" | "locketOrbitals" | "decoy" | "snareRoots" | "killReactionHistory"
  | "generationZeroPerTrigger" | "descendantsPerTrigger" | "teslaDegree",
  number
>;

const emptyMaxima = (): Maxima => ({
  projectiles: 0,
  scheduledProjectiles: 0,
  pendingEmissions: 0,
  areas: 0,
  vfxCommands: 0,
  teslaLinks: 0,
  teslaCooldowns: 0,
  hitHistory: 0,
  targetStatuses: 0,
  wakeTrails: 0,
  wakePoints: 0,
  wakeCooldowns: 0,
  crossfirePulses: 0,
  crossfireParticipation: 0,
  bigIronPairHits: 0,
  descendantRoots: 0,
  relayLedger: 0,
  emittedEffects: 0,
  pendingEffectTokens: 0,
  satellites: 0,
  recoilWindows: 0,
  pendingRefunds: 0,
  bonanzaHistory: 0,
  locketOrbitals: 0,
  decoy: 0,
  snareRoots: 0,
  killReactionHistory: 0,
  generationZeroPerTrigger: 0,
  descendantsPerTrigger: 0,
  teslaDegree: 0,
});

function activeStatusCount(state: GameState): number {
  return state.targets.reduce((sum, target) => {
    const effects = target.effects;
    return sum
      + Number(target.frozenUntil > state.time)
      + Number((effects?.chill?.count ?? 0) > 0)
      + Number(Boolean(effects?.burn))
      + Number(Boolean(effects?.hollowPoint))
      + Number((effects?.ledger?.count ?? 0) > 0)
      + (effects?.slows?.length ?? 0);
  }, 0);
}

function sampleMaxima(maxima: Maxima, state: GameState): void {
  const degree = new Map<string, number>();
  for (const { a, b } of state.teslaLinks) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  const sizes: Omit<Maxima, "generationZeroPerTrigger" | "descendantsPerTrigger"> = {
    projectiles: state.projectiles.length,
    scheduledProjectiles: state.scheduledProjectiles.length,
    pendingEmissions: state.pendingEmissions.length,
    areas: state.areas.length,
    vfxCommands: state.vfxCommands.length,
    teslaLinks: state.teslaLinks.length,
    teslaCooldowns: Object.keys(state.teslaCooldowns).length,
    hitHistory: state.metrics.hitEvents.length,
    targetStatuses: activeStatusCount(state),
    wakeTrails: Object.keys(state.wakeTrails).length,
    wakePoints: Math.max(0, ...Object.values(state.wakeTrails).map(({ segments }) => segments.length + 1)),
    wakeCooldowns: Object.keys(state.wakeCooldowns).length,
    crossfirePulses: state.crossfirePulses.length,
    crossfireParticipation: Object.keys(state.crossfireParticipation).length,
    bigIronPairHits: Object.keys(state.bigIronPairHits).length,
    descendantRoots: Object.keys(state.descendantsByRoot).length,
    relayLedger: Object.keys(state.relayLedger).length,
    emittedEffects: Object.keys(state.emittedEffects).length,
    pendingEffectTokens: state.pendingEffectTokens.length,
    satellites: state.satellites.length,
    recoilWindows: state.recoilWindows.length,
    pendingRefunds: state.pendingRefunds.length,
    bonanzaHistory: Object.keys(state.bonanzaHistory).length,
    locketOrbitals: state.locketOrbitals.length,
    decoy: Number(Boolean(state.decoy)),
    snareRoots: Object.keys(state.snareRoots).length,
    killReactionHistory: Object.keys(state.killReactionHistory).length,
    teslaDegree: Math.max(0, ...degree.values()),
  };
  for (const [key, value] of Object.entries(sizes) as [keyof typeof sizes, number][]) {
    maxima[key] = Math.max(maxima[key], value);
  }
  for (const { count } of Object.values(state.descendantsByRoot)) {
    maxima.descendantsPerTrigger = Math.max(maxima.descendantsPerTrigger, count);
  }
}

const damageEventKey = (event: GameState["metrics"]["hitEvents"][number]): string => [
  event.source, event.time, event.targetId, event.artifactId, event.effectId, event.rootTriggerId,
  event.lineageId ?? "", event.projectileId ?? "", event.damage, event.originPower, event.x, event.y,
].join("\0");

function collectNewDamageEvents(
  state: GameState,
  seen: WeakSet<object>,
  observed: GameState["metrics"]["hitEvents"],
): void {
  for (const event of state.metrics.hitEvents) {
    if (seen.has(event)) continue;
    seen.add(event);
    observed.push(event);
  }
}

function transientStateIsEmpty(state: GameState): boolean {
  return state.projectiles.length === 0
    && state.scheduledProjectiles.length === 0
    && state.pendingEmissions.length === 0
    && state.areas.length === 0
    && state.vfxCommands.length === 0
    && state.teslaLinks.length === 0
    && Object.keys(state.teslaCooldowns).length === 0
    && state.metrics.hitEvents.length === 0
    && Object.keys(state.wakeTrails).length === 0
    && Object.keys(state.wakeCooldowns).length === 0
    && state.crossfirePulses.length === 0
    && Object.keys(state.crossfireParticipation).length === 0
    && Object.keys(state.bigIronPairHits).length === 0
    && Object.keys(state.descendantsByRoot).length === 0
    && Object.keys(state.relayLedger).length === 0
    && Object.keys(state.emittedEffects).length === 0
    && state.pendingEffectTokens.length === 0
    && state.satellites.length === 0
    && state.recoilWindows.length === 0
    && state.pendingRefunds.length === 0
    && Object.keys(state.bonanzaHistory).length === 0
    && state.locketOrbitals.length === 0
    && state.decoy === undefined
    && state.wantedBrand === undefined
    && Object.keys(state.snareRoots).length === 0
    && Object.keys(state.killReactionHistory).length === 0
    && activeStatusCount(state) === 0;
}

function completeSnapshot(state: GameState): Omit<GameState, "rng" | "decoy" | "wantedBrand"> & {
  decoy?: NonNullable<GameState["decoy"]>;
  wantedBrand?: NonNullable<GameState["wantedBrand"]>;
} {
  const { rng: _rng, decoy, wantedBrand, ...snapshot } = state;
  return {
    ...snapshot,
    ...(decoy ? { decoy } : {}),
    ...(wantedBrand ? { wantedBrand } : {}),
  };
}

function expectFiniteTree(
  value: unknown,
  path = "state",
  stack = new Set<object>(),
  allowedRng?: () => number,
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
    return;
  }
  if (typeof value === "function" && path === "state.rng" && value === allowedRng) return;
  if (typeof value === "undefined" || typeof value === "symbol" || typeof value === "function" || typeof value === "bigint") {
    throw new Error(`${path} contains unsupported ${typeof value}`);
  }
  if (typeof value !== "object") throw new Error(`${path} contains unsupported ${typeof value}`);
  const object = value as object;
  if (stack.has(object)) throw new Error(`${path} contains a cycle`);
  const prototype = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
    throw new Error(`${path} has unsupported prototype`);
  }
  stack.add(object);
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key === "symbol") throw new Error(`${path} has a symbol key`);
    const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
    if (descriptor.get || descriptor.set) throw new Error(`${path}.${key} has an accessor`);
    expectFiniteTree(descriptor.value, `${path}.${key}`, stack, allowedRng);
  }
  stack.delete(object);
}

type StressRun = Readonly<{
  final: GameState;
  snapshot: ReturnType<typeof completeSnapshot>;
  maxima: Maxima;
  observed: GameState["metrics"]["hitEvents"];
  launchCounts: Readonly<Record<string, number>>;
  descendants: Readonly<Record<string, number>>;
  deadeyePressedAt: number;
  rngValues: readonly number[];
  drainedTicks: number;
}>;

function runStress(seed: number): StressRun {
  const rng = tapeRng(seed);
  let game = setArtifactLoadout(createGame(rng), allArtifacts);
  for (let index = 0; index < 5; index += 1) game = spawnDummy(game);
  for (const point of [
    { x: 96, y: 96 },
    { x: 288, y: 96 },
    { x: 672, y: 96 },
    { x: 864, y: 96 },
    { x: 96, y: 480 },
  ]) game = spawnChaser(game, point);
  const firstDummy = game.targets.find(({ kind }) => kind === "dummy")!;
  game = {
    ...game,
    player: { ...game.player, x: 780 },
    targets: game.targets.map((candidate) => candidate.id === firstDummy.id
      ? { ...candidate, x: 830, y: 288 }
      : candidate),
  };
  if (game.targets.filter(({ kind }) => kind === "dummy").length !== 5
    || game.targets.filter(({ kind }) => kind === "chaser").length !== 5
    || !targetBodiesDoNotOverlap(game)) throw new Error("stress fixture must spawn five nonoverlapping dummies and five chasers");
  if (Object.keys(game.artifacts).length !== ARTIFACT_IDS.length
    || ARTIFACT_IDS.some((id) => game.artifacts[id] !== true)) throw new Error("stress fixture must own every artifact exactly once");

  const maxima = emptyMaxima();
  const observed: GameState["metrics"]["hitEvents"] = [];
  const seenEvents = new WeakSet<object>();
  const launchCounts: Record<string, number> = {};
  const descendants: Record<string, number> = {};
  let priorRootSequence = 0;
  let deadeyePressedAt = -1;
  let automaticReloadSeen = false;
  let deadeyeBuffSeen = false;

  game = { ...game, stillwater: { progress: 0.6, charged: true } };
  for (let firingTick = 1; firingTick <= 1_200; firingTick += 1) {
    const now = firingTick / 120;
    if (firingTick === 121) game = { ...game, player: { ...game.player, x: 850 } };
    const canActiveReload = deadeyePressedAt < 0
      && game.cylinder.reloading
      && game.cylinder.reloadKind === "automatic"
      && now >= game.cylinder.sweetStart
      && now <= game.cylinder.sweetEnd;
    automaticReloadSeen ||= game.cylinder.reloading && game.cylinder.reloadKind === "automatic";
    const movement = firingTick === 1
      ? { moveX: 0, moveY: 0, aimX: 1_000, aimY: game.player.y }
      : firingTick <= 120
        ? { ...movementAt(firingTick, 15), aimX: 1_000, aimY: game.player.y }
        : perimeterIntent(game);
    const input: InputIntent = {
      ...movement,
      firing: true,
      reloadPressed: canActiveReload,
      paused: false,
    };
    if (canActiveReload) deadeyePressedAt = now;
    game = updateGame(game, input, STEP, now);
    if (game.player.health <= 0 || game.diedAt !== null) throw new Error(`Ralphy died during firing tick ${firingTick}`);
    deadeyeBuffSeen ||= game.cylinder.fireRateBuff === 0.2 && game.cylinder.buffUntil > now;

    if (game.rootSequence !== priorRootSequence) {
      for (let rootIndex = priorRootSequence + 1; rootIndex <= game.rootSequence; rootIndex += 1) {
        const rootTriggerId = `trigger-${rootIndex}`;
        const generationZero = [
          ...game.projectiles.filter(({ generation, rootTriggerId: root }) => generation === 0 && root === rootTriggerId),
          ...game.scheduledProjectiles.filter(({ generation, rootTriggerId: root }) => generation === 0 && root === rootTriggerId),
        ].length;
        launchCounts[rootTriggerId] = generationZero;
        maxima.generationZeroPerTrigger = Math.max(maxima.generationZeroPerTrigger, generationZero);
      }
      priorRootSequence = game.rootSequence;
    }
    for (const [rootTriggerId, { count }] of Object.entries(game.descendantsByRoot)) {
      descendants[rootTriggerId] = Math.max(descendants[rootTriggerId] ?? 0, count);
    }
    collectNewDamageEvents(game, seenEvents, observed);
    sampleMaxima(maxima, game);
  }

  if (!automaticReloadSeen || deadeyePressedAt < 0 || !deadeyeBuffSeen) {
    throw new Error("stress fixture did not press the first actual automatic Deadeye sweet-window tick");
  }
  const stopTime = 10;
  game = {
    ...game,
    player: { ...game.player, x: game.room.width / 2, y: game.room.height / 2, vx: 0, vy: 0 },
  };
  let drainedTicks = 0;
  for (let drainTick = 1; drainTick <= 8 * 120; drainTick += 1) {
    const tick = 1_200 + drainTick;
    const now = tick / 120;
    const movement = movementAt(drainTick, 60);
    game = updateGame(game, {
      ...movement,
      aimX: game.player.x + movement.moveX * 100,
      aimY: game.player.y + movement.moveY * 100,
      firing: false,
      reloadPressed: false,
      paused: false,
    }, STEP, now);
    if (Math.hypot(game.player.vx, game.player.vy) < 1) throw new Error(`drain movement dropped below one at ${now}`);
    for (const [rootTriggerId, { count }] of Object.entries(game.descendantsByRoot)) {
      descendants[rootTriggerId] = Math.max(descendants[rootTriggerId] ?? 0, count);
    }
    collectNewDamageEvents(game, seenEvents, observed);
    sampleMaxima(maxima, game);
    drainedTicks = drainTick;
    if (transientStateIsEmpty(game)) break;
  }
  if (game.time > stopTime + 8 + Number.EPSILON) throw new Error("stress drain exceeded stop + 8 seconds");

  expectFiniteTree(game, "state", new Set(), game.rng);
  const snapshot = completeSnapshot(game);
  return {
    final: game,
    snapshot,
    maxima,
    observed,
    launchCounts,
    descendants,
    deadeyePressedAt,
    rngValues: [...rng.values],
    drainedTicks,
  };
}

test("all thirty-six artifacts survive ten deterministic seconds and drain every bounded transient", () => {
  const first = runStress(0x5eed_c0de);
  const { final, maxima, observed } = first;

  expect(first.launchCounts["trigger-3"]).toBe(11);
  expect(maxima.generationZeroPerTrigger).toBeLessThanOrEqual(11);
  expect(final.build.maxDescendants).toBe(294);
  expect(maxima.descendantsPerTrigger).toBeLessThanOrEqual(294);
  expect(maxima.descendantsPerTrigger).toBeLessThan(384);
  expect(Object.values(first.descendants).every((count) => count <= final.build.maxDescendants)).toBe(true);
  expect(maxima.teslaDegree).toBeGreaterThan(0);
  const rootBound = final.rootSequence;
  const targetBound = 10;
  const effectBound = ARTIFACT_IDS.length;
  const lineageBound = rootBound * (11 + final.build.maxDescendants);
  const hitEffectBound = lineageBound * targetBound * effectBound;
  const collectionBounds: Maxima = {
    projectiles: lineageBound,
    scheduledProjectiles: lineageBound,
    pendingEmissions: lineageBound * effectBound,
    areas: lineageBound * effectBound,
    vfxCommands: hitEffectBound,
    teslaLinks: lineageBound,
    teslaCooldowns: lineageBound * 2 * targetBound,
    hitHistory: hitEffectBound,
    targetStatuses: targetBound * (effectBound + 5),
    wakeTrails: lineageBound,
    wakePoints: 97,
    wakeCooldowns: lineageBound * targetBound,
    crossfirePulses: lineageBound,
    crossfireParticipation: lineageBound,
    bigIronPairHits: lineageBound * targetBound,
    descendantRoots: rootBound,
    relayLedger: lineageBound * effectBound,
    emittedEffects: lineageBound * effectBound,
    pendingEffectTokens: lineageBound * effectBound,
    satellites: 6,
    recoilWindows: 2,
    pendingRefunds: rootBound,
    bonanzaHistory: rootBound,
    locketOrbitals: 3,
    decoy: 1,
    snareRoots: rootBound,
    killReactionHistory: rootBound * effectBound,
    generationZeroPerTrigger: 11,
    descendantsPerTrigger: final.build.maxDescendants,
    teslaDegree: 2,
  };
  for (const key of Object.keys(collectionBounds) as (keyof Maxima)[]) {
    expect(maxima[key]).toBeLessThanOrEqual(collectionBounds[key]);
  }
  expect(Object.values(maxima).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  expect(first.rngValues.some((value) => value < 0.33)).toBe(true);
  expect(first.rngValues.some((value) => value >= 0.33)).toBe(true);
  expect(first.deadeyePressedAt).toBeGreaterThan(0);
  expect(first.drainedTicks).toBeLessThanOrEqual(960);

  const sources = new Set(["direct", "link", "status", "area", "reactive"]);
  for (const event of observed) {
    expect(sources.has(event.source)).toBe(true);
    expect(event.targetId.length).toBeGreaterThan(0);
    expect(event.artifactId.length).toBeGreaterThan(0);
    expect(event.effectId.length).toBeGreaterThan(0);
    expect(event.rootTriggerId.length).toBeGreaterThan(0);
    expect(event.killReactionDepth === 0 || event.killReactionDepth === 1).toBe(true);
    expect([event.damage, event.time, event.originPower, event.x, event.y]
      .every((value) => typeof value === "number" && Number.isFinite(value))).toBe(true);
    expect(event.damage).toBeGreaterThan(0);
    expect(event.originPower).toBeGreaterThan(0);
    if (event.lineageId !== undefined) expect(event.lineageId.length).toBeGreaterThan(0);
    if (event.projectileId !== undefined) expect(event.projectileId.length).toBeGreaterThan(0);
    if (event.source === "direct") {
      expect(event.projectileId?.length).toBeGreaterThan(0);
      expect(event.lineageId?.length).toBeGreaterThan(0);
      expect(typeof event.firstProjectileHit).toBe("boolean");
    }
  }
  const direct = observed.filter(({ source }) => source === "direct");
  const successfulProjectileIds = new Set(direct.map(({ projectileId }) => projectileId!));
  for (const projectileId of successfulProjectileIds) {
    const projectileHits = direct.filter((event) => event.projectileId === projectileId);
    expect(projectileHits.filter(({ firstProjectileHit }) => firstProjectileHit === true)).toHaveLength(1);
  }
  expect(final.metrics.hits).toBe(direct.length);
  expect(final.metrics.secondaryHits).toBe(observed.length - direct.length);
  expect(final.metrics.successfulProjectiles).toBe(successfulProjectileIds.size);
  expect(final.metrics.projectiles).toBe(final.metrics.successfulProjectiles + final.metrics.misses);
  expect(final.telemetry.accuracy).toBe(final.metrics.projectiles
    ? final.metrics.successfulProjectiles / final.metrics.projectiles
    : 0);

  expect(final).toMatchObject({
    projectiles: [],
    scheduledProjectiles: [],
    pendingEmissions: [],
    areas: [],
    vfxCommands: [],
    teslaLinks: [],
    teslaCooldowns: {},
    wakeTrails: {},
    wakeCooldowns: {},
    crossfirePulses: [],
    crossfireParticipation: {},
    bigIronPairHits: {},
    descendantsByRoot: {},
    relayLedger: {},
    emittedEffects: {},
    pendingEffectTokens: [],
    satellites: [],
    recoilWindows: [],
    pendingRefunds: [],
    bonanzaHistory: {},
    locketOrbitals: [],
    snareRoots: {},
    killReactionHistory: {},
    stillwater: { progress: 0, charged: false },
    metrics: { hitEvents: [] },
  });
  expect(Object.hasOwn(final, "wantedBrand")).toBe(false);
  expect(Object.hasOwn(final, "decoy")).toBe(false);
  for (const target of final.targets) {
    expect(target).toMatchObject({
      frozenUntil: 0,
      effects: { chill: { count: 0, expiresAt: 0 }, ledger: { count: 0, expiresAt: 0 }, slows: [] },
    });
    expect(target.effects?.burn).toBeUndefined();
    expect(target.effects?.hollowPoint).toBeUndefined();
  }

  expect(structuredClone(first.snapshot)).toEqual(first.snapshot);
  expect(JSON.parse(JSON.stringify(first.snapshot))).toEqual(first.snapshot);
  const second = runStress(0x5eed_c0de);
  expect(second.snapshot).toEqual(first.snapshot);
  expect(second.maxima).toEqual(first.maxima);
  expect(second.launchCounts).toEqual(first.launchCounts);
  expect(second.descendants).toEqual(first.descendants);
  expect(second.observed.map(damageEventKey)).toEqual(first.observed.map(damageEventKey));
}, 130_000);
