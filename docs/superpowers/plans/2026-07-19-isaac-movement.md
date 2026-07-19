# Isaac-Style Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic 0.3-second acceleration and deceleration to Ralphy while preserving eight-direction WASD input, normalized diagonal top speed, and radius-aware room bounds.

**Architecture:** Keep movement inside the existing fixed-step simulation. Store velocity on `PlayerState`, move that vector linearly toward the normalized input target, integrate position, and clear only velocity components blocked by room walls. The browser loop continues to provide raw digital input and derives the walking animation from actual velocity.

**Tech Stack:** TypeScript, Bun test runner, Canvas 2D, Vite, Playwright.

## Global Constraints

- Maximum player speed remains exactly `240 px/s`.
- Acceleration and friction are both exactly `800 px/s²`, reaching full speed or rest in `0.3 s`.
- The fixed simulation step remains `1 / 120` seconds.
- WASD remains digital eight-direction input; opposite keys on one axis cancel.
- Diagonal target velocity is normalized to the same `240 px/s` magnitude as cardinal movement.
- Room bounds remain radius-aware: `64…896` horizontally and `64…512` vertically before player radius.
- A blocked wall axis loses only its corresponding velocity component.
- No new dependency, obstacle collision, knockback, dash, animation system, or movement artifact.

---

### Task 1: Add Weighted Player Velocity

**Files:**
- Modify: `src/game/simulation.test.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: existing `InputIntent.moveX/moveY`, `updateGame(state, input, dt, now)`, fixed `1 / 120` browser loop, and radius-aware `ROOM` bounds.
- Produces: `PlayerState.vx: number`, `PlayerState.vy: number`, linear vector acceleration/friction, wall-component clearing, and velocity-driven render motion.

- [ ] **Step 1: Add failing movement tests**

In `src/game/simulation.test.ts`, import `resetLab`, add a small speed helper, and add tests for the agreed behavior:

```ts
import { clearTargets, createGame, resetLab, setArtifact, spawnChaser, spawnDummy, spawnWave, updateGame } from "./simulation";

const playerSpeed = (game: ReturnType<typeof createGame>) =>
  Math.hypot(game.player.vx, game.player.vy);

test("accelerates linearly to full cardinal speed in 0.3 seconds", () => {
  let game = createGame(() => 0);
  expect(game.player).toMatchObject({ vx: 0, vy: 0, speed: 240 });

  game = updateGame(game, { ...idle, moveX: 1 }, 0.15, 0.15);
  expect(game.player.vx).toBeCloseTo(120);
  expect(game.player.vy).toBe(0);

  game = updateGame(game, { ...idle, moveX: 1 }, 0.15, 0.3);
  expect(game.player.vx).toBeCloseTo(240);
  expect(playerSpeed(game)).toBeCloseTo(240);
});

test("normalizes diagonal target speed while accelerating", () => {
  const game = updateGame(
    createGame(() => 0),
    { ...idle, moveX: 1, moveY: 1 },
    0.3,
    0.3,
  );
  expect(game.player.vx).toBeCloseTo(240 / Math.SQRT2);
  expect(game.player.vy).toBeCloseTo(240 / Math.SQRT2);
  expect(playerSpeed(game)).toBeCloseTo(240);
});

test("decelerates to rest in 0.3 seconds and reverses in 0.6 seconds", () => {
  const right = { ...idle, moveX: 1 };
  const left = { ...idle, moveX: -1 };
  let game = updateGame(createGame(() => 0), right, 0.3, 0.3);

  game = updateGame(game, idle, 0.15, 0.45);
  expect(game.player.vx).toBeCloseTo(120);
  game = updateGame(game, idle, 0.15, 0.6);
  expect(game.player.vx).toBe(0);

  game = updateGame(game, right, 0.3, 0.9);
  game = updateGame(game, left, 0.3, 1.2);
  expect(game.player.vx).toBeCloseTo(0);
  game = updateGame(game, left, 0.3, 1.5);
  expect(game.player.vx).toBeCloseTo(-240);
});

test("walls clear only the blocked velocity component", () => {
  const game = createGame(() => 0);
  const atRightWall = {
    ...game,
    player: {
      ...game.player,
      x: game.room.maxX - game.player.radius,
      vx: 240,
      vy: 0,
    },
  };
  const moved = updateGame(
    atRightWall,
    { ...idle, moveX: 1, moveY: 1 },
    0.05,
    0.05,
  );

  expect(moved.player.x).toBe(game.room.maxX - game.player.radius);
  expect(moved.player.vx).toBe(0);
  expect(moved.player.vy).toBeGreaterThan(0);
  expect(moved.player.y).toBeGreaterThan(game.player.y);
});

