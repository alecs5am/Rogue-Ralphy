# Ralphy Combat Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable browser combat laboratory for Ralphy with a six-round revolver, automatic and active reload, eight infinitely stackable artifacts, test targets, generated pixel-art assets, and live combat telemetry.

**Architecture:** A fixed-timestep TypeScript simulation owns all gameplay state. Canvas 2D renders the room and combat while a plain DOM laboratory dock edits artifacts, spawns targets, and displays projections of the same state. Pure weapon, reload, shot-building, and metric functions are tested before the browser shell is connected.

**Tech Stack:** Bun 1.3+, TypeScript, Vite, Canvas 2D, HTML/CSS, Bun test, Playwright, built-in Imagegen, Pillow-based local image processing.

## Global Constraints

- Desktop keyboard and mouse only for this prototype.
- No game engine, UI framework, backend, persistence, procedural floors, audio-production pipeline, or runtime bitmap text.
- Canonical colors are `#0A0A0B`, `#F5F5F4`, and `#FFA630`.
- The room preserves a 16:9 logical canvas and nearest-neighbor pixel scaling.
- The revolver starts with six rounds and reloads in `1.5 seconds` automatically when empty.
- Artifact counts are finite non-negative integers with no design or inventory cap; all eight artifacts may be active together.
- One trigger consumes one round regardless of generated projectile count.
- Generated runtime assets live under `public/assets/generated/`.
- The user-provided room screenshot is a composition and texture reference only; all shipped game art remains original.
- Every non-trivial gameplay behavior follows a witnessed red-green test cycle.

---

## File Map

- `package.json` — Bun/Vite/test/build scripts and development dependencies.
- `tsconfig.json`, `vite.config.ts`, `playwright.config.ts` — TypeScript, Vite, and smoke-test configuration.
- `index.html` — semantic room, HUD, and laboratory-dock shell.
- `src/styles.css` — responsive noir pixel-art layout and controls.
- `src/game/weapon.ts` — artifact identifiers, base values, derived weapon formulas, and shot construction.
- `src/game/reload.ts` — automatic/manual reload and Deadeye timing state.
- `src/game/metrics.ts` — rolling DPS, peak DPS, hit/accuracy, and reset calculations.
- `src/game/simulation.ts` — player, targets, projectiles, status effects, collisions, spawning, and fixed-step updates.
- `src/game/weapon.test.ts`, `src/game/reload.test.ts`, `src/game/metrics.test.ts`, `src/game/simulation.test.ts` — pure logic checks.
- `src/assets.ts` — named generated-asset URLs and load diagnostics.
- `src/render.ts` — Canvas drawing, sprite atlas crops, fallbacks, and combat feedback.
- `src/lab.ts` — artifact/spawn controls and DOM telemetry projection.
- `src/main.ts` — input, loop, state ownership, resize/pause wiring, and composition root.
- `public/assets/generated/` — approved room, sprites, atlases, HUD pieces, and style anchor.
- `scripts/split_atlas.py` — equal-grid nearest-neighbor extraction and alpha validation for generated atlases.
- `tests/lab.spec.ts` — one Playwright end-to-end combat path.
- `.gitignore` — excludes Imagegen sources and local test artifacts.

---

### Task 1: Project Skeleton and Derived Weapon

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/game/weapon.test.ts`
- Create: `src/game/weapon.ts`

**Interfaces:**
- Produces: `ArtifactId`, `ArtifactStacks`, `BASE_WEAPON`, `DerivedWeapon`, `deriveWeapon(stacks, fireRateBuff)`, `buildShot(weapon, aimAngle)`.
- Consumes: no project runtime modules.

- [ ] **Step 1: Create the minimal Vite/Bun configuration**

Run:

```bash
bun init -y
bun add -d vite typescript @playwright/test
```

Set the package scripts to:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "test": "bun test",
    "test:e2e": "playwright test"
  }
}
```

Use strict TypeScript with DOM libraries and `moduleResolution: "Bundler"`. Vite needs no plugin configuration.

- [ ] **Step 2: Write failing derivation and shot tests**

Create `src/game/weapon.test.ts` with real behavior assertions:

