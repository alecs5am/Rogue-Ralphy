import type { Point } from "./room";
import type { ProjectileState } from "./projectiles";

export const SPATIAL_CELL_SIZE = 96;

export type TimedSegment = Readonly<{
  from: Point;
  to: Point;
  startTime: number;
  endTime: number;
}>;

export type SpatialPath = Readonly<{
  id: string;
  segments: readonly Readonly<{ from: Point; to: Point }>[];
}>;

export type SpatialCandidate = Readonly<{ id: string; a: string; b: string }>;

export type PathCrossing = Readonly<{
  point: Point;
  crossingTime: number;
  aTime: number;
  bTime: number;
}>;

export type WakeSegmentState = Readonly<{
  id: string;
  from: Point;
  to: Point;
  bornAt: number;
  expiresAt: number;
  width: number;
  damage: number;
  sourceProjectile: ProjectileState;
}>;

export type WakeTrailState = Readonly<{
  lineageId: string;
  rootTriggerId: string;
  nextTickAt: number;
  tickInterval: number;
  cooldown: number;
  segments: readonly WakeSegmentState[];
}>;

export type CrossfirePulseState = Readonly<{
  id: string;
  pairId: string;
  rootTriggerId: string;
  bornAt: number;
  expiresAt: number;
  x: number;
  y: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  length: number;
  damage: number;
  projectileId: string;
}>;

export type CrossfireParticipation = Readonly<{ rootTriggerId: string; pairId: string }>;
export type DescendantRecord = Readonly<{ rootTriggerId: string; count: number; limit?: number }>;
export type BigIronPairHit = Readonly<{
  rootTriggerId: string;
  mainId: string;
  moonletId: string;
  targetId: string;
  firstAt: number;
  firstProjectileId: string;
  mainDamage: number;
  heading: number;
  spent: boolean;
}>;

export const canonicalPair = (a: string, b: string): string => a < b ? `${a}:${b}` : `${b}:${a}`;

export const areaId = (effectId: string, rootTriggerId: string, instanceKey: string): string =>
  `${effectId}:${rootTriggerId}:${instanceKey}`;

export function buildSpatialCandidates(paths: readonly SpatialPath[]): SpatialCandidate[] {
  const cells = new Map<string, Set<string>>();
  for (const { id, segments } of paths) for (const { from, to } of segments) {
    const minX = Math.floor(Math.min(from.x, to.x) / SPATIAL_CELL_SIZE);
    const maxX = Math.floor(Math.max(from.x, to.x) / SPATIAL_CELL_SIZE);
    const minY = Math.floor(Math.min(from.y, to.y) / SPATIAL_CELL_SIZE);
    const maxY = Math.floor(Math.max(from.y, to.y) / SPATIAL_CELL_SIZE);
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
      const key = `${x},${y}`;
      const members = cells.get(key) ?? new Set<string>();
      members.add(id);
      cells.set(key, members);
    }
  }

  const pairs = new Map<string, SpatialCandidate>();
  for (const [key, members] of cells) {
    const [cellX, cellY] = key.split(",").map(Number) as [number, number];
    const nearby = new Set<string>();
    for (let x = cellX - 1; x <= cellX + 1; x += 1) for (let y = cellY - 1; y <= cellY + 1; y += 1) {
      for (const id of cells.get(`${x},${y}`) ?? []) nearby.add(id);
    }
    for (const first of members) for (const second of nearby) {
      if (first === second) continue;
      const id = canonicalPair(first, second);
      const [a, b] = first < second ? [first, second] : [second, first];
      pairs.set(id, { id, a, b });
    }
  }
  return [...pairs.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function crossingOf(a: TimedSegment, b: TimedSegment): PathCrossing | null {
  const ar = { x: a.to.x - a.from.x, y: a.to.y - a.from.y };
  const br = { x: b.to.x - b.from.x, y: b.to.y - b.from.y };
  const offset = { x: b.from.x - a.from.x, y: b.from.y - a.from.y };
  const cross = ar.x * br.y - ar.y * br.x;
  const tolerance = Number.EPSILON * 256 * Math.max(1, Math.hypot(ar.x, ar.y), Math.hypot(br.x, br.y));
  if (Math.abs(cross) <= tolerance) return null;
  const aLocal = (offset.x * br.y - offset.y * br.x) / cross;
  const bLocal = (offset.x * ar.y - offset.y * ar.x) / cross;
  if (aLocal < -tolerance || aLocal > 1 + tolerance || bLocal < -tolerance || bLocal > 1 + tolerance) return null;
  const clampedA = Math.max(0, Math.min(1, aLocal));
  const clampedB = Math.max(0, Math.min(1, bLocal));
  const aTime = a.startTime + (a.endTime - a.startTime) * clampedA;
  const bTime = b.startTime + (b.endTime - b.startTime) * clampedB;
  return {
    point: { x: a.from.x + ar.x * clampedA, y: a.from.y + ar.y * clampedA },
    crossingTime: Math.max(aTime, bTime),
    aTime,
    bTime,
  };
}
