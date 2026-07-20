import { expect, test } from "bun:test";
import type { ArtifactId, ArtifactLoadout } from "./artifacts";
import { compileCombatBuild, type CombatBuild } from "./combat-build";
import {
  resolveCombatPhases,
  resolveReactiveKillPhase,
  type CombatContext,
  type CombatRuntime,
  type CombatTargetState,
} from "./combat-effects";
import { createMetrics } from "./metrics";
import type { KillContext } from "./emissions";
import type { ProjectileState } from "./projectiles";
import { ROOM } from "./room";
import { applyDirectStatuses, createTargetEffects, type StatusRuntime } from "./statuses";
import { expandTrigger, type TriggerContext } from "./trigger";
import { createGame, setArtifactLoadout, updateGame } from "./simulation";
import { deriveWeapon } from "./weapon";

const STEP = 1 / 120;
const idle = {
  moveX: 0, moveY: 0, aimX: 900, aimY: 288,
  firing: false, reloadPressed: false, paused: false,
} as const;

const loadout = (ids: readonly ArtifactId[]): ArtifactLoadout =>
  Object.fromEntries(ids.map((id) => [id, true])) as ArtifactLoadout;

const trigger = (
  ids: readonly ArtifactId[],
  overrides: Partial<Omit<TriggerContext, "build" | "weapon">> = {},
) => {
  const build = compileCombatBuild(loadout(ids));
  return expandTrigger({
    rootTriggerId: "trigger-1",
    rootIndex: 1,
    round: { slot: 0, echo: null, ammoBefore: 6 },
    aim: 0,
    aimDistance: 192,
    origin: { x: 480, y: 288 },
    now: 0,
    stationaryCharged: false,
    health: 100,
    activeOrbitalCount: 0,
    dealerCounter: 0,
    locketState: { armed: false, cadence: 0 },
    satellites: [],
    build,
    weapon: deriveWeapon(build, 0),
    rng: () => 0.9,
    ...overrides,
  });
};

const target = (
  id: string,
  x: number,
  health = 100,
  overrides: Partial<CombatTargetState> = {},
): CombatTargetState => ({
  id,
  kind: "chaser",
  x,
  y: 300,
  radius: 6,
  health,
  maxHealth: health,
  immortal: false,
  speed: 0,
  frozenUntil: 0,
  effects: createTargetEffects(),
  ...overrides,
});

const projectile = (
  id: string,
  x: number,
  activatedEffectIds: readonly string[],
  overrides: Partial<ProjectileState> = {},
): ProjectileState => ({
  id,
  triggerId: "trigger-1",
  generation: 0,
  rootTriggerId: "trigger-1",
  lineageId: "trigger-1:0",
  localOrdinal: Number(id.replace(/\D/g, "")) || 0,
  activatedEffectIds: ["baseRevolver.direct", ...activatedEffectIds],
  reactiveEffectIds: ["baseRevolver.direct", ...activatedEffectIds],
  emittedEffectIds: [],
  originPower: 20,
  x,
  y: 300,
  vx: 620,
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
  returnLeg: "outbound",
  legTravelled: 0,
  outboundHitTargetIds: [],
  returnHitTargetIds: [],
  ...overrides,
});

const runtime = (build: CombatBuild, overrides: Partial<CombatRuntime> = {}): CombatRuntime => ({
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
  emittedEffects: {},
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
  ...overrides,
});