```ts
import { describe, expect, test } from "bun:test";
import { BASE_WEAPON, buildShot, deriveWeapon, type ArtifactStacks } from "./weapon";

const none = {} as ArtifactStacks;

describe("deriveWeapon", () => {
  test("starts with a six-round unmodified revolver", () => {
    const weapon = deriveWeapon(none, 0);
    expect(weapon).toMatchObject({ capacity: 6, damage: 20, fireRate: 3, projectileCount: 1, reloadDuration: 1.5 });
  });

  test("applies every artifact in the documented order", () => {
    const weapon = deriveWeapon({ twinChamber: 2, bigIron: 2, hollowPoint: 2, coldcaster: 2, pinball: 2, deadeye: 2, haloChamber: 2, ghostSight: 2 }, 0);
    expect(weapon.projectileCount).toBe(3);
    expect(weapon.radius).toBeCloseTo(BASE_WEAPON.radius * 1.5);
    expect(weapon.damage).toBeCloseTo(BASE_WEAPON.damage * 1.7);
    expect(weapon.freezeChance).toBe(0.5);
    expect(weapon.bounces).toBe(2);
    expect(weapon.orbitExtraCopies).toBe(1);
    expect(weapon.homingTurnRate).toBeCloseTo(Math.PI * 2);
  });

  test("keeps unlimited counts meaningful while rejecting invalid counts", () => {
    expect(deriveWeapon({ twinChamber: 1000 }, 0).projectileCount).toBe(1001);
    expect(() => deriveWeapon({ bigIron: -1 }, 0)).toThrow("bigIron must be a finite non-negative integer");
    expect(() => deriveWeapon({ bigIron: Number.POSITIVE_INFINITY }, 0)).toThrow();
  });
});

describe("buildShot", () => {
  test("consumes one round while building a spread", () => {
    const shot = buildShot(deriveWeapon({ twinChamber: 2 }, 0), 0);
    expect(shot.roundsConsumed).toBe(1);
    expect(shot.projectiles).toHaveLength(3);
    expect(shot.projectiles[0]!.heading).toBeLessThan(shot.projectiles[2]!.heading);
  });

  test("turns multishot into an evenly distributed orbital ring", () => {
    const shot = buildShot(deriveWeapon({ twinChamber: 2, haloChamber: 3 }, 0), 0);
    expect(shot.projectiles).toHaveLength(5);
    expect(shot.projectiles.every((projectile) => projectile.orbitDuration === 0.9)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test and witness RED**

Run: `bun test src/game/weapon.test.ts`

Expected: FAIL because `src/game/weapon.ts` does not exist.

- [ ] **Step 4: Implement the exact public weapon model**

Create `src/game/weapon.ts` with these exported shapes and formulas:

```ts
export type ArtifactId = "twinChamber" | "bigIron" | "hollowPoint" | "coldcaster" | "pinball" | "deadeye" | "haloChamber" | "ghostSight";
export type ArtifactStacks = Partial<Record<ArtifactId, number>>;

export const BASE_WEAPON = { capacity: 6, damage: 20, fireRate: 3, speed: 620, radius: 5, reloadDuration: 1.5, lifetime: 8 } as const;

export type DerivedWeapon = {
  capacity: number; damage: number; fireRate: number; speed: number; radius: number;
  reloadDuration: number; lifetime: number; projectileCount: number; spread: number;
  freezeChance: number; freezeDuration: number; bounces: number; bounceRetention: number;
  activeWindow: number; activeBuff: number; activeBuffDuration: number;
  orbitDuration: number; orbitRadius: number; orbitExtraCopies: number;
  homingTurnRate: number; homingRadius: number;
};

export type ProjectileSpec = {
  heading: number; damage: number; speed: number; radius: number; lifetime: number;
  freezeChance: number; freezeDuration: number; bounces: number; bounceRetention: number;
  orbitDuration: number; orbitAngle: number; orbitRadius: number;
  homingTurnRate: number; homingRadius: number;
};

