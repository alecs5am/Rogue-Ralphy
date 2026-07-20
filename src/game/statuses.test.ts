import { describe, expect, test } from "bun:test";
import { compileCombatBuild } from "./combat-build";
import type { ProjectileState } from "./projectiles";
import {
  advanceStatuses,
  applyDirectStatuses,
  createTargetEffects,
  effectiveSlow,
  selectBrandTarget,
  type StatusRuntime,
  type StatusTarget,
} from "./statuses";

const ROW_FOUR = [
  ["coldcaster", { stacks: 3, stackDuration: 2, freeze: 1.05, shards: 4, shardDamage: 0.15, shardRadius: 0.45, shardRange: 128 }],
  ["cinderGospel", { ticks: 4, interval: 0.4, damage: 0.10, deathRadius: 64, deathDamage: 0.20 }],
  ["wantedBrand", { duration: 3, steer: 2 * Math.PI / 3, jumpRadius: 240 }],
  ["widowsLedger", { hits: 5, duration: 2, lineDamage: 1.20 }],
  ["ectoplasmSnare", { radius: 40, duration: 1.5, tickRate: 10, tickDamage: 0.04, slow: 0.50 }],
  ["hexBell", { cadence: 4, radius: 80, slow: 0.60, slowDuration: 1 }],
] as const;

const projectile = (overrides: Partial<ProjectileState> = {}): ProjectileState => ({
  id: "projectile-1", triggerId: "trigger-1", generation: 0,
  rootTriggerId: "trigger-1", lineageId: "trigger-1:0", localOrdinal: 0,
  activatedEffectIds: ["baseRevolver.direct"], emittedEffectIds: [], originPower: 20,
  x: 100, y: 100, vx: 100, vy: 0, damage: 20, speed: 100, radius: 5,
  lifetime: 8, bornAt: 0, remainingBounces: 0, bounceRetention: 1,
  freezeChance: 0, freezeDuration: 0, behaviors: {}, hitTargetIds: [], everHit: false, travelled: 0,
  ...overrides,
});

const target = (id: string, x = 100, overrides: Partial<StatusTarget> = {}): StatusTarget => ({
  id, kind: "chaser", x, y: 100, radius: 18, health: 100, maxHealth: 100,
  immortal: false, speed: 85, frozenUntil: 0, effects: createTargetEffects(),
  ...overrides,
});

const runtime = (targets: readonly StatusTarget[], overrides: Partial<StatusRuntime> = {}): StatusRuntime => ({
  targets,
  hexCounter: 0,
  snareRoots: {},
  ...overrides,
});

const hit = (
  state: StatusRuntime,
  targetId: string,
  source: ProjectileState,
  now: number,
  loadout: Parameters<typeof compileCombatBuild>[0],
) => applyDirectStatuses({
  runtime: state,
  targetId,
  targetWasAlive: true,
  projectile: source,
  build: compileCombatBuild(loadout),
  now,
  impactPoint: { x: state.targets.find(({ id }) => id === targetId)!.x, y: 100 },
  player: { x: 0, y: 100 },
});

