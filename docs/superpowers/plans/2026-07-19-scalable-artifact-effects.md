# Scalable Artifact Effects and Combat HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a scalable unique-artifact effect engine with Tesla Bullets, Shotgun, Spectral Bullets, reworked Halo Chamber, repaired Ghost Sight, source-aware telemetry, projectile cover, and an ImageGen-only pixel-art combat HUD.

**Architecture:** Replace artifact-specific weapon booleans with one validated catalog whose typed effects are applied in fixed phases. Keep the existing fixed-step simulation, but move shared room geometry and projectile behavior helpers into focused modules; simulation remains the orchestrator and metrics remains the damage ledger. HUD artwork is generated as PNG assets through ImageGen, while DOM/CSS only lays out those images and dynamic text.

**Tech Stack:** TypeScript 5.7, Bun test runner, Vite 6, Canvas 2D, DOM/CSS, Playwright 1.61, ImageGen, Pillow atlas splitter already present in the repository.

## Global Constraints

- Artifacts remain boolean-owned and unique; all different artifacts may be active together.
- Base multishot is `1.00`; Tesla adds `+0.33`; the fraction is an independent Bernoulli roll with no accumulator.
- One trigger consumes one cartridge regardless of projectile count.
- Do not add a game engine, UI framework, runtime dependency, ECS, or generalized visual scripting layer.
- Use the smallest typed effect registry that supports the specified phase order and later catalog growth.
- Production HUD art must be ImageGen PNG; do not ship hand-written SVG, Canvas/CSS-drawn hearts or icons, emoji, Unicode pictograms, or CSS geometric substitutes.
- Dynamic labels and numeric values remain accessible HTML text.
- Preserve the fixed `13 × 7` playable room, current movement inertia, six-round automatic reload, Deadeye timing, and existing unique artifact behavior unless this plan explicitly changes it.
- Use TDD for each non-asset behavior and keep all prior tests green.

## File Structure

- Create `src/game/artifacts.ts`: artifact catalog, effect definitions, ownership helpers, and catalog validation.
- Create `src/game/artifacts.test.ts`: uniqueness, validation, catalog lookup, and ownership tests.
- Create `src/game/projectiles.ts`: projectile behavior descriptors, state types, swept geometry, trajectory, splitting, homing, and Tesla helpers.
- Create `src/game/projectiles.test.ts`: focused behavior and geometry tests.
- Create `src/game/room.ts`: room dimensions plus shared prop/render/collision definitions.
- Create `src/hud.ts`: DOM projection for hearts, cylinder, resources, and reload art.
- Modify `src/game/weapon.ts`: derive universal stats from catalog effects and build probabilistic shots.
- Modify `src/game/weapon.test.ts`: new stat, behavior, and multishot contracts.
- Modify `src/game/metrics.ts` and `src/game/metrics.test.ts`: source-aware direct/secondary damage.
- Modify `src/game/simulation.ts` and `src/game/simulation.test.ts`: orchestrate descriptors, cover, split, spiral, homing, Tesla, resources, and telemetry.
- Modify `src/render.ts`: shared props and generated VFX rendering.
- Modify `src/lab.ts`: render artifacts and expanded derived stats from the shared catalog.
- Modify `src/assets.ts`: register generated HUD, artifact, and effect PNGs and enforce required-asset preflight.
- Modify `index.html`, `src/main.ts`, and `src/styles.css`: replace textual HP/ammo with ImageGen-backed DOM HUD.
- Modify `tests/lab.spec.ts`: end-to-end artifact, HUD, asset, reload, and telemetry coverage.
- Create accepted PNGs under `public/assets/generated/ui/`, `public/assets/generated/artifacts/`, and `public/assets/generated/effects/`; keep source atlases under `tmp/imagegen/` only.

Test-only fixture names in the snippets are local constructors, not production APIs. Define them beside the test that uses them with literal `GameState`, `ProjectileState`, or `TargetState` spreads; they may call only the public interfaces listed for that task. Use this shared deterministic helper exactly where sequential projectile IDs are needed:

```ts
const sequentialIds = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `projectile-child-${index + 1}`);
```

---

### Task 1: Validated Artifact Catalog and Probabilistic Shot Builder

**Files:**
- Create: `src/game/artifacts.ts`
- Create: `src/game/artifacts.test.ts`
- Create: `src/game/projectiles.ts`
- Modify: `src/game/weapon.ts`
- Modify: `src/game/weapon.test.ts`
- Modify: `src/game/simulation.ts`