export type ShotSpec = { roundsConsumed: 1; projectiles: ProjectileSpec[] };
```

`deriveWeapon` validates every supplied stack count, uses the formulas in the design spec, and applies `fireRateBuff` as an additive ratio. `buildShot` creates `projectileCount + orbitExtraCopies` specifications, centers normal spread around `aimAngle`, and distributes orbiters evenly across `2π`.

- [ ] **Step 5: Run GREEN and the production build type check**

Run: `bun test src/game/weapon.test.ts`

Expected: all weapon tests PASS.

Run: `bunx tsc --noEmit`

Expected: exit `0`.

- [ ] **Step 6: Commit the slice**

```bash
git add package.json bun.lock tsconfig.json vite.config.ts src/game/weapon.ts src/game/weapon.test.ts
git commit -m "feat: derive stackable revolver artifacts"
```

---

### Task 2: Automatic Reload and Combat Metrics

**Files:**
- Create: `src/game/reload.test.ts`
- Create: `src/game/reload.ts`
- Create: `src/game/metrics.test.ts`
- Create: `src/game/metrics.ts`

**Interfaces:**
- Consumes: `DerivedWeapon` from `src/game/weapon.ts`.
- Produces: `createReloadState`, `startReload`, `advanceReload`, `attemptActiveReload`, `fireRateBuffAt`, `createMetrics`, `recordTrigger`, `recordProjectile`, `recordHit`, `recordKill`, `summarizeMetrics`, `resetMetrics`.

- [ ] **Step 1: Write failing automatic and active reload tests**

Create `src/game/reload.test.ts`:

```ts
import { expect, test } from "bun:test";
import { advanceReload, attemptActiveReload, createReloadState, startReload } from "./reload";
import { deriveWeapon } from "./weapon";

test("automatically starts a 1.5 second reload when the cylinder empties", () => {
  const weapon = deriveWeapon({}, 0);
  const state = startReload(createReloadState(weapon, 0), weapon, 10);
  expect(state.reloading).toBe(true);
  expect(advanceReload(state, 11.49).ammo).toBe(0);
  expect(advanceReload(state, 11.5).ammo).toBe(6);
});

test("completes instantly and buffs fire rate inside the Deadeye window", () => {
  const weapon = deriveWeapon({ deadeye: 2 }, 0);
  const loading = startReload(createReloadState(weapon, 0), weapon, 10);
  const result = attemptActiveReload(loading, weapon, 10.75);
  expect(result.ammo).toBe(6);
  expect(result.fireRateBuff).toBeCloseTo(0.4);
  expect(result.buffUntil).toBeCloseTo(13.25);
});

test("a missed timing press leaves normal reload untouched", () => {
  const weapon = deriveWeapon({ deadeye: 1 }, 0);
  const loading = startReload(createReloadState(weapon, 0), weapon, 10);
  expect(attemptActiveReload(loading, weapon, 10.05)).toEqual(loading);
});
```

- [ ] **Step 2: Run reload RED**

Run: `bun test src/game/reload.test.ts`

Expected: FAIL because `src/game/reload.ts` does not exist.

- [ ] **Step 3: Implement reload state and transitions**

Use this state contract in `src/game/reload.ts`:

```ts
export type ReloadState = {
  ammo: number; capacity: number; reloading: boolean; startedAt: number; completesAt: number;
  sweetStart: number; sweetEnd: number; fireRateBuff: number; buffUntil: number;
};
```

The reload module consumes `DerivedWeapon` as its only weapon-value source. The sweet zone is centered at 50% progress using `weapon.activeWindow`; `attemptActiveReload` succeeds only inside that inclusive range, loads `weapon.capacity`, applies `weapon.activeBuff`, and sets `buffUntil = now + weapon.activeBuffDuration`. It does not recompute Deadeye formulas.

- [ ] **Step 4: Write failing rolling metric tests**

Create `src/game/metrics.test.ts`:

```ts
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
```

- [ ] **Step 5: Run metric RED, implement, and run GREEN**

Run: `bun test src/game/metrics.test.ts`

Expected: FAIL because `src/game/metrics.ts` does not exist.

Implement immutable counter updates plus timestamped `{ time, damage, targetId }` hit events. `summarizeMetrics` filters events where `time > now - 3`, divides their total by exactly three seconds, retains the maximum rolling value observed, and exposes total damage, triggers, projectiles, hits, misses, accuracy, kills, and per-target summaries.

Run: `bun test src/game/reload.test.ts src/game/metrics.test.ts`

Expected: all reload and metric tests PASS.

- [ ] **Step 6: Commit the slice**

```bash
git add src/game/reload.ts src/game/reload.test.ts src/game/metrics.ts src/game/metrics.test.ts
git commit -m "feat: add automatic reload and combat metrics"
```

---

### Task 3: Fixed-Step Room Simulation and Artifact Interactions

**Files:**
- Create: `src/game/simulation.test.ts`
- Create: `src/game/simulation.ts`

**Interfaces:**
- Consumes: weapon, reload, and metrics modules.
- Produces: `GameState`, `InputIntent`, `createGame`, `updateGame`, `spawnDummy`, `spawnChaser`, `spawnWave`, `clearTargets`, `setArtifact`, `resetLab`.

- [ ] **Step 1: Write failing end-to-end simulation logic tests**

Create `src/game/simulation.test.ts` with deterministic time and RNG injection:

```ts
import { expect, test } from "bun:test";
import { createGame, setArtifact, spawnDummy, spawnWave, updateGame } from "./simulation";

