# Isaac-Scale Room Grid

## Goal

Bring the combat laboratory to the proportions of a standard Isaac-style room: a rectangular walkable field of 13 square cells by 7 square cells, with Ralphy visually occupying about one cell.

## Geometry

- One logical cell is `64 × 64` canvas pixels.
- The walkable field is exactly `13 × 7` cells, or `832 × 448` pixels.
- Walls form a one-cell frame outside the walkable field.
- The complete room canvas is therefore `15 × 9` cells, or `960 × 576` pixels.
- Walkable bounds are `x = 64…896` and `y = 64…512`.
- The room center is `(480, 288)`.

Room dimensions, player start, and spawn anchors derive from shared tile constants rather than unrelated pixel literals. Collision radii and weapon balance remain unchanged.

## Visual Scale

- Ralphy's generated source frames remain unchanged.
- Ralphy is drawn at `80 × 80` pixels; the opaque silhouette inside the padded frame is approximately one `64 × 64` cell.
- The revolver and combat effects retain their current scale unless the updated browser screenshot exposes a clear mismatch.
- The current generated room image is temporarily stretched from `960 × 540` to the new `960 × 576` canvas. Pixel smoothing remains disabled.

## Layout

- The browser preserves the room's new `5:3` aspect ratio instead of forcing `16:9`.
- Pointer mapping continues to translate CSS coordinates into logical canvas coordinates.
- The right laboratory dock and its responsive behavior do not change.

## Tilemap Boundary

This change introduces real tile geometry, not a tile renderer. Floor and wall art remain one background image for now. A future asset pass may replace it with reusable `1×1` floor, wall, door, and obstacle tiles without changing gameplay coordinates.

## Verification

- Unit tests assert a 64-pixel tile, a 13-by-7 walkable field, one-tile wall margins, and centered player start.
- Spawn and movement tests continue to prove entities remain inside the new bounds.
- Browser tests assert a `5:3` canvas and capture the existing 1440×900 and 1024×768 visual baselines.
- The complete unit suite, production build, Playwright suite, dependency audit, and diff checks must remain green.

## Out of Scope

- Generating or slicing a floor/wall tile atlas.
- Procedural room layouts, doors, obstacles, or room transitions.
- Rebalancing movement speed, projectile speed, collision radii, or artifact formulas.