**Interfaces:**
- Produces: `ARTIFACT_CATALOG`, `ArtifactId`, `ArtifactLoadout`, `getOwnedArtifacts(loadout)`, `validateArtifactCatalog(catalog)`, `ProjectileBehaviors`, `ProjectileSpec`, `DerivedWeapon.multishot`, and `buildShot(weapon, aimAngle, rng, triggerId)`.
- Consumes: existing base weapon values and boolean ownership contract.

- [ ] **Step 1: Write failing catalog and multishot tests**

Add tests that exercise the public contract directly:

```ts
import { describe, expect, test } from "bun:test";
import { ARTIFACT_CATALOG, getOwnedArtifacts, validateArtifactCatalog } from "./artifacts";
import { buildShot, deriveWeapon } from "./weapon";

test("catalog contains unique definitions for the three new artifacts", () => {
  expect(validateArtifactCatalog(ARTIFACT_CATALOG)).toEqual([]);
  expect(ARTIFACT_CATALOG.filter(({ id }) => ["teslaBullets", "shotgun", "spectralBullets"].includes(id))).toHaveLength(3);
});

test("ownership remains boolean and unique", () => {
  expect(getOwnedArtifacts({ teslaBullets: true }).map(({ id }) => id)).toEqual(["teslaBullets"]);
  expect(() => getOwnedArtifacts({ teslaBullets: 2 } as never)).toThrow("teslaBullets must be true when present");
});

test("Tesla uses a fresh 33 percent roll with no accumulator", () => {
  const weapon = deriveWeapon({ teslaBullets: true }, 0);
  expect(weapon.multishot).toBeCloseTo(1.33);
  expect(buildShot(weapon, 0, () => 0.329, "trigger-a").projectiles).toHaveLength(2);
  expect(buildShot(weapon, 0, () => 0.33, "trigger-b").projectiles).toHaveLength(1);
  expect(buildShot(weapon, 0, () => 0.99, "trigger-c").projectiles).toHaveLength(1);
});

test("Twin Chamber and Tesla derive 2.33 multishot", () => {
  const weapon = deriveWeapon({ twinChamber: true, teslaBullets: true }, 0);
  expect(weapon.multishot).toBeCloseTo(2.33);
  expect(buildShot(weapon, 0, () => 0.2, "trigger-a").projectiles).toHaveLength(3);
  expect(buildShot(weapon, 0, () => 0.8, "trigger-b").projectiles).toHaveLength(2);
});
```

- [ ] **Step 2: Run focused tests and confirm the expected failure**

Run: `bun test src/game/artifacts.test.ts src/game/weapon.test.ts`

Expected: FAIL because `artifacts.ts`, new artifact identifiers, `multishot`, and the new `buildShot` signature do not exist.

- [ ] **Step 3: Implement the catalog, descriptors, and shot builder**

Define one discriminated effect vocabulary in `artifacts.ts`, including current numeric modifiers and these behavior effects:

```ts
export type ArtifactEffect =
  | { kind: "addMultishot"; amount: number }
  | { kind: "multiplyDamage"; amount: number }
  | { kind: "multiplyRadius"; amount: number }
  | { kind: "spread"; radians: number }
  | { kind: "freeze"; chance: number; duration: number }
  | { kind: "bounce"; count: number; retention: number }
  | { kind: "activeReload"; window: number; buff: number; duration: number }
  | { kind: "spiral"; initialRadius: number; radialSpeed: number; angularSpeed: number; lifetime: number }
  | { kind: "homing"; radius: number; turnRate: number }
  | { kind: "tesla"; radius: number; neighbors: number; damageScale: number; cooldown: number }
  | { kind: "split"; distance: number; count: number; childRange: number; damageScale: number }
  | { kind: "penetration"; obstacles: boolean; targets: boolean };

export type ArtifactDefinition = {
  id: string;
  name: string;
  note: string;
  icon: string;
  category: "weapon" | "trajectory" | "status" | "utility";
  tags: readonly string[];
  effects: readonly ArtifactEffect[];
};
```

Populate all eleven definitions and preserve literal IDs with `export const ARTIFACT_CATALOG = [...] as const satisfies readonly ArtifactDefinition[];`. Derive `ArtifactId` as `(typeof ARTIFACT_CATALOG)[number]["id"]`, validate finite positive parameters and unique IDs, and make `getOwnedArtifacts` reject any stored value other than `true`.