const idle = { moveX: 0, moveY: 0, aimX: 900, aimY: 270, firing: false, reloadPressed: false, paused: false } as const;

test("one trigger consumes one round and creates combined orbital multishot", () => {
  let game = createGame(() => 0);
  game = setArtifact(setArtifact(game, "twinChamber", 2), "haloChamber", 3);
  game = updateGame(game, { ...idle, firing: true }, 1 / 60, 1);
  expect(game.reload.ammo).toBe(5);
  expect(game.projectiles).toHaveLength(5);
  expect(game.projectiles.every((projectile) => projectile.phase === "orbit")).toBe(true);
});

test("empties six rounds then starts automatic reload", () => {
  let game = createGame(() => 0);
  for (let shot = 0; shot < 6; shot += 1) {
    game = updateGame(game, { ...idle, firing: true }, 1 / 60, shot);
    game = updateGame(game, idle, 0.34, shot + 0.34);
  }
  expect(game.reload.ammo).toBe(0);
  expect(game.reload.reloading).toBe(true);
});

test("homing ricochet reacquires a live target and freeze survives impact", () => {
  let game = spawnDummy(spawnDummy(createGame(() => 0), { x: 700, y: 200 }), { x: 700, y: 340 });
  game = setArtifact(setArtifact(game, "ghostSight", 2), "pinball", 1);
  game = setArtifact(game, "coldcaster", 4);
  game = updateGame(game, { ...idle, firing: true }, 1 / 60, 1);
  for (let frame = 0; frame < 180; frame += 1) game = updateGame(game, idle, 1 / 60, 1 + frame / 60);
  expect(game.targets.some((target) => target.frozenUntil > 1)).toBe(true);
  expect(game.metrics.hits).toBeGreaterThan(0);
});