test("Twin + Tesla + Crossfire reconverges one canonical pulse without treating the muzzle as a crossing", () => {
  let game = setArtifactLoadout(createGame(() => 0.1), loadout([
    "twinChamber", "teslaBullets", "crossfireCovenant",
  ]));
  const input = { ...idle, aimX: game.player.x + 192, aimY: game.player.y };
  game = updateGame(game, { ...input, firing: true }, 0, 0);

  const roots = game.projectiles.filter(({ generation }) => generation === 0);
  expect(roots).toHaveLength(3);
  expect(roots.map(({ damage, radius, speed }) => [damage, radius, speed])).toEqual([
    [14, 5, 620], [14, 5, 620], [14, 5, 620],
  ]);
  expect(roots.filter(({ converge }) => converge).map(({ behaviors, converge }) => [
    behaviors.converge?.distance, converge?.distance,
  ])).toEqual([[192, 192], [192, 192]]);
  expect(game.crossfirePulses).toEqual([]);

  let previousTwinDistances = [0, 0];
  for (let tick = 1; tick <= 90 && game.crossfirePulses.length === 0; tick += 1) {
    previousTwinDistances = game.projectiles
      .filter(({ id }) => id === "projectile-1" || id === "projectile-2")
      .map(({ travelled }) => travelled);
    game = updateGame(game, input, STEP, tick / 120);
  }

  expect(game.crossfirePulses).toEqual([expect.objectContaining({
    pairId: "projectile-1:projectile-2",
    rootTriggerId: "trigger-1",
    projectileId: "projectile-1",
    damage: 3.5,
  })]);
  const pulse = game.crossfirePulses[0]!;
  const canonicalSource = pulse.pairId.split(":")[0]!;
  expect(pulse.projectileId).toBe(canonicalSource);
  expect(previousTwinDistances.every((distance) => distance < 192)).toBe(true);
  const converged = game.projectiles.filter(({ id }) => id === "projectile-1" || id === "projectile-2");
  expect(converged).toHaveLength(2);
  expect(converged.every(({ travelled, convergeDone, convergeOffset }) =>
    travelled >= 192 && convergeDone === true && convergeOffset === 0)).toBe(true);
  expect(converged.map(({ x, y }) => [x, y])).toEqual([
    [expect.closeTo(pulse.x, 10), expect.closeTo(pulse.y, 10)],
    [expect.closeTo(pulse.x, 10), expect.closeTo(pulse.y, 10)],
  ]);
  expect(game.teslaLinks.length).toBeGreaterThan(0);
  expect(game.teslaLinks.every(({ a, b }) => a.localeCompare(b) < 0)).toBe(true);
  const degree = new Map<string, number>();
  for (const { a, b } of game.teslaLinks) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  expect(degree.size).toBeGreaterThan(0);
  expect([...degree.values()].every((value) => value <= 2)).toBe(true);
});

test("Deadeye + Grave + Fan snapshots three roots and six inert copies at the exact times", () => {
  const ids = ["deadeye", "graveEcho", "fanThePhantom"] as const;
  const result = trigger(ids, {
    now: 1,
    round: { slot: 0, echo: { delay: 0.12, damageScale: 0.35 }, ammoBefore: 6 },
  });
  const roots = result.projectiles.filter(({ generation }) => generation === 0);
  const deadeye = result.projectiles.filter(({ emission }) => emission?.effectId === "deadeye.echo");
  const grave = result.projectiles.filter(({ emission }) => emission?.effectId === "graveEcho.copy");

  expect(roots.map(({ at, spec }) => [at, spec.damage])).toEqual([[1, 9], [1.09, 9], [1.18, 9]]);
  expect(deadeye.map(({ at, spec }) => [at, spec.damage])).toEqual([
    [1.12, 3.15], [1.21, 3.15], [expect.closeTo(1.3, 12), 3.15],
  ]);
  expect(grave.map(({ at, spec }) => [at, spec.damage])).toEqual([
    [1.28, 3.6], [1.37, 3.6], [1.46, 3.6],
  ]);
  expect(deadeye.every(({ emission }) => emission?.artifactId === "deadeye"
    && emission.effectId === "deadeye.echo")).toBe(true);
  expect(grave.every(({ emission }) => emission?.artifactId === "graveEcho"
    && emission.effectId === "graveEcho.copy")).toBe(true);
  expect([...deadeye, ...grave]).toHaveLength(6);
  const emissionEffectIds = new Set(compileCombatBuild(loadout(ids)).emissions.map(({ effectId }) => effectId));
  for (const copy of [...deadeye, ...grave]) {
    const parent = roots.find(({ lineageId }) => lineageId === copy.lineageId)!;
    expect(copy).toMatchObject({
      rootTriggerId: parent.rootTriggerId,
      lineageId: parent.lineageId,
      spec: { heading: parent.spec.heading },
      origin: parent.origin,
      reactiveEffectIds: [],
    });
    expect(copy.effectIds.filter((effectId) => emissionEffectIds.has(effectId))).toEqual([]);
  }
});

