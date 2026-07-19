import { expect, test } from "bun:test";
import { segmentCircleHitTime } from "./room";

test("segmentCircleHitTime finds a swept hit and rejects a miss", () => {
  expect(segmentCircleHitTime({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 2 }, 3)).toBeCloseTo(0.3882, 3);
  expect(segmentCircleHitTime({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 5 }, 3)).toBeNull();
});