test("all artifacts compose and a wave spawns five non-overlapping chasers", () => {
  let game = createGame(() => 0.5);
  for (const id of ["twinChamber", "bigIron", "hollowPoint", "coldcaster", "pinball", "deadeye", "haloChamber", "ghostSight"] as const) {
    game = setArtifact(game, id, 2);
  }
  game = spawnWave(game);
  expect(game.targets.filter((target) => target.kind === "chaser")).toHaveLength(5);
  game = updateGame(game, { ...idle, firing: true }, 1 / 60, 1);
  expect(game.projectiles).toHaveLength(4);
  expect(game.projectiles.every((projectile) => projectile.damage === 34 && projectile.remainingBounces === 2)).toBe(true);
});
```

- [ ] **Step 2: Run simulation RED**

Run: `bun test src/game/simulation.test.ts`

Expected: FAIL because `src/game/simulation.ts` does not exist.

- [ ] **Step 3: Implement the state model and fixed update**

Use a logical room of `960 × 540`, an inset playable rectangle, a player circle, plain arrays of projectile/target objects, and injected `rng`. Each projectile stores velocity, phase, orbit timer/angle/radius, remaining bounces, freeze data, homing data, born time, and hit target IDs.

Update order per fixed step:

```ts
export const updateGame = (state: GameState, input: InputIntent, dt: number, now: number): GameState => {
  // 1. pause and visibility guard
  // 2. apply artifact/reload intents and expire temporary buffs
  // 3. move and clamp Ralphy
  // 4. fire when cooldown and ammo allow; auto-start reload at zero
  // 5. advance orbiters, launched projectiles, and homing steering
  // 6. move/freeze chasers
  // 7. resolve wall and target collisions, bounce, damage, statuses, and metrics
  // 8. remove dead/expired/out-of-bounds entities and summarize telemetry
  return state;
};
```

Use circle-vs-circle target collision and axis-aligned room-wall collision. A projectile may not damage the same target twice without first bouncing. A frozen chaser has zero movement until `frozenUntil`.

- [ ] **Step 4: Run focused and complete unit GREEN**

Run: `bun test src/game/simulation.test.ts`

Expected: all simulation tests PASS.

Run: `bun test`

Expected: all unit tests PASS.

- [ ] **Step 5: Commit the slice**

```bash
git add src/game/simulation.ts src/game/simulation.test.ts
git commit -m "feat: simulate the Ralphy combat room"
```

---

### Task 4: Generate and Process the Pixel-Art Pack

**Files:**
- Modify: `.gitignore`
- Create: `tmp/imagegen/ralphy-reference.png`
- Create: `public/assets/generated/style-anchor.png`
- Create: `public/assets/generated/room.png`
- Create: `public/assets/generated/ralphy/`
- Create: `public/assets/generated/revolver.png`
- Create: `public/assets/generated/effects/`
- Create: `public/assets/generated/targets/`
- Create: `public/assets/generated/ui/`
- Create: `public/assets/generated/artifacts/`
- Create: `scripts/split_atlas.py`

**Interfaces:**
- Consumes: canonical mascot SVG, the user-provided room screenshot, and the approved design spec.
- Produces: stable PNG runtime paths consumed by `src/assets.ts`.

- [ ] **Step 1: Prepare inspected references**

Render the canonical mascot to a high-resolution PNG and visually inspect both references:

```bash
mkdir -p tmp/imagegen public/assets/generated
rsvg-convert -w 1024 -h 1024 /Users/maximovchinnikov/github/ralphy/ralphy-web/public/assets/ralphy-mascot.svg -o tmp/imagegen/ralphy-reference.png
```

Add `tmp/imagegen/` to `.gitignore` before generation so model sources and rejected variants cannot be staged accidentally.

Use the attached screenshot only as `Image 1: composition, camera, texture-density, and room-readability reference`. Use `tmp/imagegen/ralphy-reference.png` as `Image 2: Ralphy identity reference`.

- [ ] **Step 2: Generate the landscape style anchor with built-in Imagegen**

Prompt:

```text
Use case: stylized-concept
Asset type: browser roguelike game style anchor
Input images: Image 1 is a composition and room-readability reference only; Image 2 is the exact identity reference for Ralphy
Primary request: create an original 16:9 top-down combat laboratory showing Ralphy the white ghost in a cowboy hat holding a small revolver, centered in an otherwise sparse test room
Scene/backdrop: worn near-black stone and metal room, shallow three-quarter walls, four door recesses, a few original training props, no copied characters or UI
Style/medium: polished hand-painted pixel art with chunky deliberate pixels, warm imperfect textures, crisp silhouettes, game-ready readability
Lighting/mood: dark noir room with restrained pools of warm off-white light and one orange accent color
Color palette: #0A0A0B, #F5F5F4, #FFA630 plus restrained charcoal steps
Constraints: preserve Ralphy's white ghost body, black oval eyes, and cowboy hat; original game art; no text; no logos; no watermark; no direct copying of the reference room
Avoid: smooth vector art, 3D rendering, neon cyberpunk, tiny noisy pixels, gradients, photorealism
```

Save the selected output as `public/assets/generated/style-anchor.png`, inspect it, and make at most one targeted correction before continuing.

- [ ] **Step 3: Generate six coherent runtime sources using the approved anchor**

Issue one built-in Imagegen call for each asset below, always including the style anchor as a reference and restating the same palette and pixel density:

1. `room.png`: empty 16:9 room, four door recesses, no props, entities, UI, text, or shadows that imply missing objects.
2. `ralphy-source.png`: exact Ralphy identity, `4 × 2` equal-cell directional idle/movement atlas, flat solid `#00ff00` background, no cast shadows, no green in subject.
3. `effects-source.png`: `4 × 2` equal-cell atlas containing bullet, cartridge, muzzle flash, impact, ricochet spark, freeze burst, homing marker, and orbit trail on flat `#00ff00`.
4. `targets-source.png`: `3 × 2` equal-cell atlas containing training dummy, chaser, rock, crate, lab marker, and closed door insert on flat `#00ff00`.
5. `ui-source.png`: `4 × 2` equal-cell atlas containing HUD plate, six-round cylinder, stat panel, artifact slot, square button, reload-bar frame, orange timing-zone fill, and health plate on flat `#00ff00`; no text or digits.
6. `artifacts-source.png`: `4 × 2` equal-cell atlas with original symbols for multishot, projectile size, damage, freeze, ricochet, active reload, orbit, and homing on flat `#00ff00`; no text.