In `projectiles.ts`, move `ProjectileState` out of `simulation.ts` and define typed optional descriptors for `spiral`, `homing`, `tesla`, `split`, and `penetration`. In `weapon.ts`, loop owned definitions and apply each discriminated effect in a single exhaustive switch. `buildShot` calculates `Math.floor(multishot)` plus `Number(rng() < multishot % 1)`, spaces headings using current spread, assigns `triggerId`, and attaches immutable behavior descriptors.

Update `simulation.ts` call sites to pass `state.rng` and a stable `trigger-${nextId}` identifier. Preserve one-round consumption.

- [ ] **Step 4: Run focused tests**

Run: `bun test src/game/artifacts.test.ts src/game/weapon.test.ts src/game/simulation.test.ts`

Expected: PASS with all current and new catalog/shot tests green.

- [ ] **Step 5: Commit**

```bash
git add src/game/artifacts.ts src/game/artifacts.test.ts src/game/projectiles.ts src/game/weapon.ts src/game/weapon.test.ts src/game/simulation.ts
git commit -m "feat: add scalable artifact catalog"
```

---

### Task 2: Shared Room Cover and Source-Aware Damage Metrics

**Files:**
- Create: `src/game/room.ts`
- Modify: `src/game/metrics.ts`
- Modify: `src/game/metrics.test.ts`
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`
- Modify: `src/render.ts`

**Interfaces:**
- Consumes: `ProjectileState.penetration`, existing bounce values, and Task 1 descriptor types.
- Produces: `ROOM`, `ROOM_PROPS`, `DamageSource`, `recordDamage`, `segmentCircleHitTime`, obstacle collision behavior, and `telemetry.secondaryHits`.

- [ ] **Step 1: Write failing metric and cover tests**

```ts
test("Tesla damage raises DPS without successful projectile accuracy", () => {
  let metrics = createMetrics();
  metrics = recordDamage(metrics, { source: "tesla", damage: 5, time: 1, targetId: "dummy-1" });
  expect(summarizeMetrics(metrics, 1)).toMatchObject({ totalDamage: 5, hits: 0, secondaryHits: 1, successfulProjectiles: 0 });
});

test("segmentCircleHitTime finds a swept hit and rejects a miss", () => {
  expect(segmentCircleHitTime({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 2 }, 3)).toBeCloseTo(0.3882, 3);
  expect(segmentCircleHitTime({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 5 }, 3)).toBeNull();
});

