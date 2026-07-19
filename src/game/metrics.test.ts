import { expect, test } from "bun:test";
import { createMetrics, recordDamage, recordHit, recordKill, recordProjectile, recordProjectileOutcome, recordTrigger, resetMetrics, retainTargetMetrics, summarizeMetrics } from "./metrics";

test("Tesla damage raises DPS without successful projectile accuracy", () => {
  let metrics = createMetrics();
  metrics = recordDamage(metrics, {
    source: "link", damage: 5, time: 1, targetId: "dummy-1",
    artifactId: "teslaBullets", effectId: "teslaBullets.link",
    rootTriggerId: "trigger-1", lineageId: "trigger-1:0", killReactionDepth: 0, originPower: 20,
  });
  expect(summarizeMetrics(metrics, 1)).toMatchObject({ totalDamage: 5, hits: 0, secondaryHits: 1, successfulProjectiles: 0 });
});

test("recorded direct damage history retains projectile and trigger provenance", () => {
  const metrics = recordDamage(createMetrics(), {
    source: "direct", damage: 20, time: 1, targetId: "dummy-1",
    projectileId: "projectile-7", rootTriggerId: "trigger-6", lineageId: "trigger-6:0",
    artifactId: "baseRevolver", effectId: "baseRevolver.direct", killReactionDepth: 0, originPower: 20,
    x: 640, y: 270, firstProjectileHit: true,
  });

  expect(metrics.hitEvents[0]).toEqual({
    source: "direct", damage: 20, time: 1, targetId: "dummy-1",
    projectileId: "projectile-7", rootTriggerId: "trigger-6", lineageId: "trigger-6:0",
    artifactId: "baseRevolver", effectId: "baseRevolver.direct", killReactionDepth: 0, originPower: 20,
    x: 640, y: 270, firstProjectileHit: true,
  });
});

test("recorded Tesla damage history retains secondary provenance", () => {
  const metrics = recordDamage(createMetrics(), {
    source: "link", damage: 5, time: 2, targetId: "dummy-2",
    projectileId: "projectile-2", rootTriggerId: "trigger-1", lineageId: "trigger-1:0",
    artifactId: "teslaBullets", effectId: "teslaBullets.link", killReactionDepth: 0, originPower: 20,
    x: 600, y: 288,
  });

  expect(metrics.hitEvents[0]).toEqual({
    source: "link", damage: 5, time: 2, targetId: "dummy-2",
    projectileId: "projectile-2", rootTriggerId: "trigger-1", lineageId: "trigger-1:0",
    artifactId: "teslaBullets", effectId: "teslaBullets.link", killReactionDepth: 0, originPower: 20,
    x: 600, y: 288,
  });
});

test("damage provenance distinguishes all five source families", () => {
  const sources = ["direct", "link", "status", "area", "reactive"] as const;
  let metrics = createMetrics();
  for (const source of sources) {
    metrics = recordDamage(metrics, {
      source, damage: 4, time: 1, targetId: "dummy-1",
      artifactId: "ectoplasmSnare", effectId: `ectoplasmSnare.${source}`,
      rootTriggerId: "trigger-1", lineageId: "trigger-1:0", killReactionDepth: 0, originPower: 20,
    });
  }

  expect(metrics.hitEvents.map(({ source }) => source)).toEqual([...sources]);
  expect(metrics.hitEvents[3]).toEqual({
    source: "area", damage: 4, time: 1, targetId: "dummy-1",
    artifactId: "ectoplasmSnare", effectId: "ectoplasmSnare.area",
    rootTriggerId: "trigger-1", lineageId: "trigger-1:0", killReactionDepth: 0, originPower: 20,
  });
  expect(summarizeMetrics(metrics, 1)).toMatchObject({ hits: 1, secondaryHits: 4 });
});