Generate `revolver-source.png` in its own call: one side-view pixel-art revolver centered with generous padding on flat `#00ff00`, barrel pointing right, no hand, no shadow, no text.

- [ ] **Step 4: Implement deterministic grid splitting and alpha checks**

Create `scripts/split_atlas.py` using Pillow. It must accept `--input`, `--out-dir`, `--cols`, `--rows`, and comma-separated `--names`; remove border-sampled chroma green, split equal cells, crop transparent padding, place each crop on a square transparent canvas, resize with `Image.Resampling.NEAREST`, and fail when a named output has no opaque pixels.

Run it for every atlas and use descriptive names matching `src/assets.ts`. Process the revolver with the installed chroma-removal helper and validate transparent corners.

- [ ] **Step 5: Verify the generated pack visually and mechanically**

Run an asset inspection script that asserts every runtime file exists, opens as RGBA, has transparent sprite corners where applicable, and has non-zero opaque coverage. Render a contact sheet and inspect it with the local image viewer.

Expected: room, Ralphy, revolver, eight effects, six target/prop sprites, eight UI pieces, and eight artifact icons share one palette and pixel density.

- [ ] **Step 6: Commit approved assets and processing script**

```bash
git add public/assets/generated scripts/split_atlas.py
git commit -m "feat: add the Ralphy pixel-art pack"
```

Do not commit `tmp/imagegen/`.

---

### Task 5: Canvas Renderer, Input, HUD, and Laboratory Dock

**Files:**
- Create: `index.html`
- Create: `src/styles.css`
- Create: `src/assets.ts`
- Create: `src/render.ts`
- Create: `src/lab.ts`
- Create: `src/main.ts`

**Interfaces:**
- Consumes: `GameState` and actions from `src/game/simulation.ts`; generated runtime PNG paths.
- Produces: a playable page at `/` with one state owner, one animation loop, and semantic DOM controls.

- [ ] **Step 1: Create the semantic page shell**

`index.html` contains:

```html
<main id="app">
  <section class="game-shell" aria-label="Ralphy combat room">
    <canvas id="game" width="960" height="540"></canvas>
    <div id="hud" aria-live="polite"></div>
    <div id="reload" hidden><div class="reload-zone"></div><div class="reload-fill"></div></div>
  </section>
  <aside id="lab" aria-label="Combat laboratory controls">
    <header><p>RALPHY COMBAT LAB</p><h1>Test range 01</h1></header>
    <section id="artifacts"></section>
    <section id="spawner"></section>
    <section id="stats"></section>
  </aside>
</main>
<script type="module" src="/src/main.ts"></script>
```

Every artifact and spawn action is a real `<button>`. Counts use text, not generated bitmap glyphs.

- [ ] **Step 2: Implement asset loading with visible fallbacks**

`src/assets.ts` exports stable keys and `loadAssets()`. A rejected image promise records its key. Rendering substitutes palette-correct geometric placeholders, and `src/lab.ts` lists missing keys in a diagnostic row.

- [ ] **Step 3: Implement Canvas rendering**

`src/render.ts` draws in this order: room, props, targets, target status, projectiles/orbits/trails, Ralphy, revolver rotated to aim, impacts/damage labels, and minimal HUD. Disable smoothing on the context. Use generated images at integer coordinates and never derive gameplay values in rendering.

- [ ] **Step 4: Implement the laboratory projection and actions**

Render all eight artifact cards from one metadata array. A click on `+` or `−` calls `setArtifact`; Shift-click changes by five; `Give all ×1`, `Clear artifacts`, `Reset metrics`, `Reset lab`, four target actions, and live stat rows call simulation exports directly.

