# Isaac-Scale Room Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the combat laboratory use a 13-by-7 square-cell walkable field with one-cell walls and a one-cell-scale Ralphy.

**Architecture:** The existing fixed-timestep simulation remains authoritative. Shared 64-pixel tile constants derive the room bounds, player center, and spawn anchors; the Canvas and CSS adopt the resulting 960-by-576 geometry while the current generated background is stretched temporarily.

**Tech Stack:** TypeScript, Bun test runner, Canvas 2D, CSS, Playwright.

## Global Constraints

- One logical cell is exactly `64 × 64` canvas pixels.
- The walkable field is exactly `13 × 7` cells (`832 × 448`).
- Walls form a one-cell frame, making the complete canvas `15 × 9` cells (`960 × 576`).
- Walkable bounds are `x = 64…896` and `y = 64…512`.
- Ralphy is drawn at `80 × 80`; collision radii and weapon balance do not change.
- Keep the current room bitmap and disable smoothing; do not introduce a tile renderer or new dependency.

---

### Task 1: Derive Simulation Geometry From the Tile Grid

**Files:**
- Modify: `src/game/simulation.test.ts`
- Modify: `src/game/simulation.ts`

**Interfaces:**
- Consumes: existing `createGame()`, `spawnDummy()`, `spawnChaser()`, and `spawnWave()` APIs.
- Produces: exported `TILE_SIZE`, `ROOM_COLUMNS`, `ROOM_ROWS`, and `ROOM`; `createGame()` returns the new geometry without changing its signature.

- [ ] **Step 1: Write the failing geometry test**

Add to `src/game/simulation.test.ts` before changing production code:

```ts
test("uses a 13 by 7 tile field inside one-tile walls", () => {
  const game = createGame(() => 0);
  expect(game.room).toEqual({ width: 960, height: 576, minX: 64, maxX: 896, minY: 64, maxY: 512 });
  expect(game.room.maxX - game.room.minX).toBe(13 * 64);
  expect(game.room.maxY - game.room.minY).toBe(7 * 64);
  expect(game.player).toMatchObject({ x: 480, y: 288 });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `bun test src/game/simulation.test.ts`

Expected: FAIL because the current room height is `540`, `maxY` is `476`, and the player starts at `y = 270`.

- [ ] **Step 3: Implement the shared tile geometry**

In `src/game/simulation.ts`, replace independent room literals with:

```ts
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

const tileCenter = (column: number, row: number): Point => ({
  x: (column + 1.5) * TILE_SIZE,
  y: (row + 1.5) * TILE_SIZE,
});

const PLAYER = {
  x: ROOM.width / 2,
  y: ROOM.height / 2,
  radius: 18,
  health: 100,
  maxHealth: 100,
  speed: 240,
  invulnerableUntil: 0,
} as const;
```

Change `GameState.room` to a numeric room shape rather than the old `960`/`540` literal type. Rebuild `DUMMY_POINTS` and `EDGE_POINTS` with `tileCenter(...)` so every default spawn anchor lies at a cell center. Preserve their current right-side/edge distribution and all entity radii.

- [ ] **Step 4: Run unit tests and verify GREEN**

Run: `bun test src/game/simulation.test.ts`

Expected: all simulation tests PASS, including the new geometry assertion.

- [ ] **Step 5: Commit the simulation geometry**

```bash
git add src/game/simulation.ts src/game/simulation.test.ts
git commit -m "feat: size room to a 13 by 7 tile field"
```

---

### Task 2: Match Canvas and Character Scale to the Grid

**Files:**
- Modify: `tests/lab.spec.ts`
- Modify: `index.html`
- Modify: `src/styles.css`
- Modify: `src/render.ts`

**Interfaces:**
- Consumes: `GameState.room` dimensions from Task 1 and the existing generated room/Ralphy assets.
- Produces: a `960 × 576` logical canvas with a CSS `5 / 3` aspect ratio and an `80 × 80` Ralphy render.

- [ ] **Step 1: Change the browser contract first**

In `tests/lab.spec.ts`, change the canvas ratio assertion:

```ts
expect(box.width / box.height).toBeCloseTo(5 / 3, 2);
```

Also assert the logical dimensions:

```ts
await expect(canvas).toHaveAttribute("width", "960");
await expect(canvas).toHaveAttribute("height", "576");
```

- [ ] **Step 2: Run the browser test and verify RED**

Run: `CI=1 bunx playwright test --grep "renders the complete lab"`

Expected: FAIL because the canvas remains `960 × 540` and CSS remains `16 / 9`.

- [ ] **Step 3: Implement the visual dimensions**

In `index.html`, set:

```html
<canvas id="game" width="960" height="576" ...></canvas>
```

In `src/styles.css`, change the canvas rule to:

```css
aspect-ratio: 5 / 3;
```

In `src/render.ts`, render Ralphy with a single explicit size:

```ts
const RALPHY_SIZE = 80;

imageAt(
  context,
  assets,
  ralphyKey(state, options.moving),
  state.player.x - RALPHY_SIZE / 2,
  state.player.y - 46 + bob,
  RALPHY_SIZE,
);
```

Align the three decorative prop centers to the nearest tile centers: rock `(160, 160)`, lab marker `(480, 96)`, and crate `(800, 416)`. Keep the room bitmap drawn across the full logical canvas; Canvas image smoothing remains disabled.

- [ ] **Step 4: Run focused and complete verification**

Run:

```bash
bun test
bun run build
CI=1 bun run test:e2e
bun audit
git diff --check
```

Expected: 42 or more unit tests PASS, 4 Playwright tests PASS, build succeeds, audit reports no vulnerabilities, and diff check is clean. Inspect both regenerated screenshots and confirm the field reads as 13-by-7 cells and Ralphy reads as approximately one cell.

- [ ] **Step 5: Commit the browser scale**

```bash
git add index.html src/styles.css src/render.ts tests/lab.spec.ts
git commit -m "feat: match room visuals to the tile grid"
```