test("pause preserves velocity and reset clears it", () => {
  const moving = updateGame(
    createGame(() => 0),
    { ...idle, moveX: 1 },
    0.15,
    0.15,
  );
  const paused = updateGame(moving, { ...idle, paused: true }, 1, 1.15);
  expect(paused.player).toEqual(moving.player);
  expect(resetLab(moving).player).toMatchObject({ vx: 0, vy: 0 });
});
```

Extend the existing four-wall clamp test so every clamped axis also equals zero velocity:

```ts
expect(moved.player[axis]).toBe(bound);
expect(moved.player[axis === "x" ? "vx" : "vy"]).toBe(0);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
bun test src/game/simulation.test.ts
```

Expected: TypeScript/runtime assertions fail because `PlayerState` has no `vx`/`vy` and movement still jumps directly to `240 px/s`.

- [ ] **Step 3: Add velocity state and linear vector movement**

In `src/game/simulation.ts`, extend the player state and defaults:

```ts
export type PlayerState = Point & {
  vx: number; vy: number;
  radius: number; health: number; maxHealth: number; speed: number; invulnerableUntil: number;
};

const PLAYER = {
  x: ROOM.width / 2,
  y: ROOM.height / 2,
  vx: 0,
  vy: 0,
  radius: 18,
  health: 100,
  maxHealth: 100,
  speed: 240,
  invulnerableUntil: 0,
} as const;

const PLAYER_ACCELERATION = 800;
```

Add the smallest vector helper beside `clamp`:

```ts
function moveVelocityToward(
  vx: number,
  vy: number,
  targetVx: number,
  targetVy: number,
  maxDelta: number,
): { vx: number; vy: number } {
  const dx = targetVx - vx;
  const dy = targetVy - vy;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance <= maxDelta) return { vx: targetVx, vy: targetVy };
  const scale = maxDelta / distance;
  return { vx: vx + dx * scale, vy: vy + dy * scale };
}
```

Replace the direct position update in `updateGame` with normalized target velocity, linear convergence, integration, and per-axis wall response:

```ts
const magnitude = Math.hypot(input.moveX, input.moveY);
const movementScale = magnitude > 1 ? 1 / magnitude : 1;
const velocity = moveVelocityToward(
  state.player.vx,
  state.player.vy,
  input.moveX * movementScale * state.player.speed,
  input.moveY * movementScale * state.player.speed,
  PLAYER_ACCELERATION * dt,
);
const nextX = state.player.x + velocity.vx * dt;
const nextY = state.player.y + velocity.vy * dt;
const x = clamp(nextX, state.room.minX + state.player.radius, state.room.maxX - state.player.radius);
const y = clamp(nextY, state.room.minY + state.player.radius, state.room.maxY - state.player.radius);
let player: PlayerState = {
  ...state.player,
  x,
  y,
  vx: x === nextX ? velocity.vx : 0,
  vy: y === nextY ? velocity.vy : 0,
};
```

- [ ] **Step 4: Drive the render motion flag from actual velocity**

In `src/main.ts`, replace the pressed-key `moving` expression:

```ts
const moving = !state.paused && Math.hypot(state.player.vx, state.player.vy) > 0;
```

Do not change input collection, telemetry copy, fixed-step timing, or reduced-motion handling.

- [ ] **Step 5: Run focused and complete verification**

Run:

```bash
bun test src/game/simulation.test.ts
bun test
bun run build
CI=1 bun run test:e2e
bun audit
gitleaks detect --source . --no-banner
git diff --check
```

Expected: all movement tests pass, at least 48 unit tests pass, 4 Playwright tests pass, build succeeds, audit reports no vulnerabilities, gitleaks reports no leaks, and diff check is clean.

Manually verify at `http://127.0.0.1:4173/`: hold a movement key until full speed, release it, and confirm Ralphy coasts for about `0.3 s`, settles inside the room, and keeps the walking animation during the coast.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/game/simulation.ts src/game/simulation.test.ts src/main.ts
git commit -m "feat: add Isaac-style movement inertia"
```
