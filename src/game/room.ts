export type Point = { x: number; y: number };

export const TILE_SIZE = 64;
export const ROOM_COLUMNS = 13;
export const ROOM_ROWS = 7;
export const ROOM = {
  width: (ROOM_COLUMNS + 2) * TILE_SIZE,
  height: (ROOM_ROWS + 2) * TILE_SIZE,
  minX: TILE_SIZE,
  maxX: (ROOM_COLUMNS + 1) * TILE_SIZE,
  minY: TILE_SIZE,
  maxY: (ROOM_ROWS + 1) * TILE_SIZE,
} as const;

export const ROOM_PROPS = [
  { id: "rock", kind: "rock", x: 160, y: 160, size: 64, collisionRadius: 28 },
  { id: "crate", kind: "crate", x: 800, y: 416, size: 58, collisionRadius: 26 },
  { id: "labMarker", kind: "labMarker", x: 480, y: 96, size: 52, collisionRadius: 22 },
] as const;

export function segmentCircleHitTime(from: Point, to: Point, center: Point, combinedRadius: number): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ox = from.x - center.x;
  const oy = from.y - center.y;
  const c = ox * ox + oy * oy - combinedRadius * combinedRadius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (ox * dx + oy * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