describe("row-four signature reducers", () => {
  test("Coldcaster uses strict deadlines and only generation zero consumes an existing freeze", () => {
    const ids = ["baseRevolver.direct", "coldcaster.chill", "coldcaster.shatter"];
    let result = hit(runtime([target("marked")]), "marked", projectile({ activatedEffectIds: ids }), 0, { coldcaster: true });
    expect(result.targets[0]!.effects.chill).toEqual({ count: 1, expiresAt: ROW_FOUR[0][1].stackDuration });
    result = hit(result, "marked", projectile({ id: "projectile-2", activatedEffectIds: ids }), 2, { coldcaster: true });
    expect(result.targets[0]!.effects.chill).toEqual({ count: 1, expiresAt: 4 });

    result = hit(runtime([target("marked")]), "marked", projectile({ activatedEffectIds: ids }), 0, { coldcaster: true });
    result = hit(result, "marked", projectile({ id: "projectile-2", activatedEffectIds: ids }), 0.1, { coldcaster: true });
    const generationOne = projectile({ id: "projectile-3", generation: 1, activatedEffectIds: ids });
    result = hit(result, "marked", generationOne, 0.2, { coldcaster: true });
    expect(result.targets[0]!.frozenUntil).toBeCloseTo(0.2 + ROW_FOUR[0][1].freeze);
    expect(result.shatter).toBeUndefined();

    result = hit(result, "marked", projectile({ id: "projectile-4", activatedEffectIds: ids }), 0.3, { coldcaster: true });
    expect(result.shatter?.headings).toEqual([0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]);
    expect(result.shatter?.rule).toMatchObject({ count: 4, damageScale: 0.15, radiusScale: 0.45, range: 128 });
    expect(result.targets[0]!.frozenUntil).toBe(0);
    expect(result.targets[0]!.effects.chill).toEqual({ count: 1, expiresAt: 2.3 });
  });

  test("Cinder Gospel preserves an earlier tick and replaces provenance only with stronger burn", () => {
    const effectIds = ["baseRevolver.direct", "cinderGospel.burn", "cinderGospel.emberRing"];
    let result = hit(runtime([target("marked")]), "marked", projectile({ activatedEffectIds: effectIds }), 0, { cinderGospel: true });
    expect(result.targets[0]!.effects.burn).toMatchObject({
      potency: 2, remainingTicks: ROW_FOUR[1][1].ticks, nextTickAt: 0.4,
      originPower: 20, rootTriggerId: "trigger-1", reactiveEligible: true,
    });

    result = hit(result, "marked", projectile({
      id: "projectile-2", rootTriggerId: "weaker", lineageId: "weaker:0",
      damage: 10, activatedEffectIds: effectIds,
    }), 0.2, { cinderGospel: true });
    expect(result.targets[0]!.effects.burn).toMatchObject({ potency: 2, nextTickAt: 0.4, rootTriggerId: "trigger-1" });

    result = hit(result, "marked", projectile({
      id: "projectile-3", rootTriggerId: "stronger", lineageId: "stronger:0",
      damage: 30, activatedEffectIds: effectIds,
    }), 0.3, { cinderGospel: true });
    expect(result.targets[0]!.effects.burn).toMatchObject({
      potency: 3, remainingTicks: 4, nextTickAt: 0.4, rootTriggerId: "stronger", originPower: 30,
    });

    const advanced = advanceStatuses({ targets: result.targets, areas: [], now: 1.6 });
    expect(advanced.damages.map(({ event }) => [event.time, event.damage, event.source])).toEqual([
      [0.4, 3, "status"], [0.8, 3, "status"], [1.2000000000000002, 3, "status"], [1.6, 3, "status"],
    ]);
    expect(advanced.targets[0]!.effects.burn).toBeUndefined();
  });

  test("Wanted Brand is singular, nonreplacing, and jumps by distance then stable ID", () => {
    const effectIds = ["baseRevolver.direct", "wantedBrand.brand"];
    const targets = [target("first", 100), target("later", 200), target("tie-b", 300), target("tie-a", 300)];
    let result = hit(runtime(targets), "first", projectile({ activatedEffectIds: effectIds }), 0, { wantedBrand: true });
    expect(result.wantedBrand).toEqual({ targetId: "first", expiresAt: ROW_FOUR[2][1].duration });
    result = hit(result, "later", projectile({ id: "projectile-2", activatedEffectIds: effectIds }), 1, { wantedBrand: true });
    expect(result.wantedBrand).toEqual({ targetId: "first", expiresAt: 3 });
    expect(selectBrandTarget({ x: 100, y: 100 }, result.targets.filter(({ id }) => id.startsWith("tie")), 200)).toBe("tie-a");
    expect(selectBrandTarget({ x: 0, y: 0 }, [target("edge", 240, { y: 0 })], 240)).toBe("edge");

    result = hit({ ...result, wantedBrand: { targetId: "first", expiresAt: 1 } }, "later", projectile({ id: "projectile-3", activatedEffectIds: effectIds }), 1, { wantedBrand: true });
    expect(result.wantedBrand).toEqual({ targetId: "later", expiresAt: 4 });
  });

  test("Widow's Ledger consumes the fifth live-target notch into one guaranteed area hit", () => {
    const effectIds = ["baseRevolver.direct", "widowsLedger.notches"];
    let state: StatusRuntime = runtime([target("marked")]);
    let result!: ReturnType<typeof hit>;
    for (let count = 1; count <= 5; count += 1) {
      result = hit(state, "marked", projectile({ id: `projectile-${count}`, activatedEffectIds: effectIds }), count / 10, { widowsLedger: true });
      state = result;
      expect(result.targets[0]!.effects.ledger.count).toBe(count === ROW_FOUR[3][1].hits ? 0 : count);
    }
    expect(result.damages).toHaveLength(1);
    expect(result.damages[0]!.event).toMatchObject({
      source: "area", damage: 24, targetId: "marked", artifactId: "widowsLedger",
      effectId: "widowsLedger.line", originPower: 20,
    });
  });

  test("Ectoplasm Snare creates once per root and resolves all fifteen ticks including expiry", () => {
    const effectIds = ["baseRevolver.direct", "ectoplasmSnare.pool"];
    let result = hit(runtime([target("inside")]), "inside", projectile({ activatedEffectIds: effectIds }), 0, { ectoplasmSnare: true });
    expect(result.areas).toHaveLength(1);
    expect(result.areas[0]).toMatchObject({
      radius: ROW_FOUR[4][1].radius, expiresAt: ROW_FOUR[4][1].duration,
      tickInterval: 0.1, nextTickAt: 0.1, damage: 0.8, slow: 0.5, instanceKey: "root",
    });
    const area = result.areas[0]!;
    result = hit(result, "inside", projectile({
      id: "projectile-2", lineageId: "trigger-1:1", activatedEffectIds: effectIds,
    }), 0.01, { ectoplasmSnare: true });
    expect(result.areas).toEqual([]);
    expect(Object.keys(result.snareRoots)).toHaveLength(1);

    const advanced = advanceStatuses({ targets: result.targets, areas: [{ ...area, id: "snare" }], now: 1.5 });
    expect(advanced.damages).toHaveLength(15);
    expect(advanced.damages[0]!.event.time).toBe(0.1);
    expect(advanced.damages.at(-1)!.event.time).toBeCloseTo(1.5);
    expect(advanced.areas).toEqual([]);
  });

  test("Hex Bell sees post-hit chill and burn but excludes freeze marks charges and notches", () => {
    const source = target("source", 100, {
      frozenUntil: 9,
      effects: {
        ...createTargetEffects(),
        hollowPoint: {
          damage: 3, expiresAt: 9, rootTriggerId: "old", originPower: 5,
          generation: 0, reactiveEffectIds: [], sourceProjectile: projectile(),
        },
        ledger: { count: 4, expiresAt: 9 },
      },
    });
    const chaser = target("chaser", 160);
    const dummy = target("dummy", 170, { kind: "dummy", speed: 0 });
    const effectIds = [
      "baseRevolver.direct", "coldcaster.chill", "cinderGospel.burn",
      "wantedBrand.brand", "widowsLedger.notches", "hexBell.pulse",
    ];
    const result = hit(runtime([source, chaser, dummy], {
      hexCounter: 3,
      wantedBrand: { targetId: "source", expiresAt: 3 },
    }), "source", projectile({ activatedEffectIds: effectIds }), 0, {
      coldcaster: true, cinderGospel: true, wantedBrand: true, widowsLedger: true, hexBell: true,
    });

    expect(result.hexCounter).toBe(0);
    expect(result.targets[1]!.effects).toMatchObject({
      chill: { count: 1, expiresAt: 2 },
      burn: { potency: 2, remainingTicks: 4, nextTickAt: 0.4, rootTriggerId: "trigger-1" },
      slows: [{ effectId: "hexBell.pulse", multiplier: 0.6, until: 1 }],
      ledger: { count: 0, expiresAt: 0 },
    });
    expect(result.targets[1]!.effects.hollowPoint).toBeUndefined();
    expect(result.targets[1]!.frozenUntil).toBe(0);
    expect(result.targets[2]!.effects.slows).toEqual([]);
    expect(result.wantedBrand).toEqual({ targetId: "source", expiresAt: 3 });
  });
});