Show rolling DPS, peak DPS, total damage, triggers, projectiles, hits, misses, accuracy, kills, active projectile count, health, ammo, reload, damage, rate, count, spread, size, speed, bounce, freeze, orbit, homing, and Deadeye values. Give the total-damage value `data-testid="total-damage"` for the browser contract.

- [ ] **Step 5: Compose input and fixed-timestep loop**

`src/main.ts` owns the only mutable `GameState`, tracks WASD/mouse/fire/R/Escape input, uses a `1/120-second` fixed step with an accumulator, caps catch-up at `0.25 seconds`, pauses on `visibilitychange`, and renders once per animation frame. Pointer coordinates are mapped from CSS pixels into the `960 × 540` logical canvas.

- [ ] **Step 6: Style the approved noir pixel interface**

`src/styles.css` uses the canonical palette, a 16:9 canvas, a right dock between `320px` and `380px`, no gradients or decorative shadows, crisp image rendering, large readable metrics, orange active state, visible focus states, and a bottom reload bar. At reduced widths the dock overlays or moves below without distorting canvas coordinates. Honor `prefers-reduced-motion`.

- [ ] **Step 7: Run browser build and manual interaction check**

Run: `bun run build`

Expected: TypeScript and Vite exit `0`.

Run: `bun run dev`

Check movement, aiming, six shots, automatic reload, Deadeye timing, all artifact controls, dummy/chaser/wave spawning, reset actions, and missing-asset diagnostics. Confirm no browser console errors.

- [ ] **Step 8: Commit the playable interface**

```bash
git add index.html src/styles.css src/assets.ts src/render.ts src/lab.ts src/main.ts
git commit -m "feat: build the Ralphy combat laboratory"
```

---

### Task 6: Browser Smoke Test, Visual QA, and Final Verification

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/lab.spec.ts`
- Modify: affected runtime/test files only when a witnessed failing check demonstrates a defect.

**Interfaces:**
- Consumes: the complete browser application.
- Produces: reproducible unit/build/e2e evidence and final screenshots.

- [ ] **Step 1: Write the failing browser smoke test**

Create `tests/lab.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("builds a loadout, damages a dummy, and auto-reloads", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Test range 01" })).toBeVisible();
  await page.getByRole("button", { name: "Add Twin Chamber" }).click();
  await page.getByRole("button", { name: "Spawn dummy" }).click();
  const canvas = page.locator("#game");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("game canvas is not visible");
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
  for (let shot = 0; shot < 6; shot += 1) {
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.up();
    await page.waitForTimeout(320);
  }
  await expect(page.locator("#reload")).toBeVisible();
  await expect.poll(async () => Number(await page.getByTestId("total-damage").textContent())).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run RED before wiring any missing selectors/behavior**

Run: `bun run test:e2e -- tests/lab.spec.ts`

Expected: FAIL on the first missing or incorrect browser contract.

- [ ] **Step 3: Fix only witnessed browser-contract defects and run GREEN**

Run: `bun run test:e2e -- tests/lab.spec.ts`

Expected: `1 passed`, no console errors.

- [ ] **Step 4: Perform fresh full verification**

Run:

```bash
bun test
bun run build
bun run test:e2e
git diff --check
gitleaks detect --source . --no-banner
```

Expected: all unit tests pass, production build exits `0`, Playwright passes, diff check is clean, and the tracked tree has no detected secrets.

- [ ] **Step 5: Inspect visuals at two viewport sizes**

Capture and inspect screenshots at `1440 × 900` and `1024 × 768`. Confirm Ralphy identity, room texture, pixel sharpness, generated-asset transparency, readable stat density, visible reload progress/timing zone, and no clipped laboratory controls.

- [ ] **Step 6: Re-read the design acceptance criteria**

Match every acceptance item in `docs/superpowers/specs/2026-07-18-ralphy-combat-lab-design.md` to working UI evidence or a passing test. Fix any uncovered gap through a new failing test.

- [ ] **Step 7: Commit final browser QA**

```bash
git add playwright.config.ts tests/lab.spec.ts
git commit -m "test: verify the Ralphy combat lab"
```