test("Halo + Shotgun + Wailing + Ghost splits on actual path into eight steerable phased children", () => {
  let game = setArtifactLoadout(createGame(() => 0.9), loadout([
    "haloChamber", "shotgun", "wailingLead", "ghostSight",
  ]));
  const input = { ...idle, aimY: game.player.y };
  game = updateGame(game, { ...input, firing: true }, 0, 0);

  for (let tick = 1; tick <= 90 && !game.pendingEmissions.some(({ effectId }) => effectId === "shotgun.split"); tick += 1) {
    game = updateGame(game, input, STEP, tick / 120);
  }
  const split = game.pendingEmissions.find(({ effectId }) => effectId === "shotgun.split")!;
  expect(split.templates).toHaveLength(8);
  expect(split.templates?.map(({ damage, radius, wavePhase }) => [damage, radius, wavePhase])).toEqual(
    Array.from({ length: 8 }, (_, index) => [5, 2.75, 2 * Math.PI * index / 8]),
  );

  game = updateGame(game, input, 0, game.time);
  let children = game.projectiles.filter(({ emission }) => emission?.effectId === "shotgun.split");
  expect(children).toHaveLength(8);
  const anchor = children[0]!;
  const targetId = "steering-target";
  game = {
    ...game,
    targets: [...game.targets, target(targetId, anchor.x + 72, 500, {
      y: anchor.y + 16,
      radius: 8,
      immortal: true,
    })],
  };
  game = updateGame(game, input, STEP, game.time + STEP);
  children = game.projectiles.filter(({ emission }) => emission?.effectId === "shotgun.split");
  expect(children.every(({ motionRules, homingTargetId, activatedEffectIds, reactiveEffectIds }) =>
    motionRules?.some(({ kind }) => kind === "spiral")
    && motionRules.some(({ kind }) => kind === "wave")
    && motionRules.some(({ kind }) => kind === "homing")
    && homingTargetId === targetId
    && !activatedEffectIds.includes("shotgun.split")
    && reactiveEffectIds.length === 0)).toBe(true);
  const childIds = new Set(children.map(({ id }) => id));
  for (let tick = 1; tick <= 60 && !game.metrics.hitEvents.some(({ projectileId }) => projectileId && childIds.has(projectileId)); tick += 1) {
    game = updateGame(game, input, STEP, game.time + STEP);
  }
  expect(game.metrics.hitEvents.some(({ source, targetId: hitTargetId, projectileId }) =>
    source === "direct" && hitTargetId === targetId && projectileId !== undefined && childIds.has(projectileId))).toBe(true);
});

test("Pinball + Mint + Return snapshots the first bounce and keeps leg hit histories independent", () => {
  const build = compileCombatBuild(loadout(["pinball", "bootlegMint", "undertakersReturn"]));
  const effects = ["pinball.bounce", "pinball.relay", "bootlegMint.copy", "undertakersReturn.return"];
  const source = projectile("projectile-1", ROOM.maxX - 6, effects, {
    remainingBounces: 1,
    bounceRetention: 0.9,
    motionRules: build.motions,
    behaviors: { relay: { speedScale: 1.35, radius: 160, turnRate: 3 * Math.PI } },
  });
  let state = resolveCombatPhases(runtime(build, { projectiles: [source], now: 0.01 }), context(build, { dt: 0.01 }));
  const bounced = state.projectiles[0]!;
  const mint = state.pendingEmissions.find(({ effectId }) => effectId === "bootlegMint.copy")!;
  expect(bounced).toMatchObject({ damage: 18, remainingBounces: 0 });
  expect(bounced.speed).toBeCloseTo(837, 10);
  expect(mint.templates?.[0]).toMatchObject({ maxTravel: 160 });
  expect(mint.templates?.[0]!.damage).toBeCloseTo(5.4, 12);
  expect(mint.templates?.[0]!.radius).toBeCloseTo(2.75, 12);
  expect(Math.abs(mint.templates?.[0]!.baseHeading ?? 0)).toBeCloseTo(Math.PI / 2, 12);
  expect(state.relayLedger).toEqual({ "trigger-1:0": { rootTriggerId: "trigger-1" } });

  const returnOnly = build.motions.filter(({ kind }) => kind === "return");
  state = resolveCombatPhases({
    ...state,
    projectiles: [{
      ...bounced,
      motionRules: returnOnly,
      penetration: { obstacles: true, targets: true },
      behaviors: { penetration: { obstacles: true, targets: true } },
      outboundHitTargetIds: [],
      returnHitTargetIds: [],
      hitTargetIds: [],
    }],
    targets: [target("same-target", 750, 500, { y: 300, radius: 0, immortal: true })],
    pendingEmissions: [],
    now: 0.01 + 420 / bounced.speed,
    step: state.step + 1,
  }, context(build, { dt: 420 / bounced.speed }));
  expect(state.projectiles[0]).toMatchObject({
    returnLeg: "return",
    outboundHitTargetIds: ["same-target"],
    returnHitTargetIds: ["same-target"],
    hitTargetIds: ["same-target"],
  });
  expect(state.projectiles[0]!.damage).toBeCloseTo(11.7, 12);
  expect(state.projectiles[0]!.travelled).toBeGreaterThanOrEqual(240);
  const legHits = state.metrics.hitEvents.filter(({ targetId }) => targetId === "same-target");
  expect(legHits.map(({ source }) => source)).toEqual(["direct", "direct"]);
  expect(legHits[0]!.damage).toBeCloseTo(18, 12);
  expect(legHits[1]!.damage).toBeCloseTo(11.7, 12);
});