test("overlapping slows choose the smallest active multiplier with strict expiry", () => {
  const slows = [{ effectId: "hex", multiplier: 0.6, until: 2 }, { effectId: "snare", multiplier: 0.5, until: 3 }];
  expect(effectiveSlow(slows, 1)).toBe(0.5);
  expect(effectiveSlow(slows, 2)).toBe(0.5);
  expect(effectiveSlow(slows, 3)).toBe(1);
});

test("crossed burn and pool ticks sort globally by time effect root and target", () => {
  const burnIds = ["baseRevolver.direct", "cinderGospel.burn", "cinderGospel.emberRing"];
  const snareIds = ["baseRevolver.direct", "ectoplasmSnare.pool"];
  const burned = hit(runtime([target("marked")]), "marked", projectile({ activatedEffectIds: burnIds }), 0, { cinderGospel: true });
  const snared = hit(burned, "marked", projectile({
    id: "projectile-snare", rootTriggerId: "a-root", lineageId: "a-root:0", activatedEffectIds: snareIds,
  }), 0, { ectoplasmSnare: true });
  const area = { ...snared.areas[0]!, id: "snare", nextTickAt: 0.4 };

  const advanced = advanceStatuses({ targets: snared.targets, areas: [area], now: 0.4 });
  expect(advanced.damages.map(({ event }) => [event.time, event.effectId, event.rootTriggerId, event.targetId])).toEqual([
    [0.4, "cinderGospel.burn", "trigger-1", "marked"],
    [0.4, "ectoplasmSnare.pool", "a-root", "marked"],
  ]);

  const floating = advanceStatuses({
    targets: snared.targets,
    areas: [{ ...snared.areas[0]!, id: "snare" }],
    now: 0.8,
  });
  expect(floating.damages
    .filter(({ event }) => Math.abs(event.time - 0.8) < 1e-10)
    .map(({ event }) => event.effectId)).toEqual(["cinderGospel.burn", "ectoplasmSnare.pool"]);
});

test("a large drain retains burn provenance for earlier Snare ticks", () => {
  const burnIds = ["baseRevolver.direct", "cinderGospel.burn", "cinderGospel.emberRing"];
  const snareIds = ["baseRevolver.direct", "ectoplasmSnare.pool"];
  const burned = hit(runtime([target("marked")]), "marked", projectile({ activatedEffectIds: burnIds }), 0, { cinderGospel: true });
  const snared = hit(burned, "marked", projectile({
    id: "projectile-snare", rootTriggerId: "snare-root", lineageId: "snare-root:0", activatedEffectIds: snareIds,
  }), 0, { ectoplasmSnare: true });
  const advanced = advanceStatuses({
    targets: snared.targets,
    areas: [{ ...snared.areas[0]!, id: "snare" }],
    now: 1.6,
  });

  expect(advanced.targets[0]!.effects.burn).toBeUndefined();
  expect(advanced.damages.find(({ event }) => event.effectId === "ectoplasmSnare.pool" && event.time === 0.1)?.burn)
    .toMatchObject({ rootTriggerId: "trigger-1", originPower: 20, reactiveEligible: true });
});
