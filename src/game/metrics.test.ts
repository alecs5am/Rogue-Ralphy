import { expect, test } from "bun:test";
import { createMetrics, recordHit, recordProjectile, recordTrigger, resetMetrics, summarizeMetrics } from "./metrics";

test("reports rolling three-second and peak DPS", () => {
  let metrics = createMetrics();
  metrics = recordHit(metrics, 100, 1, "dummy-1");
  metrics = recordHit(metrics, 50, 2, "dummy-1");
  expect(summarizeMetrics(metrics, 3).rollingDps).toBe(50);
  expect(summarizeMetrics(metrics, 4.9).rollingDps).toBeCloseTo(50 / 3);
  expect(summarizeMetrics(metrics, 5.1).rollingDps).toBe(0);
  expect(summarizeMetrics(metrics, 6).rollingDps).toBe(0);
});

test("tracks trigger accuracy independently from multishot creation", () => {
  let metrics = recordTrigger(createMetrics());
  metrics = recordProjectile(recordProjectile(metrics));
  metrics = recordHit(metrics, 20, 1, "dummy-1");
  expect(summarizeMetrics(metrics, 1).accuracy).toBe(0.5);
  expect(resetMetrics(metrics)).toEqual(createMetrics());
});