test("Hollow + Bone + Comet stores current damage once, emits one shard batch, then detonates", () => {
  const build = compileCombatBuild(loadout(["hollowPoint", "boneOrchard", "cometSpur"]));
  const effects = ["hollowPoint.charge", "boneOrchard.shards", "cometSpur.comet"];
  expect(build.areas.find(({ effectId }) => effectId === "hollowPoint.explosion")).toMatchObject({
    kind: "explosion", radius: 64, damageScale: 1,
  });
  const first = projectile("projectile-1", 300, effects, {
    damage: 27,
    radius: 7.5,
    originPower: 27,
    bornAt: 0,
    motionRules: build.motions,
    cometSpeedFactor: 1.5,
    cometRadiusFactor: 1.5,
    cometDamageFactor: 1.35,
  });
  let state = resolveCombatPhases(runtime(build, {
    now: 1,
    projectiles: [first],
    targets: [target("charged", 300, 200), target("edge", 364, 200), target("outside", 365, 200)],
  }), context(build));
  expect(state.targets.find(({ id }) => id === "charged")?.effects?.hollowPoint?.damage).toBe(16.2);
  const shards = state.pendingEmissions.find(({ effectId }) => effectId === "boneOrchard.shards")!;
  expect(shards.templates?.map(({ damage, radius, maxTravel }) => [damage, radius, maxTravel])).toEqual([
    [5.4, 4.125, 160], [5.4, 4.125, 160], [5.4, 4.125, 160],
  ]);

  state = resolveCombatPhases({
    ...state,
    projectiles: [projectile("projectile-2", 300, effects, {
      lineageId: "trigger-1:0",
      damage: 27,
      radius: 7.5,
      originPower: 27,
    })],
    pendingEmissions: [],
    now: 1.1,
    step: state.step + 1,
  }, context(build));
  expect(state.metrics.hitEvents.filter(({ source }) => source === "direct").at(-1)?.damage).toBe(27);
  const explosions = state.metrics.hitEvents.filter(({ effectId }) => effectId === "hollowPoint.explosion");
  expect(explosions.map(({ targetId }) => targetId).sort()).toEqual(["charged", "edge"]);
  expect(explosions.every(({ source, damage, originPower }) =>
    source === "area" && damage === 16.2 && originPower === 27)).toBe(true);
  expect(state.targets.find(({ id }) => id === "charged")?.effects?.hollowPoint).toBeUndefined();
  expect(state.pendingEmissions.filter(({ effectId }) => effectId === "boneOrchard.shards")).toEqual([]);
});

