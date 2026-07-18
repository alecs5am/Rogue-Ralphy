import { expect, test } from "bun:test";
import { createMetrics, recordHit, recordKill, recordProjectile, recordProjectileOutcome, recordTrigger, resetMetrics, retainTargetMetrics, summarizeMetrics } from "./metrics";

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

  expect(metrics.hitEvents).toEqual([{ time: 4, damage: 30, targetId: "recent" }]);
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
