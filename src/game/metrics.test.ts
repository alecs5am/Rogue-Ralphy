import { expect, test } from "bun:test";
import { createMetrics, recordHit, recordProjectile, recordProjectileOutcome, recordTrigger, resetMetrics, summarizeMetrics } from "./metrics";

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