test("Cold + Cinder + Hex + Snare resolves four ordered hits into shatter, copied statuses, and one pool", () => {
  const build = compileCombatBuild(loadout(["coldcaster", "cinderGospel", "hexBell", "ectoplasmSnare"]));
  const effects = [
    "coldcaster.chill", "coldcaster.shatter", "cinderGospel.burn", "cinderGospel.emberRing",
    "hexBell.pulse", "ectoplasmSnare.pool",
  ];
  let status: StatusRuntime = {
    targets: [
      { ...target("source", 300, 500), effects: createTargetEffects() },
      { ...target("copy", 350, 500), effects: createTargetEffects() },
    ],
    hexCounter: 0,
    snareRoots: {},
  };
  const stages: ReturnType<typeof applyDirectStatuses>[] = [];
  for (const [index, now] of [1, 1.1, 1.2].entries()) {
    const result = applyDirectStatuses({
      runtime: status,
      targetId: "source",
      targetWasAlive: true,
      projectile: projectile(`projectile-${index + 1}`, 300, effects, { localOrdinal: index }),
      build,
      now,
      impactPoint: { x: 300, y: 300 },
      player: { x: 480, y: 288 },
    });
    stages.push(result);
    status = {
      targets: result.targets,
      wantedBrand: result.wantedBrand,
      hexCounter: result.hexCounter,
      snareRoots: result.snareRoots,
    };
  }
  expect(stages[0]!.targets[0]!.effects.chill).toEqual({ count: 1, expiresAt: 3 });
  expect(stages[1]!.targets[0]!.effects.chill).toEqual({ count: 2, expiresAt: 3.1 });
  expect(stages[2]!.targets[0]).toMatchObject({
    frozenUntil: 2.25,
    effects: { chill: { count: 0, expiresAt: 0 }, burn: { nextTickAt: 1.4 } },
  });
  expect(stages[2]!.shatter).toBeUndefined();
  const pools = stages.flatMap(({ areas }) => areas);
  expect(pools).toEqual([expect.objectContaining({
    kind: "snare", radius: 40, bornAt: 1, expiresAt: 2.5,
    tickInterval: 0.1, damage: 0.8,
  })]);

  const state = resolveCombatPhases(runtime(build, {
    now: 1.3,
    step: 4,
    projectiles: [projectile("projectile-4", 300, effects, { localOrdinal: 3 })],
    targets: status.targets,
    hexCounter: status.hexCounter,
    snareRoots: status.snareRoots,
  }), context(build));
  const marked = state.targets.find(({ id }) => id === "source")!;
  const copied = state.targets.find(({ id }) => id === "copy")!;
  expect(marked.effects).toMatchObject({
    chill: { count: 1, expiresAt: 3.3 },
    burn: { potency: 2, remainingTicks: 4, nextTickAt: 1.4 },
  });
  expect(marked.frozenUntil).toBe(0);
  expect(state.pendingEmissions.find(({ effectId }) => effectId === "coldcaster.shatter")?.templates
    ?.map(({ damage, radius, maxTravel }) => [damage, radius, maxTravel])).toEqual([
      [3, 2.25, 128], [3, 2.25, 128], [3, 2.25, 128], [3, 2.25, 128],
    ]);
  expect(copied.effects).toMatchObject({
    chill: { count: 1, expiresAt: 3.3 },
    burn: { potency: 2, remainingTicks: 4 },
    ledger: { count: 0, expiresAt: 0 },
  });
  expect(copied.effects?.burn?.nextTickAt).toBeCloseTo(1.7, 12);
  expect(copied).toMatchObject({ frozenUntil: 0 });
  expect(copied.effects?.hollowPoint).toBeUndefined();
  expect(state.areas).toEqual([]);
  expect(Object.keys(state.snareRoots ?? {})).toEqual(["ectoplasmSnare.pool\0trigger-1"]);
});