test("normal projectile dies on the rock while spectral and Pinball continue", () => {
  const normal = fireThroughRock(createGame(() => 0.9), {});
  const spectral = fireThroughRock(createGame(() => 0.9), { spectralBullets: true });
  const pinball = fireThroughRock(createGame(() => 0.9), { pinball: true });
  expect(normal.projectiles).toHaveLength(0);
  expect(spectral.projectiles).toHaveLength(1);
  expect(pinball.projectiles[0]?.remainingBounces).toBe(0);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `bun test src/game/metrics.test.ts src/game/projectiles.test.ts src/game/simulation.test.ts`

Expected: FAIL because source-aware damage, shared props, swept geometry, and projectile cover are absent.

- [ ] **Step 3: Implement shared room data, swept geometry, and damage sources**

Move `TILE_SIZE`, room bounds, and the three rendered props into `room.ts`. Give each prop a stable ID, kind, position, visual size, and collision radius. Import the same `ROOM_PROPS` from simulation and renderer.

Implement `segmentCircleHitTime(from, to, center, combinedRadius)` using the quadratic segment/circle intersection and return the earliest normalized `t` in `[0, 1]` or `null`.

Replace metric-only hit recording with:

```ts
export type DamageSource = "direct" | "tesla" | "status";
export type DamageEvent = {
  source: DamageSource;
  damage: number;
  time: number;
  targetId: string;
  projectileId?: string;
  triggerId?: string;
  artifactId?: string;
  x?: number;
  y?: number;
  firstProjectileHit?: boolean;
};

export function recordDamage(metrics: Metrics, event: DamageEvent): Metrics;
```

Direct events increment direct hits and first-hit accuracy; Tesla/status events increment `secondaryHits`. All sources update damage totals, rolling DPS, peak DPS, and per-target damage.

Resolve the earliest prop intersection before the wall/target result. Spectral obstacle penetration ignores it; Pinball reflects and spends one bounce; other projectiles expire. Keep player movement independent from prop collision.

- [ ] **Step 4: Run focused tests**

Run: `bun test src/game/metrics.test.ts src/game/projectiles.test.ts src/game/simulation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/room.ts src/game/metrics.ts src/game/metrics.test.ts src/game/projectiles.ts src/game/projectiles.test.ts src/game/simulation.ts src/game/simulation.test.ts src/render.ts
git commit -m "feat: add projectile cover and damage sources"
```

---

### Task 3: Spectral Penetration and Shotgun Splitting

**Files:**
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`

**Interfaces:**
- Consumes: Task 1 `split`/`penetration` descriptors and Task 2 swept collision helpers.
- Produces: travelled-path tracking, `splitProjectile(parent, nextIds)`, target piercing, and single-generation Shotgun children.

- [ ] **Step 1: Write failing behavior and interaction tests**

```ts
test("Shotgun splits once into eight 35 percent pellets after 160 pixels", () => {
  const parent = shotgunProjectile({ x: 100, y: 100, damage: 20, travelled: 159 });
  const result = advanceForDistance(parent, 2, sequentialIds(8));
  expect(result.removedParent).toBe(true);
  expect(result.children).toHaveLength(8);
  expect(result.children.every((child) => child.damage === 7 && child.split === undefined)).toBe(true);
  expect(result.children.every((child) => child.maxTravel === 128)).toBe(true);
});

test("Spectral projectile damages two targets once each and keeps flying", () => {
  const state = lineUpTwoTargets(withArtifacts(createGame(() => 0.9), { spectralBullets: true }));
  const after = fireAndAdvance(state, 0.5);
  expect(after.metrics.hits).toBe(2);
  expect(after.projectiles).toHaveLength(1);
  expect(after.projectiles[0]?.hitTargetIds).toHaveLength(2);
});

test("Shotgun children inherit spectral homing freeze bounce and Tesla but not split", () => {
  const children = splitProjectile(fullBehaviorParent(), sequentialIds(8));
  expect(children.every(({ penetration, homing, freezeChance, remainingBounces, tesla, split }) =>
    penetration.obstacles && penetration.targets && homing !== undefined && freezeChance > 0 && remainingBounces === 1 && tesla !== undefined && split === undefined
  )).toBe(true);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `bun test src/game/projectiles.test.ts src/game/simulation.test.ts`

Expected: FAIL because path-limited splitting and target piercing are not implemented.

- [ ] **Step 3: Implement path events, split inheritance, and piercing**

Track `travelled` and optional `maxTravel` on every projectile. During a fixed step, compare split-threshold time with swept wall, prop, and target hit times and resolve the earliest event. Create eight children at the exact event point, fan headings over `2π`, copy compatible descriptors/state, set damage to `parent.damage * 0.35`, set `maxTravel` to `128`, and clear `split`.

For target penetration, apply damage once, append the target ID, and continue the remaining swept segment instead of consuming the projectile. Non-piercing behavior remains unchanged. Prevent a projectile from damaging any target already in its hit history.

- [ ] **Step 4: Run focused and regression tests**

Run: `bun test src/game/projectiles.test.ts src/game/simulation.test.ts src/game/weapon.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/projectiles.ts src/game/projectiles.test.ts src/game/simulation.ts src/game/simulation.test.ts
git commit -m "feat: add spectral and shotgun effects"
```

---

### Task 4: Fixed-Origin Halo Spiral and Swept Ghost Sight

**Files:**
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`
- Modify: `src/render.ts`

**Interfaces:**
- Consumes: projectile trajectory/homing descriptors, targets, swept geometry, and Shotgun children.
- Produces: immutable `spiralOrigin`, expanding spiral advance, persistent `homingTargetId`, swept acquisition, and rosette children.

- [ ] **Step 1: Write failing Halo and Ghost tests**

```ts
test("Halo keeps its muzzle origin, expands 48 pixels per second, and expires at four seconds", () => {
  const projectile = haloProjectile({ origin: { x: 200, y: 200 }, initialRadius: 24 });
  const afterOne = advanceTrajectory(projectile, [], 1);
  expect(afterOne.spiralOrigin).toEqual({ x: 200, y: 200 });
  expect(afterOne.spiralRadius).toBeCloseTo(72);
  expect(afterOne.spiralAngle - projectile.spiralAngle).toBeCloseTo(Math.PI * 3);
  expect(afterOne.lifetime).toBe(4);
});

test("moving Ralphy and changing aim cannot move a Halo origin", () => {
  const fired = fireHaloAt(createGame(() => 0.9), { x: 800, y: 300 });
  const moved = updateGame({ ...fired, player: { ...fired.player, x: fired.player.x + 100 } }, idleInput({ aimX: 100, aimY: 100 }), 0.5, 0.5);
  expect(moved.projectiles[0]?.spiralOrigin).toEqual(fired.projectiles[0]?.spiralOrigin);
});

test("Ghost Sight acquires across the swept segment and retains the lock", () => {
  const projectile = homingProjectile({ x: 0, y: 0, vx: 620, vy: 0 });
  const target = targetAt("dummy-1", 80, 70);
  const acquired = advanceTrajectory(projectile, [target], 0.2);
  expect(acquired.homingTargetId).toBe("dummy-1");
  expect(Math.atan2(acquired.vy, acquired.vx)).toBeGreaterThan(0);
  expect(advanceTrajectory(acquired, [{ ...target, x: 300, y: 200 }], 0.1).homingTargetId).toBe("dummy-1");
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `bun test src/game/projectiles.test.ts src/game/simulation.test.ts`

Expected: FAIL against the current player-following orbit and point-sample homing.

- [ ] **Step 3: Implement outward spiral, persistent homing, and Halo/Shotgun rosette**

At spawn, store the muzzle position as immutable `spiralOrigin`, radius `24`, radial speed `48`, angular speed `3π`, and lifetime `4`. Each step derives radial plus tangential desired velocity around that origin and increments the real path length. Do not read player position or aim after spawn.

Acquire Ghost targets using distance from the complete proposed movement segment with radius `96`. Store the selected ID, steer desired velocity by at most `3π * dt`, retain a living target outside the acquisition radius, and clear/reacquire when the ID disappears.

For a Halo parent split, give all children the same origin/current position and varied angular velocity around the parent's `3π` rate so they separate continuously into a rosette without teleporting.

Update rendering to use the existing/generated spiral and homing sprites based on descriptors rather than the removed `phase === "orbit"` model.

- [ ] **Step 4: Run focused and regression tests**

Run: `bun test src/game/projectiles.test.ts src/game/simulation.test.ts`

Expected: PASS, including existing movement/reload tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/projectiles.ts src/game/projectiles.test.ts src/game/simulation.ts src/game/simulation.test.ts src/render.ts
git commit -m "feat: rework halo and ghost sight"
```

---

### Task 5: Tesla Neighbor Graph, Arc Damage, and VFX Rendering

**Files:**
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`
- Modify: `src/render.ts`

**Interfaces:**
- Consumes: surviving Tesla projectiles, Task 2 segment-circle geometry and `recordDamage`, and generated `teslaArc` asset key added in Task 7.
- Produces: `TeslaLink`, `buildTeslaLinks(projectiles)`, `GameState.teslaLinks`, canonical cooldown keys, and source-aware arc damage.

- [ ] **Step 1: Write failing Tesla graph and metric tests**

```ts
test("Tesla links each projectile to at most two nearest neighbors within 96 pixels", () => {
  const links = buildTeslaLinks([
    teslaProjectile("a", 0, 0, 20), teslaProjectile("b", 30, 0, 20),
    teslaProjectile("c", 60, 0, 10), teslaProjectile("d", 200, 0, 20),
  ]);
  expect(links.every(({ distance }) => distance <= 96)).toBe(true);
  expect(new Set(links.map(({ id }) => id)).size).toBe(links.length);
  expect(endpointDegrees(links).get("a")).toBeLessThanOrEqual(2);
  expect(links.some(({ a, b }) => a === "d" || b === "d")).toBe(false);
});

test("Tesla deals 25 percent of the lower endpoint damage on a 150ms cooldown", () => {
  const state = teslaArcAcrossDummy({ endpointDamage: [20, 8] });
  const first = resolveTesla(state, 1);
  const blocked = resolveTesla(first, 1.1);
  const ready = resolveTesla(blocked, 1.16);
  expect(first.metrics.totalDamage).toBe(2);
  expect(blocked.metrics.totalDamage).toBe(2);
  expect(ready.metrics.totalDamage).toBe(4);
  expect(ready.telemetry).toMatchObject({ hits: 0, secondaryHits: 2, successfulProjectiles: 0 });
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `bun test src/game/projectiles.test.ts src/game/simulation.test.ts src/game/metrics.test.ts`

Expected: FAIL because link construction and cooldown state do not exist.

- [ ] **Step 3: Implement link selection, damage, cooldown cleanup, and renderer hooks**

Build candidate pairs under `96 px`, sort by distance then stable canonical pair ID, and greedily accept pairs while each endpoint degree is below two. Store current links on `GameState` for rendering. For each link-target intersection, use the key `${pairId}:${targetId}`, require `now >= nextAllowedAt`, record `0.25 * Math.min(a.damage, b.damage)` as source `tesla`, then set `nextAllowedAt = now + 0.15`. Remove cooldown entries whose pair or target no longer exists and whose deadline has passed.

Render links behind projectile sprites. Until Task 7 adds the final typed asset key, use the already registered `orbitTrail` image as the temporary bitmap texture; Task 7 must replace that reference with the required ImageGen `tesla-arc.png` and its asset-load assertion before the feature is complete. When `RenderOptions.reducedMotion` is true, keep link geometry and damage unchanged but disable texture scrolling and repeated impact flashes.

- [ ] **Step 4: Run focused and full unit tests**

Run: `bun test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/projectiles.ts src/game/projectiles.test.ts src/game/simulation.ts src/game/simulation.test.ts src/render.ts
git commit -m "feat: add Tesla projectile arcs"
```

---

### Task 6: Catalog-Driven Laboratory and Expanded Telemetry

**Files:**
- Modify: `src/lab.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`
- Modify: `src/styles.css`
- Modify: `tests/lab.spec.ts`

**Interfaces:**
- Consumes: `ARTIFACT_CATALOG`, `setArtifact`, source-aware telemetry, and `DerivedWeapon` behavior descriptors.
- Produces: eleven catalog-driven artifact cards and visible multishot/effect statistics.

- [ ] **Step 1: Write failing browser and projection assertions**

Add Playwright assertions:

```ts
await expect(page.locator("[data-artifact]")).toHaveCount(11);
await page.getByRole("button", { name: "Take Tesla Bullets" }).click();
await expect(page.locator('[data-stat="multishot"]')).toContainText("1.33×");
await expect(page.locator('[data-stat="tesla"]')).toContainText("96 px");
await page.getByRole("button", { name: "Take Shotgun" }).click();
await expect(page.locator('[data-stat="split"]')).toContainText("8 × 128 px");
await page.getByRole("button", { name: "Take Spectral Bullets" }).click();
await expect(page.locator('[data-stat="penetration"]')).toContainText("COVER + TARGETS");
```

- [ ] **Step 2: Run the focused browser test and confirm failure**

Run: `bun run test:e2e --grep "catalog telemetry"`

Expected: FAIL because the laboratory owns a separate eight-item array and lacks new stat rows.

- [ ] **Step 3: Render cards and statistics from shared data**

Delete the private `ARTIFACTS` list from `lab.ts`. Iterate `ARTIFACT_CATALOG`, use definition names/notes/icon keys, and keep the existing accessible Take/Remove behavior. Add rows for multishot, split, penetration, Tesla, and reworked Halo/Ghost values. Format multishot as `${multishot.toFixed(2)}× · ${Math.round((multishot % 1) * 100)}% extra`.

Keep the two-column card grid and current right-panel scrolling. Adjust only the minimum CSS necessary for eleven cards to remain readable.

- [ ] **Step 4: Run unit and browser tests**

Run: `bun test && bun run test:e2e --grep "catalog telemetry"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lab.ts src/game/simulation.ts src/game/simulation.test.ts src/styles.css tests/lab.spec.ts
git commit -m "feat: expose artifact effect telemetry"
```

---

### Task 7: ImageGen HUD/VFX Asset Pack and Heart/Cylinder/Resource HUD

**Files:**
- Create: `src/hud.ts`
- Create: `public/assets/generated/ui/heart-full.png`
- Create: `public/assets/generated/ui/heart-half.png`
- Create: `public/assets/generated/ui/heart-empty.png`
- Create: `public/assets/generated/ui/ammo-loaded.png`
- Create: `public/assets/generated/ui/ammo-empty.png`
- Create: `public/assets/generated/ui/coin.png`
- Create: `public/assets/generated/ui/bomb.png`
- Create: `public/assets/generated/ui/key.png`
- Create: `public/assets/generated/ui/reload-fill.png`
- Create: `public/assets/generated/ui/reload-success.png`
- Create: `public/assets/generated/artifacts/tesla-bullets.png`
- Create: `public/assets/generated/artifacts/shotgun.png`
- Create: `public/assets/generated/artifacts/spectral-bullets.png`
- Create: `public/assets/generated/effects/tesla-arc.png`
- Create: `public/assets/generated/effects/shotgun-split.png`
- Create: `public/assets/generated/effects/spectral-trail.png`
- Modify: `src/assets.ts`
- Modify: `src/game/simulation.ts`
- Modify: `index.html`
- Modify: `src/main.ts`
- Modify: `src/render.ts`
- Modify: `src/styles.css`
- Modify: `tests/lab.spec.ts`

**Interfaces:**
- Consumes: existing style anchor/room/Ralphy assets, `GameState.player.health`, reload ammo/capacity, and new `GameState.resources`.
- Produces: `mountHud(root)`, `updateHud(state)`, required asset manifest keys, asset preflight, five-heart HUD, six cartridge tiles, and `00–99` resources.

- [ ] **Step 1: Read and use the ImageGen skill, then generate two coherent atlases**

Use the existing `public/assets/generated/style-anchor.png` and `public/assets/generated/room.png` as referenced images. Generate a dedicated HUD atlas with this exact art direction:

```text
Original pixel-art game HUD sprite atlas for Ralphy the Ghost, matching the attached noir industrial room: near-black iron, warm ivory highlights, restrained Ralphy orange, chunky hand-painted pixels, readable at 24–32 logical pixels. Perfectly flat saturated chroma-green background, strict 4 by 3 grid, one centered isolated sprite per cell, generous empty gutters, no text, no letters, no numbers, no logos, no gradients into the green. Row 1: full red heart, left-half red heart in an empty iron heart container, empty iron heart container, loaded brass revolver cartridge tile. Row 2: empty cartridge slot, gold coin, small round bomb, brass key. Row 3: reload frame ornament, neutral reload fill tile, gold timing-zone tile, bright successful-reload tile. Consistent scale, lighting, outline weight, and transparent-ready silhouettes.
```

Generate a second `3 × 2` atlas for Tesla Bullets, Shotgun, Spectral Bullets icons plus Tesla arc, Shotgun split burst, and spectral trail, with the same palette and chroma requirements. Do not use generated text.

Save sources as `tmp/imagegen/hud-v2-source.png` and `tmp/imagegen/combat-effects-v2-source.png`. Split with the existing `uv run scripts/split_atlas.py`, using row-major names and `--size 128`. Visually inspect every PNG; regenerate any cell with merged gutters, green contamination, unreadable silhouette, or inconsistent style.

- [ ] **Step 2: Write failing HUD and asset-preflight browser assertions**

```ts
await expect(page.locator("#hud .heart img")).toHaveCount(5);
await expect(page.locator("#hud .ammo-tile img")).toHaveCount(6);
await expect(page.locator('[data-resource="coins"]')).toHaveText("00");
await expect(page.locator('[data-resource="bombs"]')).toHaveText("00");
await expect(page.locator('[data-resource="keys"]')).toHaveText("00");
await expect(page.locator('#asset-diagnostics')).toContainText("All generated assets loaded");
await expect(page.locator('#hud svg, #hud [data-css-art]')).toHaveCount(0);
```

- [ ] **Step 3: Run the focused browser test and confirm failure**

Run: `bun run test:e2e --grep "imagegen combat hud"`

Expected: FAIL because the old HUD is text-only and the new manifest keys/projection do not exist.

- [ ] **Step 4: Implement the ImageGen-backed HUD without homemade artwork**

Replace the old two spans with semantic containers for hearts, ammo, and resources. `hud.ts` creates `<img>` elements using `ASSET_PATHS` and updates only `src`, `alt`, and numeric text. Use five heart containers: full per `20 HP`, half per remaining `10 HP`, empty otherwise. Create exactly six ammo image elements and choose loaded/empty by index. Clamp resource state through:

```ts
export type Resources = { coins: number; bombs: number; keys: number };
export const clampResource = (value: number): number => Math.max(0, Math.min(99, Math.trunc(value)));
```

Initialize all resources to zero. Style only layout, sizing, spacing, text shadows, and image scaling; do not draw icon geometry with CSS. Use generated reload textures as image/background-image layers and remove canvas-drawn HUD plate/cylinder duplication. Keep telemetry in the laboratory panel.

Add every new PNG to `ASSET_PATHS`. Treat the HUD/artifact/VFX keys as required: `loadAssets` may report diagnostics, but `start()` throws a descriptive error before the loop if any required key is missing.

- [ ] **Step 5: Run HUD, asset, unit, build, and focused browser checks**

Run: `bun test && bun run build && bun run test:e2e --grep "imagegen combat hud"`

Expected: PASS with no missing required assets.

- [ ] **Step 6: Commit**

```bash
git add public/assets/generated src/assets.ts src/game/simulation.ts src/hud.ts index.html src/main.ts src/render.ts src/styles.css tests/lab.spec.ts
git commit -m "feat: add ImageGen combat HUD"
```

---

### Task 8: Full Interaction Coverage, Browser Polish, and Final Verification

**Files:**
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/simulation.test.ts`
- Modify: `tests/lab.spec.ts`
- Modify: `src/render.ts`
- Modify: `src/styles.css`
- Modify: `docs/superpowers/specs/2026-07-19-scalable-artifact-effects-design.md` only if a verified implementation detail requires clarification without changing approved behavior.

**Interfaces:**
- Consumes: completed Tasks 1–7.
- Produces: deterministic all-five regression, polished desktop/responsive screenshots, and a fully green release check.

- [ ] **Step 1: Add the all-five deterministic simulation test**

Create one state with Tesla Bullets, Shotgun, Spectral Bullets, Halo Chamber, and Ghost Sight, a dummy near cover, and an RNG roll below `0.33`. Assert:

```ts
expect(afterTrigger.projectiles).toHaveLength(2);
expect(afterTrigger.reload.ammo).toBe(5);
expect(afterBloom.projectiles.some(({ split }) => split !== undefined)).toBe(false);
expect(afterBloom.projectiles.length).toBeGreaterThanOrEqual(8);
expect(afterBloom.projectiles.every(({ penetration }) => penetration.obstacles && penetration.targets)).toBe(true);
expect(afterBloom.projectiles.some(({ homingTargetId }) => homingTargetId === dummy.id)).toBe(true);
expect(afterBloom.teslaLinks.length).toBeGreaterThan(0);
expect(afterBloom.telemetry.totalDamage).toBeGreaterThan(0);
```

- [ ] **Step 2: Add end-to-end interaction coverage**

In Playwright, take all three new artifacts plus Halo/Ghost, spawn three dummies, fire until auto reload, and assert the ammo tiles empty/refill, projectile and secondary-hit telemetry changes, cards remain uniquely selected, and no page errors or missing-asset diagnostics occur. Keep selectors based on roles, `data-artifact`, and `data-stat` rather than pixel coordinates except for aiming into the canvas.

Repeat the interaction once after `page.emulateMedia({ reducedMotion: "reduce" })`; assert projectile counts and damage totals still advance while animated texture offsets and repeated Tesla flashes remain disabled.

- [ ] **Step 3: Run the complete verification suite**

Run, in order:

```bash
bun test
bun run build
bun run test:e2e
```

Expected: all unit tests pass; TypeScript and Vite production build pass; all Playwright tests pass in Chromium.

- [ ] **Step 4: Inspect desktop and responsive screenshots**

Run the existing screenshot paths at `1440 × 900` and `1024 × 768`, then inspect both images. Verify the room remains `13 × 7`, Ralphy remains approximately one tile, hearts/ammo/resources do not cover the playable center, the bottom reload bar is legible, the right laboratory scrolls independently, and every generated icon remains crisp under nearest-neighbor scaling. Fix only concrete visual defects and rerun the affected browser test.

- [ ] **Step 5: Run repository hygiene checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended implementation/test/assets/plan files are modified.

- [ ] **Step 6: Commit final integration fixes**

```bash
git add src tests public/assets/generated docs/superpowers/specs/2026-07-19-scalable-artifact-effects-design.md
git commit -m "test: verify scalable artifact combinations"
```

If Step 4 required no tracked fixes and all changes are already committed, skip the empty commit and record the verified commands in the handoff.