test("reports strict rolling three-second DPS globally and per target", () => {
  let metrics = createMetrics();
  metrics = recordHit(metrics, 100, 1, "dummy-1", true);
  metrics = recordHit(metrics, 50, 2, "dummy-1", false);
  expect(summarizeMetrics(metrics, 3).rollingDps).toBe(50);
  expect(summarizeMetrics(metrics, 4.9).rollingDps).toBeCloseTo(50 / 3);
  expect(summarizeMetrics(metrics, 3).targets["dummy-1"]).toMatchObject({ damage: 150, hits: 2, rollingDps: 50 });
  expect(summarizeMetrics(metrics, 4.9).targets["dummy-1"]?.rollingDps).toBeCloseTo(50 / 3);
  expect(summarizeMetrics(metrics, 5.1).rollingDps).toBe(0);
  expect(summarizeMetrics(metrics, 5.1).targets["dummy-1"]?.rollingDps).toBe(0);
  expect(summarizeMetrics(metrics, 6).rollingDps).toBe(0);
});

test("prunes expired hit history without losing cumulative target totals", () => {
  let metrics = recordHit(createMetrics(), 100, 1, "expired", true);
  metrics = recordKill(metrics, "expired");
  metrics = recordHit(metrics, 30, 4, "recent", true);

  expect(metrics.hitEvents).toEqual([{
    source: "direct", time: 4, damage: 30, targetId: "recent",
    artifactId: "baseRevolver", effectId: "baseRevolver.direct", rootTriggerId: "baseRevolver",
    killReactionDepth: 0, originPower: 30, firstProjectileHit: true,
  }]);
  expect(summarizeMetrics(metrics, 4)).toMatchObject({
    totalDamage: 130,
    hits: 2,
    kills: 1,
    rollingDps: 10,
    peakDps: 100 / 3,
    targets: {
      expired: { damage: 100, hits: 1, kills: 1, rollingDps: 0 },
      recent: { damage: 30, hits: 1, rollingDps: 10 },
    },
  });
});

test("scans hit history once when summarizing many targets", () => {
  let metrics = createMetrics();
  for (let index = 0; index < 20; index += 1) {
    metrics = recordHit(metrics, index + 1, 1, `dummy-${index}`, true);
  }
  const eventCount = metrics.hitEvents.length;
  let eventReads = 0;
  metrics = {
    ...metrics,
    hitEvents: new Proxy(metrics.hitEvents, {
      get(events, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) eventReads += 1;
        return Reflect.get(events, property, receiver);
      },
    }),
  };

  expect(summarizeMetrics(metrics, 1).rollingDps).toBe(70);
  expect(eventReads).toBe(eventCount);
});

test("drops inactive target breakdowns without changing global totals", () => {
  let metrics = recordHit(createMetrics(), 10, 1, "gone", true);
  metrics = recordHit(metrics, 20, 1, "active", true);

  const retained = retainTargetMetrics(metrics, new Set(["active"]));

  expect(retained.targetMetrics).toEqual({ active: { damage: 20, hits: 1, kills: 0 } });
  expect(summarizeMetrics(retained, 1)).toMatchObject({ totalDamage: 30, hits: 2, targets: { active: { damage: 20 } } });
});

test("keeps hit coordinates for effects after a target is removed", () => {
  const metrics = recordHit(createMetrics(), 20, 1, "chaser", true, { x: 640, y: 270 });
  expect(metrics.hitEvents[0]).toMatchObject({ targetId: "chaser", x: 640, y: 270 });
});

test("counts ricochet impacts once for projectile accuracy and waits to resolve misses", () => {
  let metrics = recordTrigger(createMetrics());
  metrics = recordProjectile(recordProjectile(metrics));
  metrics = recordHit(metrics, 20, 1, "dummy-1", true);
  metrics = recordHit(metrics, 18, 2, "dummy-2", false);

  expect(summarizeMetrics(metrics, 2)).toMatchObject({
    hits: 2,
    successfulProjectiles: 1,
    misses: 0,
    accuracy: 1,
  });

  metrics = recordProjectileOutcome(metrics, true);
  expect(summarizeMetrics(metrics, 2)).toMatchObject({ successfulProjectiles: 1, misses: 0, accuracy: 1 });
  metrics = recordProjectileOutcome(metrics, false);
  expect(summarizeMetrics(metrics, 2)).toMatchObject({ successfulProjectiles: 1, misses: 1, accuracy: 0.5 });
  expect(resetMetrics(metrics)).toEqual(createMetrics());
});