test("Big Iron + Posse + Tesla launches the exact heavy pair, then one inert Posse shot", () => {
  let game = setArtifactLoadout(createGame(() => 0.9), loadout(["bigIron", "ghostPosse", "teslaBullets"]));
  const input = { ...idle, aimY: game.player.y };
  game = updateGame(game, { ...input, firing: true }, 0, 0);
  const firstMains = game.projectiles.filter(({ generation, rootTriggerId }) => generation === 0 && rootTriggerId === "trigger-1");
  const firstMoonlets = game.projectiles.filter(({ emission, rootTriggerId }) =>
    rootTriggerId === "trigger-1" && emission?.effectId === "bigIron.moonlet");
  expect(firstMains).toHaveLength(1);
  expect(firstMoonlets).toHaveLength(1);
  const firstMain = firstMains[0]!;
  const firstMoonlet = firstMoonlets[0]!;
  expect(firstMain).toMatchObject({ damage: 24, radius: 6.25, speed: 496 });
  expect(firstMoonlet).toMatchObject({ generation: 1, radius: 3.125 });
  expect(firstMoonlet.damage).toBeCloseTo(8.4, 12);
  expect(game.satellites).toHaveLength(1);
  expect(game.projectiles.some(({ emission }) => emission?.effectId === "ghostPosse.shot")).toBe(false);
  expect(game.teslaLinks.some(({ a, b }) =>
    (a === firstMain.id && b === firstMoonlet.id) || (a === firstMoonlet.id && b === firstMain.id))).toBe(true);

  game = updateGame(game, { ...input, firing: true }, 0, 0.34);
  const posse = game.projectiles.filter(({ emission }) => emission?.effectId === "ghostPosse.shot");
  expect(game.satellites).toEqual([expect.objectContaining({
    id: "satellite-trigger-2", rootTriggerId: "trigger-2", bornAt: 0.34,
  })]);
  expect(posse).toHaveLength(1);
  expect(posse[0]).toMatchObject({
    generation: 1,
    rootTriggerId: "trigger-2",
    lineageId: "trigger-2:posse:satellite-trigger-1",
    damage: 4,
    emission: { artifactId: "ghostPosse", effectId: "ghostPosse.shot" },
  });
  expect(posse[0]!.behaviors.tesla).toBeDefined();
  for (const shot of [firstMoonlet, posse[0]!]) {
    expect(shot.activatedEffectIds).toContain("teslaBullets.link");
    expect(shot.activatedEffectIds).not.toContain("bigIron.heavy");
    expect(shot.activatedEffectIds).not.toContain("ghostPosse.satellite");
    expect(shot.activatedEffectIds).not.toContain("ectoplasmicWake.trail");
    expect(shot.activatedEffectIds).not.toContain("crossfireCovenant.cross");
  }
  const degree = new Map<string, number>();
  for (const { a, b } of game.teslaLinks) {
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  const generationOneIds = new Set(game.projectiles.filter(({ generation }) => generation === 1).map(({ id }) => id));
  expect(game.teslaLinks.length).toBeGreaterThan(0);
  expect(game.teslaLinks.some(({ a, b }) => generationOneIds.has(a) || generationOneIds.has(b))).toBe(true);
  expect(degree.size).toBeGreaterThan(0);
  expect([...degree.values()].every((value) => value <= 2)).toBe(true);
});

test("Stillwater + Shotgun + Dustline transfers only a 32 px token and fires one inert afterimage", () => {
  let game = setArtifactLoadout(createGame(() => 0.9), loadout(["stillwater", "shotgun", "dustlineDuel"]));
  const input = { ...idle, aimY: game.player.y };
  for (let tick = 1; tick <= 71; tick += 1) game = updateGame(game, input, STEP, tick / 120);
  expect(game.stillwater.charged).toBe(false);
  expect(game.stillwater.progress).toBeCloseTo(71 / 120, 12);
  game = updateGame(game, { ...input, firing: true }, STEP, 72 / 120);
  expect(game.projectiles[0]).toMatchObject({
    damage: 32, radius: 10, penetration: { obstacles: true, targets: true },
  });
  expect(game.stillwater).toEqual({ progress: 0, charged: false });

  const splitStepAt = 72 / 120 + 160 / 620;
  const crossedAt = 71 / 120 + 160 / 620;
  game = updateGame(game, input, 160 / 620, splitStepAt);
  const split = game.pendingEmissions.find(({ effectId }) => effectId === "shotgun.split")!;
  const afterimage = game.pendingEmissions.find(({ effectId }) => effectId === "dustlineDuel.afterimage")!;
  expect(split.templates?.map(({ damage, radius, pendingEffectTokens }) => [
    damage, radius, pendingEffectTokens?.map(({ distance }) => distance),
  ])).toEqual(Array.from({ length: 8 }, () => [8, 5.5, [32]]));
  expect(afterimage.atTime).toBeCloseTo(crossedAt + 0.12, 12);

  game = updateGame(game, input, 0, splitStepAt);
  game = updateGame(game, input, 0, splitStepAt + 0.12);
  const echo = game.projectiles.find(({ emission }) => emission?.effectId === "dustlineDuel.afterimage")!;
  expect(echo).toMatchObject({ generation: 1, damage: 11.2, maxTravel: 192 });
  expect(echo.activatedEffectIds).not.toContain("dustlineDuel.threshold");
  expect(echo.reactiveEffectIds).toEqual([]);
});

test("Harvester + Brand + Bonanza reacts once to a root and ignores generation-one and depth-one kills", () => {
  const build = compileCombatBuild(loadout(["soulHarvester", "wantedBrand", "bonanzaClip"]));
  const effects = ["soulHarvester.spirits", "wantedBrand.brand", "bonanzaClip.refund"];
  let state = resolveCombatPhases(runtime(build, {
    now: 1,
    projectiles: [projectile("projectile-1", 300, effects)],
    targets: [target("victim", 300, 1), target("survivor-b", 350), target("survivor-a", 350)],
  }), context(build));
  const spirits = state.pendingEmissions.find(({ effectId }) => effectId === "soulHarvester.spirits")!;
  expect(state.wantedBrand).toEqual({ targetId: "survivor-a", expiresAt: 4 });
  expect(spirits.templates?.map(({ damage, soulTargetId }) => [damage, soulTargetId])).toEqual([
    [7, "survivor-a"], [7, "survivor-b"],
  ]);
  expect(spirits.originPower).toBe(20);
  expect(state.pendingRefunds).toEqual([expect.objectContaining({
    effectId: "bonanzaClip.refund", rootTriggerId: "trigger-1",
    arrivesAt: expect.closeTo(1.25, 12),
  })]);

  const before = {
    descendants: state.descendantsByRoot?.["trigger-1"]?.count,
    refunds: state.pendingRefunds?.length,
    emitted: Object.keys(state.emittedEffects ?? {}).length,
    bonanza: Object.keys(state.bonanzaHistory ?? {}).length,
  };
  const ordinarySameRoot: KillContext = {
    victimId: "ordinary-later", x: 300, y: 300, time: 1.005,
    source: "direct", generation: 0, reactiveEffectIds: effects,
    artifactId: "baseRevolver", effectId: "baseRevolver.direct",
    rootTriggerId: "trigger-1", lineageId: "trigger-1:0", projectileId: "ordinary-later",
    originPower: 20, killReactionDepth: 0,
    sourceProjectile: projectile("ordinary-later", 300, effects),
  };
  state = resolveReactiveKillPhase(state, context(build), [ordinarySameRoot]);
  expect({
    descendants: state.descendantsByRoot?.["trigger-1"]?.count,
    refunds: state.pendingRefunds?.length,
    emitted: Object.keys(state.emittedEffects ?? {}).length,
    bonanza: Object.keys(state.bonanzaHistory ?? {}).length,
  }).toEqual(before);
  state = resolveCombatPhases({
    ...state,
    projectiles: [projectile("projectile-child", 350, effects, {
      generation: 1,
      emission: { artifactId: "soulHarvester", effectId: "soulHarvester.spirits" },
      damage: 200,
      reactiveEffectIds: [],
    })],
    pendingEmissions: state.pendingEmissions,
    now: 1.01,
    step: state.step + 1,
  }, context(build));
  const depthOne: KillContext = {
    victimId: "already-dead", x: 300, y: 300, time: 1.02,
    source: "reactive", generation: 0, reactiveEffectIds: effects,
    artifactId: "cinderGospel", effectId: "cinderGospel.emberRing",
    rootTriggerId: "trigger-1", lineageId: "trigger-1:0", originPower: 20,
    killReactionDepth: 1,
  };
  state = resolveReactiveKillPhase(state, context(build), [depthOne]);
  expect({
    descendants: state.descendantsByRoot?.["trigger-1"]?.count,
    refunds: state.pendingRefunds?.length,
    emitted: Object.keys(state.emittedEffects ?? {}).length,
    bonanza: Object.keys(state.bonanzaHistory ?? {}).length,
  }).toEqual(before);
});
