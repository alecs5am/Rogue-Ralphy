# Ralphy Arsenal and Animation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Tesla and Shotgun readability, replace the current gun/projectile presentation, and ship deterministic ImageGen-backed chibi animations for Ralphy's idle, movement, fire, reload, hurt, and death states.

**Architecture:** Keep the existing catalog-driven weapon and fixed-step Canvas 2D simulation. Extend only the generic split descriptor, add three presentation timestamps to `GameState`, isolate atlas frame selection in one pure `presentation.ts` module, and keep the revolver/projectile as separate sprites. Build one normalized fixed-cell atlas from a few coherent ImageGen sheets with a dedicated local packer that never alpha-crops frames independently.

**Tech Stack:** TypeScript 5.7, Bun test runner, Vite 6, Canvas 2D, Playwright 1.61, built-in ImageGen, Python 3.10 with Pillow 12.2, existing `uv` script workflow.

## Global Constraints

- Tesla remains base `1.00` plus `0.33`; every trigger uses an independent Bernoulli roll and consumes one cartridge, with no accumulator or pity system.
- Tesla contributes `8°` generic spread; Twin Chamber plus Tesla derives `2.33` multishot and `16°` total spread.
- Shotgun uses split distance `160 px`, eight children, child range `320 px`, a `48°` forward cone, `25%` parent damage, and `55%` parent radius.
- Shotgun children inherit compatible Tesla, Ghost, Spectral, Halo, freeze, and remaining-bounce behavior, but never inherit the split descriptor.
- Preserve the fixed `13 × 7` room, one-tile player scale, six-round automatic reload, Deadeye timing, deterministic fixed-step simulation, unique boolean artifact ownership, HUD, metrics, and laboratory controls.
- State precedence is exactly `death > hurt > reload > fire > move > idle`; fire lasts `160 ms`, hurt lasts `180 ms`, and the final death frame holds until `Reset lab`.
- Player controls stop at zero health while existing projectiles and targets continue updating.
- Author only `down`, `up`, and `side-left`; mirror the side cells at runtime for `right`.
- The runtime Ralphy atlas is `1536 × 768`, with `128 × 128` cells in a `12 × 6` grid and a stable `(64, 74)` body anchor.
- New character, revolver, round soul projectile, and muzzle-flash production artwork must be accepted ImageGen PNG assets. Do not ship SVG, CSS, Canvas-drawn, emoji, or independently generated per-frame substitutes.
- Do not add a runtime dependency, framework, game engine, ECS, skeletal animation, generalized animation framework, or second clock.
- Use TDD for gameplay and atlas logic; use visual inspection plus browser probes for generated art.

## File Structure

- Modify `src/game/artifacts.ts` and `src/game/artifacts.test.ts`: Tesla spread and the six-field validated split descriptor.
- Modify `src/game/projectiles.ts` and `src/game/projectiles.test.ts`: directional cone headings plus child radius scaling and Halo composition.
- Modify `src/game/weapon.test.ts`: exact derived Tesla/Shotgun values; the generic production shot builder already supports the new spread.
- Modify `src/game/simulation.ts` and `src/game/simulation.test.ts`: presentation timestamps, death input lock, damage/death transitions, and combat integration regressions.
- Create `src/game/presentation.ts` and `src/game/presentation.test.ts`: pure deterministic state precedence, facing, atlas-frame, recoil, and reload-spin selection.
- Create `scripts/build_ralphy_atlas.py` and `scripts/test_build_ralphy_atlas.py`: fixed-cell chroma cleanup, atlas packing, and PNG validation without per-frame cropping.
- Modify `src/assets.ts`; create `src/assets.test.ts`: replace static body/gun/bullet manifest entries with the atlas, ghost revolver, soul projectile, and muzzle flash.
- Modify `src/render.ts` and `src/main.ts`: nine-argument atlas rendering, right-side mirroring, procedural recoil/spin, muzzle flash, and unrotated round projectile core.
- Modify `src/lab.ts` and `tests/lab.spec.ts`: updated telemetry, required-asset/browser probes, animation smoke flows, and screenshots.
- Create accepted runtime PNGs under `public/assets/generated/ralphy/` and `public/assets/generated/effects/`; keep full-resolution source sheets under ignored `tmp/imagegen/`.

---

### Task 1: Make Tesla's Probabilistic Extra Shot Visibly Diverge

**Files:**
- Modify: `src/game/artifacts.ts`
- Modify: `src/game/artifacts.test.ts`
- Modify: `src/game/simulation.test.ts`

**Interfaces:**
- Consumes: existing `deriveWeapon(loadout, fireRateBuff)` and `buildShot(weapon, aimAngle, rng, triggerId)`.
- Produces: Tesla-derived `multishot === 1.33`, `spread === 8 * Math.PI / 180`, and two proc headings at `aim ± 4°`; Twin plus Tesla derives `2.33` and `16°`.

- [ ] **Step 1: Write the failing Tesla heading tests**

Replace the existing probabilistic tests in `src/game/artifacts.test.ts` with exact spread assertions:

```ts
const degrees = Math.PI / 180;

test("Tesla uses a fresh 33 percent roll and fans a successful pair across eight degrees", () => {
  const weapon = deriveWeapon({ teslaBullets: true }, 0);
  expect(weapon.multishot).toBeCloseTo(1.33);
  expect(weapon.spread).toBeCloseTo(8 * degrees);

  const proc = buildShot(weapon, 0, () => 0.329, "trigger-a").projectiles;
  expect(proc).toHaveLength(2);
  expect(proc[0]!.heading).toBeCloseTo(-4 * degrees);
  expect(proc[1]!.heading).toBeCloseTo(4 * degrees);

  const miss = buildShot(weapon, 0, () => 0.33, "trigger-b").projectiles;
  expect(miss).toHaveLength(1);
  expect(miss[0]!.heading).toBe(0);
  expect(buildShot(weapon, 0, () => 0.99, "trigger-c").projectiles).toHaveLength(1);
});

test("Twin Chamber and Tesla add their multishot and spread", () => {
  const weapon = deriveWeapon({ twinChamber: true, teslaBullets: true }, 0);
  expect(weapon.multishot).toBeCloseTo(2.33);
  expect(weapon.spread).toBeCloseTo(16 * degrees);

  const proc = buildShot(weapon, 0, () => 0.2, "trigger-a").projectiles;
  expect(proc.map(({ heading }) => heading)).toHaveLength(3);
  expect(proc[0]!.heading).toBeCloseTo(-8 * degrees);
  expect(proc[1]!.heading).toBeCloseTo(0);
  expect(proc[2]!.heading).toBeCloseTo(8 * degrees);

  const miss = buildShot(weapon, 0, () => 0.8, "trigger-b").projectiles;
  expect(miss[0]!.heading).toBeCloseTo(-8 * degrees);
  expect(miss[1]!.heading).toBeCloseTo(8 * degrees);
});
```

Add this fixed-step integration regression to `src/game/simulation.test.ts`, reusing the file's existing `idle` intent and `STEP` constant:

```ts
test("a successful Tesla extra shot diverges into a non-zero electrical link", () => {
  let game = setArtifact(createGame(() => 0.329), "teslaBullets", true);
  const aim = { ...idle, aimY: game.player.y };

  game = updateGame(game, { ...aim, firing: true }, 0, 1);
  game = updateGame(game, aim, STEP, 1 + STEP);

  expect(game.projectiles).toHaveLength(2);
  expect(game.projectiles[0]!.y).not.toBe(game.projectiles[1]!.y);
  expect(game.teslaLinks).toHaveLength(1);
  expect(game.teslaLinks[0]!.distance).toBeGreaterThan(0);
  expect(game.teslaLinks[0]!.distance).toBeLessThanOrEqual(96);
});
```

- [ ] **Step 2: Run the focused tests and confirm red**

Run: `bun test src/game/artifacts.test.ts src/game/simulation.test.ts`

Expected: FAIL because Tesla currently derives zero spread, so the two proc projectiles overlap.

- [ ] **Step 3: Add Tesla's generic spread effect**

Replace only the Tesla catalog definition in `src/game/artifacts.ts`:

```ts
{
  id: "teslaBullets",
  name: "Tesla Bullets",
  note: "+0.33 multishot · chain arcs",
  icon: "teslaBullets",
  category: "weapon",
  tags: ["multishot", "spread", "tesla"],
  effects: [
    { kind: "addMultishot", amount: 0.33 },
    { kind: "spread", radians: 8 * degrees },
    { kind: "tesla", radius: 96, neighbors: 2, damageScale: 0.25, cooldown: 0.15 },
  ],
}
```

Do not change `buildShot`: its existing count-aware distribution preserves one exact aim heading on a failed roll, creates `±4°` on a Tesla proc, adds Twin's spread, and preserves Halo's full-circle phase placement.

- [ ] **Step 4: Re-run focused tests and confirm green**

Run: `bun test src/game/artifacts.test.ts src/game/simulation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the Tesla fix**

```bash
git add src/game/artifacts.ts src/game/artifacts.test.ts src/game/simulation.test.ts
git commit -m "fix: make Tesla multishot visibly diverge"
```

### Task 2: Reshape Shotgun into a Smaller Forward Cone

**Files:**
- Modify: `src/game/artifacts.ts`
- Modify: `src/game/artifacts.test.ts`
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/weapon.test.ts`
- Modify: `src/game/simulation.test.ts`
- Modify: `src/lab.ts`
- Modify: `tests/lab.spec.ts`

**Interfaces:**
- Produces: `SplitBehavior = { distance, count, childRange, damageScale, fanAngle, radiusScale }`.
- Preserves: `splitProjectile(parent, nextIds)`, compatible inherited descriptors, immutable split origin, one-level splitting, and simulation's exact swept split event.

- [ ] **Step 1: Write failing split descriptor, geometry, scaling, and telemetry tests**

Extend `src/game/artifacts.test.ts` with malformed descriptors that reuse the catalog's exact validation message:

```ts
test("rejects invalid Shotgun cone and radius scales", () => {
  const shotgun = ARTIFACT_CATALOG.find(({ id }) => id === "shotgun")!;
  const invalid = (fanAngle: number, radiusScale: number) => [{
    ...shotgun,
    effects: [{ kind: "split", distance: 160, count: 8, childRange: 320,
      damageScale: 0.25, fanAngle, radiusScale }],
  }] as unknown as readonly ArtifactDefinition[];
  expect(validateArtifactCatalog(invalid(Math.PI * 2 + 0.01, 0.55))).toContain(
    "shotgun.effects[0].split parameters must be finite and positive",
  );
  expect(validateArtifactCatalog(invalid(Math.PI / 4, 1.01))).toContain(
    "shotgun.effects[0].split parameters must be finite and positive",
  );
});
```

Add to `src/game/weapon.test.ts`:

```ts
test("Shotgun derives the approved directional split", () => {
  expect(deriveWeapon({ shotgun: true }, 0).behaviors.split).toEqual({
    distance: 160,
    count: 8,
    childRange: 320,
    damageScale: 0.25,
    fanAngle: 48 * Math.PI / 180,
    radiusScale: 0.55,
  });
});
```

Replace the old range/bloom test in `src/game/projectiles.test.ts`:

```ts
test("Shotgun splits into eight smaller pellets across a 48 degree forward cone", () => {
  let game = setArtifact(createGame(() => 0.9), "shotgun", true);
  game = updateGame(game, { ...idle, aimY: game.player.y, firing: true }, 0, 1);
  const parent = { ...game.projectiles[0]!, travelled: 160 };
  const children = splitProjectile(parent, Array.from({ length: 8 }, (_, index) => `pellet-${index}`));
  const degrees = Math.PI / 180;
  const parentHeading = Math.atan2(parent.vy, parent.vx);

  expect(children).toHaveLength(8);
  children.forEach((child, index) => {
    const childHeading = Math.atan2(child.vy, child.vx);
    const relative = Math.atan2(Math.sin(childHeading - parentHeading), Math.cos(childHeading - parentHeading));
    expect(relative).toBeCloseTo((-24 + index * 48 / 7) * degrees);
    expect(Math.cos(relative)).toBeGreaterThan(0);
    expect(child).toMatchObject({ damage: 5, radius: 2.75, maxTravel: 320, travelled: 0 });
    expect(child.behaviors.split).toBeUndefined();
  });
});
```

Add a focused helper in the same file and exercise base, Big Iron, and Hollow Point composition:

```ts
const pelletFor = (ids: readonly ("shotgun" | "bigIron" | "hollowPoint")[]) => {
  let game = createGame(() => 0.9);
  for (const id of ids) game = setArtifact(game, id, true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  return splitProjectile(game.projectiles[0]!, ["pellet"])[0]!;
};

test.each([
  [["shotgun"], 2.75, 5],
  [["shotgun", "bigIron"], 3.4375, 5],
  [["shotgun", "hollowPoint"], 2.75, 6.75],
] as const)("Shotgun scales the current parent for %o", (ids, radius, damage) => {
  const pellet = pelletFor(ids);
  expect(pellet.radius).toBeCloseTo(radius);
  expect(pellet.damage).toBeCloseTo(damage);
});
```

Replace the Halo plus Shotgun geometry test in `src/game/projectiles.test.ts` with:

```ts
test("Halo Shotgun launches a forward cone before resuming the fixed-origin spiral", () => {
  let game = setArtifact(setArtifact(createGame(() => 0.9), "haloChamber", true), "shotgun", true);
  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  const parent = game.projectiles[0]!;
  const children = splitProjectile(parent, Array.from({ length: 8 }, (_, index) => `pellet-${index}`));
  const parentHeading = Math.atan2(parent.vy, parent.vx);
  const relative = (heading: number) =>
    Math.atan2(Math.sin(heading - parentHeading), Math.cos(heading - parentHeading));

  expect(children.every((child) =>
    child.x === parent.x && child.y === parent.y && child.spiralOrigin === parent.spiralOrigin
  )).toBe(true);
  children.forEach((child, index) => {
    expect(relative(Math.atan2(child.vy, child.vx)))
      .toBeCloseTo((-24 + index * 48 / 7) * Math.PI / 180);
  });
  expect(new Set(children.map((child) => child.spiralAngularSpeed)).size).toBe(8);

  const advanced = children.map((child) => advanceTrajectory(child, [], 0.01));
  advanced.forEach((child, index) => {
    const dx = child.x - children[index]!.x;
    const dy = child.y - children[index]!.y;
    expect(relative(Math.atan2(dy, dx)))
      .toBeCloseTo((-24 + index * 48 / 7) * Math.PI / 180);
    expect(child.spiralOrigin).toBe(parent.spiralOrigin);
  });

  const continued = advanced.map((child) => advanceTrajectory(child, [], 0.01));
  expect(continued.every((child, index) =>
    child.spiralOrigin === parent.spiralOrigin && child.spiralRadius! > advanced[index]!.spiralRadius!
  )).toBe(true);
});
```

Replace the final expectations in the exact-distance simulation test with:

```ts
expect(game.projectiles.every((projectile) =>
  projectile.maxTravel === 320
    && projectile.damage === 5
    && projectile.radius === 2.75
    && projectile.behaviors.split === undefined
)).toBe(true);
expect(game.reload.ammo).toBe(5);
expect(game.metrics).toMatchObject({ triggers: 1, projectiles: 9 });

game = updateGame(game, idle, 129 / game.weapon.speed, game.time + 129 / game.weapon.speed);
expect(game.projectiles).toHaveLength(8);
expect(game.projectiles.every((projectile) => Math.abs(projectile.travelled - 129) < 1e-8)).toBe(true);
expect(game.metrics.misses).toBe(0);
```

Change `tests/lab.spec.ts` telemetry expectation to:

```ts
await expect(page.locator('[data-stat="split"]')).toHaveText(
  "160 px distance · 8 pellets · 320 px child range · 48° cone · 25% damage · 55% size",
);
```

- [ ] **Step 2: Run focused tests and confirm red**

Run:

```bash
bun test src/game/artifacts.test.ts src/game/weapon.test.ts src/game/projectiles.test.ts src/game/simulation.test.ts
bun run test:e2e --grep "catalog telemetry"
```

Expected: unit tests fail on missing fields, circular headings, old damage/radius/range, and Playwright fails on the old telemetry string.

- [ ] **Step 3: Extend the generic split effect and validation**

Use this exact six-field shape in both `ArtifactEffect` and `SplitBehavior`:

```ts
export type SplitBehavior = Readonly<{
  distance: number;
  count: number;
  childRange: number;
  damageScale: number;
  fanAngle: number;
  radiusScale: number;
}>;
```

Replace the Shotgun descriptor:

```ts
{ kind: "split", distance: 160, count: 8, childRange: 320,
  damageScale: 0.25, fanAngle: 48 * degrees, radiusScale: 0.55 }
```

Replace the split validation branch in `src/game/artifacts.ts`:

```ts
case "split":
  return positive(effect.distance)
    && Number.isInteger(effect.count)
    && positive(effect.count)
    && positive(effect.childRange)
    && probability(effect.damageScale)
    && positive(effect.fanAngle)
    && effect.fanAngle <= Math.PI * 2
    && probability(effect.radiusScale)
    ? []
    : [`${prefix}.split parameters must be finite and positive`];
```

- [ ] **Step 4: Implement cone headings and child radius scaling**

Inside `splitProjectile`, replace only the heading calculation and add the radius field:

```ts
const coneOffset = split.count === 1
  ? 0
  : -split.fanAngle / 2 + split.fanAngle * index / (split.count - 1);
const childHeading = heading + coneOffset;
```

```ts
return {
  ...parent,
  id,
  ...velocity,
  damage: parent.damage * split.damageScale,
  radius: parent.radius * split.radiusScale,
  behaviors: Object.freeze(inheritedBehaviors),
  hitTargetIds: [],
  everHit: false,
  travelled: 0,
  maxTravel: split.childRange,
  splitParentId: parent.id,
  splitOrigin,
  spiralAngularSpeed: angularSpeed,
  spiralLaunchPending: spiral ? true : undefined,
  homingTargetId: undefined,
  homingMarkerRemaining: 0,
};
```

The `count === 1` guard is required so a valid generic one-child split never divides by zero.

- [ ] **Step 5: Expose all split values in the lab**

Replace the split branch in `src/lab.ts`:

```ts
split: state.weapon.behaviors.split
  ? `${state.weapon.behaviors.split.distance} px distance · ${state.weapon.behaviors.split.count} pellets · ${state.weapon.behaviors.split.childRange} px child range · ${format.degrees(state.weapon.behaviors.split.fanAngle)} cone · ${format.percent(state.weapon.behaviors.split.damageScale)} damage · ${format.percent(state.weapon.behaviors.split.radiusScale)} size`
  : "OFF",
```

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
bun test src/game/artifacts.test.ts src/game/weapon.test.ts src/game/projectiles.test.ts src/game/simulation.test.ts
bun run test:e2e --grep "catalog telemetry"
bun test
bun run build
```

Expected: all commands pass.

- [ ] **Step 7: Commit the Shotgun redesign**

```bash
git add src/game/artifacts.ts src/game/artifacts.test.ts src/game/projectiles.ts src/game/projectiles.test.ts src/game/weapon.test.ts src/game/simulation.test.ts src/lab.ts tests/lab.spec.ts
git commit -m "fix: reshape Shotgun into a forward cone"
```

### Task 3: Track Presentation Events and Lock Dead-Player Intent

**Files:**
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`

**Interfaces:**
- Produces: top-level `GameState.lastShotAt`, `GameState.lastHurtAt`, and `GameState.diedAt`, each typed `number | null` and measured on the existing seconds-based simulation clock.
- Preserves: full world update after death; only player movement, firing, and manual reload intent are neutralized.

- [ ] **Step 1: Write failing timestamp and death-flow tests**

Add these tests to `src/game/simulation.test.ts`:

```ts
test("records presentation timestamps only for successful events", () => {
  let game = createGame(() => 0);
  expect(game).toMatchObject({ lastShotAt: null, lastHurtAt: null, diedAt: null });

  game = updateGame(game, { ...idle, firing: true }, 0, 1);
  expect(game.lastShotAt).toBe(1);
  game = updateGame(game, { ...idle, firing: true }, 0, 1.1);
  expect(game.lastShotAt).toBe(1);

  game = {
    ...game,
    player: { ...game.player, health: 10 },
    targets: [{
      id: "fatal-chaser", kind: "chaser", x: game.player.x + 30, y: game.player.y,
      radius: 18, health: 80, maxHealth: 80, speed: 0, frozenUntil: 0,
    }],
  };
  game = updateGame(game, idle, 0, 2);
  expect(game).toMatchObject({
    lastHurtAt: 2,
    diedAt: 2,
    player: { health: 0, vx: 0, vy: 0 },
  });

  game = updateGame(game, idle, 0, 3);
  expect(game).toMatchObject({ lastHurtAt: 2, diedAt: 2 });
});

test("dead player ignores intent while projectiles and targets keep updating", () => {
  let game = updateGame(createGame(() => 0), { ...idle, firing: true }, 0, 1);
  game = {
    ...game,
    player: { ...game.player, health: 10 },
    targets: [{
      id: "fatal-chaser", kind: "chaser", x: game.player.x + 30, y: game.player.y,
      radius: 18, health: 80, maxHealth: 80, speed: 0, frozenUntil: 0,
    }],
  };
  game = updateGame(game, idle, 0, 2);

  const position = { x: game.player.x, y: game.player.y };
  const ammo = game.reload.ammo;
  const projectileX = game.projectiles[0]!.x;
  game = updateGame(game, { ...idle, moveX: 1, firing: true, reloadPressed: true }, 0.1, 2.1);

  expect(game.player).toMatchObject({ ...position, health: 0, vx: 0, vy: 0 });
  expect(game.reload.ammo).toBe(ammo);
  expect(game.lastShotAt).toBe(1);
  expect(game.diedAt).toBe(2);
  expect(game.projectiles[0]!.x).not.toBe(projectileX);
});

test("reset clears death and presentation timestamps", () => {
  const base = createGame(() => 0);
  const game = resetLab({
    ...base,
    lastShotAt: 1,
    lastHurtAt: 2,
    diedAt: 3,
    player: { ...base.player, health: 0 },
  });
  expect(game).toMatchObject({
    lastShotAt: null,
    lastHurtAt: null,
    diedAt: null,
    player: { health: 100 },
  });
});
```

- [ ] **Step 2: Run the simulation test and confirm red**

Run: `bun test src/game/simulation.test.ts`

Expected: FAIL because the timestamp fields do not exist and a dead player can still act.

- [ ] **Step 3: Add timestamp state and neutralize only dead-player intent**

Extend `GameState` and `createGame`:

```ts
export type GameState = {
  // existing fields stay unchanged
  lastShotAt: number | null;
  lastHurtAt: number | null;
  diedAt: number | null;
};
```

```ts
lastShotAt: null,
lastHurtAt: null,
diedAt: null,
```

At the beginning of `updateGame`, after the existing pause guard, derive local event state and action permission:

```ts
let lastShotAt = state.lastShotAt;
let lastHurtAt = state.lastHurtAt;
let diedAt = state.diedAt;
const canAct = diedAt === null && state.player.health > 0;
```

Gate the existing manual reload branch with `canAct`. When deriving movement velocity, use `{ vx: 0, vy: 0 }` if `canAct` is false; otherwise keep the current normalized eight-direction acceleration logic. Gate the existing firing branch with `canAct` and set the timestamp only after the shot has produced projectile specs:

```ts
if (canAct && input.firing && !reload.reloading && reload.ammo > 0 && now >= nextShotAt) {
  // existing buildShot, projectile creation, ammo, metrics, cadence code
  if (shot.projectiles.length > 0) lastShotAt = now;
}
```

Guard contact damage with `diedAt === null`, then record the accepted hit and one-time death transition:

```ts
if (target.kind === "chaser" && diedAt === null && overlaps(player, target)
    && now >= player.invulnerableUntil) {
  const health = Math.max(0, player.health - 10);
  lastHurtAt = now;
  if (health === 0) diedAt = now;
  player = {
    ...player,
    health,
    vx: health === 0 ? 0 : player.vx,
    vy: health === 0 ? 0 : player.vy,
    invulnerableUntil: now + 0.5,
  };
  break;
}
```

Return `lastShotAt`, `lastHurtAt`, and `diedAt` in the final state. Do not early-return on death: target motion, existing projectile motion, collisions, Tesla links, metrics, expiry, and reload completion must continue.

- [ ] **Step 4: Run focused and full unit tests**

Run:

```bash
bun test src/game/simulation.test.ts
bun test
```

Expected: PASS.

- [ ] **Step 5: Commit presentation event state**

```bash
git add src/game/simulation.ts src/game/simulation.test.ts
git commit -m "feat: track Ralphy combat presentation state"
```

### Task 4: Select Deterministic Ralphy Atlas Poses

**Files:**
- Create: `src/game/presentation.ts`
- Create: `src/game/presentation.test.ts`

**Interfaces:**
- Consumes: `GameState` and its seconds-based timestamps.
- Produces: `Facing`, `AnimationState`, `AtlasFrame`, `RalphyPose`, `RALPHY_ATLAS`, and `selectRalphyPose(state, reducedMotion)`.

- [ ] **Step 1: Write failing table-driven pose tests**

Create `src/game/presentation.test.ts` with the exact state boundaries:

```ts
import { describe, expect, test } from "bun:test";
import { createGame } from "./simulation";
import { selectRalphyPose, validateRalphyAtlas } from "./presentation";

const at = (time: number) => ({ ...createGame(() => 0), time });

test.each([[0, 0], [0.449, 0], [0.45, 1], [0.9, 0]] as const)(
  "idle frame at %fs",
  (time, col) => expect(selectRalphyPose(at(time), false).frame).toMatchObject({ row: 0, col }),
);

test.each([[0, 0], [0.1, 1], [0.2, 2], [0.3, 3], [0.4, 0]] as const)(
  "move frame at %fs",
  (time, offset) => {
    const base = at(time);
    const state = { ...base, player: { ...base.player, vx: 1 } };
    expect(selectRalphyPose(state, false).frame).toMatchObject({ row: 1, col: offset });
  },
);

test("uses three authored views and mirrors only right", () => {
  const base = createGame(() => 0);
  const pose = (x: number, y: number) => selectRalphyPose({ ...base, aim: { x, y } }, false);
  expect(pose(base.player.x, 0)).toMatchObject({ facing: "up", frame: { col: 4 }, flipX: false });
  expect(pose(0, base.player.y)).toMatchObject({ facing: "left", frame: { col: 8 }, flipX: false });
  expect(pose(960, base.player.y)).toMatchObject({ facing: "right", frame: { col: 8 }, flipX: true });
});

test("honors fire reload hurt death boundaries and precedence", () => {
  const base = createGame(() => 0);
  const pose = (overrides: Partial<typeof base>, time: number) =>
    selectRalphyPose({ ...base, ...overrides, time }, false);

  expect(pose({ lastShotAt: 1 }, 1.059)).toMatchObject({ state: "fire", frame: { row: 2, col: 0 } });
  expect(pose({ lastShotAt: 1 }, 1.06)).toMatchObject({ state: "fire", frame: { row: 2, col: 1 } });
  expect(pose({ lastShotAt: 1 }, 1.16).state).toBe("idle");
  expect(pose({ lastHurtAt: 1 }, 1.179)).toMatchObject({ state: "hurt", frame: { row: 4 } });
  expect(pose({ lastHurtAt: 1 }, 1.18).state).toBe("idle");

  const reload = { ...base.reload, reloading: true, startedAt: 1, completesAt: 2.5 };
  expect(pose({ reload }, 1).frame).toMatchObject({ row: 3, col: 0 });
  expect(pose({ reload }, 1.5).frame).toMatchObject({ row: 3, col: 1 });
  expect(pose({ reload }, 2).frame).toMatchObject({ row: 3, col: 2 });

  const all = { reload, lastShotAt: 2, lastHurtAt: 2, diedAt: 2 };
  expect(pose(all, 2).state).toBe("death");
  expect(pose({ ...all, diedAt: null }, 2).state).toBe("hurt");
  expect(pose({ ...all, diedAt: null, lastHurtAt: null }, 2).state).toBe("reload");
});

test.each([[0, 0], [0.1, 1], [0.2, 2], [0.34, 3], [10, 3]] as const)(
  "death frame at age %fs",
  (age, col) => {
    const base = at(5 + age);
    expect(selectRalphyPose({ ...base, diedAt: 5 }, false).frame).toMatchObject({ row: 5, col });
  },
);

test("reduced motion freezes loops but retains essential states", () => {
  const base = at(0.55);
  const moving = { ...base, player: { ...base.player, vx: 1 } };
  expect(selectRalphyPose(moving, true).frame).toMatchObject({ row: 1, col: 0 });
  expect(selectRalphyPose({ ...base, lastShotAt: 0.5 }, true).state).toBe("fire");
});

test("pause suppresses move and every returned pose stays finite and in bounds", () => {
  const base = createGame(() => 0);
  const samples = [
    { ...base, time: 0.5 },
    { ...base, time: 0.5, player: { ...base.player, vx: 1 } },
    { ...base, time: 0.5, lastShotAt: 0.45 },
    { ...base, time: 0.5, reload: { ...base.reload, reloading: true, startedAt: 0, completesAt: 1.5 } },
    { ...base, time: 0.5, lastHurtAt: 0.45 },
    { ...base, time: 0.5, diedAt: 0 },
  ];
  expect(selectRalphyPose({ ...samples[1]!, paused: true }, false).state).toBe("idle");
  for (const state of samples) {
    const pose = selectRalphyPose(state, false);
    expect(pose.frame.col).toBeGreaterThanOrEqual(0);
    expect(pose.frame.col).toBeLessThan(12);
    expect(pose.frame.row).toBeGreaterThanOrEqual(0);
    expect(pose.frame.row).toBeLessThan(6);
    expect(pose.frame.durationMs).toBeGreaterThan(0);
    expect([pose.bodyRecoil, pose.gunRecoil, pose.gunSpin].every(Number.isFinite)).toBe(true);
  }
});

test("rejects nonfinite presentation clocks", () => {
  const base = createGame(() => 0);
  expect(() => selectRalphyPose({ ...base, time: Number.NaN }, false)).toThrow("time must be finite");
  expect(() => selectRalphyPose({ ...base, lastShotAt: Number.POSITIVE_INFINITY }, false))
    .toThrow("lastShotAt must be finite when present");
  expect(() => selectRalphyPose({ ...base, lastHurtAt: Number.NaN }, false))
    .toThrow("lastHurtAt must be finite when present");
  expect(() => selectRalphyPose({ ...base, diedAt: Number.NEGATIVE_INFINITY }, false))
    .toThrow("diedAt must be finite when present");
});

test("declared atlas clips are valid", () => {
  expect(validateRalphyAtlas()).toEqual([]);
});
```

- [ ] **Step 2: Run the new test and confirm red**

Run: `bun test src/game/presentation.test.ts`

Expected: FAIL with `Cannot find module './presentation'`.

- [ ] **Step 3: Implement one focused pure selector**

Create `src/game/presentation.ts` with these exported types and constants:

```ts
import type { GameState } from "./simulation";

export type Facing = "down" | "up" | "left" | "right";
export type AnimationState = "idle" | "move" | "fire" | "reload" | "hurt" | "death";
export type AtlasFrame = { col: number; row: number; durationMs: number };
export type RalphyPose = {
  state: AnimationState;
  facing: Facing;
  frame: AtlasFrame;
  flipX: boolean;
  bodyRecoil: number;
  gunRecoil: number;
  gunSpin: number;
};

export const RALPHY_ATLAS = {
  cellSize: 128,
  columns: 12,
  rows: 6,
  destinationSize: 80,
  anchorX: 64,
  anchorY: 74,
} as const;

const clips = {
  idle: { row: 0, durations: [450, 450], loop: true, held: false },
  move: { row: 1, durations: [100, 100, 100, 100], loop: true, held: false },
  fire: { row: 2, durations: [60, 100], loop: false, held: false },
  reload: { row: 3, durations: [500, 500, 500], loop: false, held: false },
  hurt: { row: 4, durations: [180], loop: false, held: false },
  death: { row: 5, durations: [100, 100, 140, 140], loop: false, held: true },
} as const;
```

Use direction bases `{ down: 0, up: 4, left: 8, right: 8 }`, dominant aim axis with vertical tie behavior, accumulated-duration indexing for idle/move/fire/death, clamped thirds for reload, and this exact precedence:

```ts
if (state.diedAt !== null) stateName = "death";
else if (state.lastHurtAt !== null && state.time - state.lastHurtAt < 0.18) stateName = "hurt";
else if (state.reload.reloading) stateName = "reload";
else if (state.lastShotAt !== null && state.time - state.lastShotAt < 0.16) stateName = "fire";
else if (!state.paused && Math.hypot(state.player.vx, state.player.vy) > 0) stateName = "move";
else stateName = "idle";
```

For death, always use universal columns `0–3`; otherwise add the direction base. Return these restrained deterministic transforms:

```ts
bodyRecoil: reducedMotion ? 0 : stateName === "fire" && frameIndex === 0 ? 3 : 0,
gunRecoil: reducedMotion ? 0 : stateName === "fire" ? (frameIndex === 0 ? 6 : 2) : 0,
gunSpin: reducedMotion ? 0 : stateName === "reload" ? progress * Math.PI * 2 : 0,
```

`validateRalphyAtlas()` must traverse `clips` and report errors for empty duration lists, nonpositive/nonfinite durations, rows outside `0–5`, direction-derived columns outside `0–11`, and any held clip other than the single death clip. `selectRalphyPose` must throw if `state.time` or any non-null presentation timestamp is nonfinite.

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
bun test src/game/presentation.test.ts
bun test
```

Expected: PASS.

- [ ] **Step 5: Commit the pure selector**

```bash
git add src/game/presentation.ts src/game/presentation.test.ts
git commit -m "feat: select deterministic Ralphy animation poses"
```

### Task 5: Generate and Pack the ImageGen Ralphy Combat Set

**Files:**
- Create: `scripts/build_ralphy_atlas.py`
- Create: `scripts/test_build_ralphy_atlas.py`
- Create: `public/assets/generated/ralphy/ralphy-atlas.png`
- Create: `public/assets/generated/ralphy/ghost-revolver.png`
- Create: `public/assets/generated/effects/soul-projectile.png`
- Create: `public/assets/generated/effects/muzzle-flash.png`
- Ignore: `tmp/imagegen/ralphy-reference.png`
- Ignore: `tmp/imagegen/ralphy-motion-source.png`
- Ignore: `tmp/imagegen/ralphy-motion-clean.png`
- Ignore: `tmp/imagegen/ralphy-actions-source.png`
- Ignore: `tmp/imagegen/ralphy-actions-clean.png`
- Ignore: `tmp/imagegen/ralphy-death-source.png`
- Ignore: `tmp/imagegen/ralphy-death-clean.png`
- Ignore: `tmp/imagegen/ralphy-weapon-effects-source.png`
- Ignore: `tmp/imagegen/ralphy-weapon-effects-clean.png`
- Ignore: `tmp/imagegen/ralphy-runtime-contact-sheet.png`

**Interfaces:**
- Consumes: built-in ImageGen PNG sheets plus `remove_chroma()` and `fit_square()` from `scripts/split_atlas.py`.
- Produces: `build_ralphy_atlas(motion, actions, death, output)`, `build_effect_sprites(source, revolver_out, projectile_out, muzzle_out)`, `validate_runtime_pack(...)`, and a CLI that writes all accepted runtime PNGs.

The exact source layouts are:

```text
Motion, 6 columns × 3 rows:
  each row is one view: down, up, side-left
  columns 0–1 idle; columns 2–5 move

Actions, 6 columns × 3 rows:
  each row is one view: down, up, side-left
  columns 0–1 fire; columns 2–4 reload; column 5 hurt

Death, 4 columns × 1 row:
  columns 0–3 universal death sequence

Weapon/effects, 3 columns × 1 row:
  ghost revolver; round soul projectile; muzzle flash
```

- [ ] **Step 1: Write failing synthetic atlas tests**

Create `scripts/test_build_ralphy_atlas.py` using `unittest`, Pillow, and temporary synthetic green-screen grids. Import the planned public functions and cover these exact cases:

```py
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main

from PIL import Image, ImageDraw

from build_ralphy_atlas import (
    build_effect_sprites,
    build_ralphy_atlas,
    validate_runtime_pack,
)


SOURCE_CELL = 64


def make_sheet(
    path: Path,
    cols: int,
    rows: int,
    filled: set[int],
    x_offsets: dict[int, int] | None = None,
) -> Path:
    image = Image.new("RGB", (cols * SOURCE_CELL, rows * SOURCE_CELL), "#00ff00")
    draw = ImageDraw.Draw(image)
    for index in filled:
        col, row = index % cols, index // cols
        left = col * SOURCE_CELL + (x_offsets or {}).get(index, 16)
        top = row * SOURCE_CELL + 12
        draw.rectangle((left, top, left + 15, top + 39), fill="#f5f5f4")
    image.save(path)
    return path


def atlas_cell(atlas: Image.Image, col: int, row: int) -> Image.Image:
    return atlas.crop((col * 128, row * 128, (col + 1) * 128, (row + 1) * 128))


def occupied_cell_count(atlas: Image.Image) -> int:
    return sum(
        atlas_cell(atlas, col, row).getchannel("A").getbbox() is not None
        for row in range(6)
        for col in range(12)
    )


def alpha_center_x(cell: Image.Image) -> float:
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        raise AssertionError("expected occupied atlas cell")
    return (bounds[0] + bounds[2]) / 2


class RalphyAtlasTests(TestCase):
    def test_builds_exact_fixed_cell_runtime_atlas(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(root / "motion.png", 6, 3, set(range(18)))
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)))
            death = make_sheet(root / "death.png", 4, 1, set(range(4)))
            output = root / "atlas.png"
            build_ralphy_atlas(motion, actions, death, output)
            atlas = Image.open(output)
            self.assertEqual(atlas.mode, "RGBA")
            self.assertEqual(atlas.size, (1536, 768))
            self.assertEqual(occupied_cell_count(atlas), 40)

    def test_preserves_one_transform_instead_of_recentering_frames(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(root / "motion.png", 6, 3, set(range(18)), {0: 4, 1: 36})
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)))
            death = make_sheet(root / "death.png", 4, 1, set(range(4)))
            output = root / "atlas.png"
            build_ralphy_atlas(motion, actions, death, output)
            atlas = Image.open(output)
            self.assertNotEqual(alpha_center_x(atlas_cell(atlas, 0, 0)), alpha_center_x(atlas_cell(atlas, 1, 0)))

    def test_extracts_three_square_effect_sprites(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = make_sheet(root / "effects.png", 3, 1, {0, 1, 2})
            outputs = [root / "gun.png", root / "soul.png", root / "flash.png"]
            build_effect_sprites(source, *outputs)
            self.assertTrue(all(Image.open(path).size == (128, 128) for path in outputs))

    def test_rejects_empty_required_frame(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            motion = make_sheet(root / "motion.png", 6, 3, set(range(1, 18)))
            actions = make_sheet(root / "actions.png", 6, 3, set(range(18)))
            death = make_sheet(root / "death.png", 4, 1, set(range(4)))
            with self.assertRaisesRegex(ValueError, "required frame is empty"):
                build_ralphy_atlas(motion, actions, death, root / "atlas.png")

    def test_validation_rejects_corners_and_green_spill(self) -> None:
        with TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = Image.new("RGBA", (1536, 768), (0, 0, 0, 0))
            atlas.putpixel((0, 0), (245, 245, 244, 255))
            corner = root / "corner.png"
            atlas.save(corner)
            self.assertIn("outer corners must be transparent", validate_runtime_pack(corner, ()))

            atlas.putpixel((0, 0), (0, 0, 0, 0))
            atlas.putpixel((64, 64), (0, 255, 0, 255))
            green = root / "green.png"
            atlas.save(green)
            self.assertIn("chroma green survived", validate_runtime_pack(green, ()))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the atlas test and confirm red**

Run: `uv run --with Pillow==12.2.0 scripts/test_build_ralphy_atlas.py`

Expected: FAIL because `build_ralphy_atlas.py` does not exist.

- [ ] **Step 3: Implement fixed-cell packing without per-frame alpha cropping**

Create `scripts/build_ralphy_atlas.py` with the same PEP 723 Pillow dependency header as `split_atlas.py`. Accept alpha-cleaned sheets from the installed ImageGen chroma helper; if a synthetic test fixture is still RGB, reuse `remove_chroma` once for that complete sheet. Implement these exact constants and mappings:

```py
CELL = 128
ATLAS_COLS = 12
ATLAS_ROWS = 6
VIEW_BASES = (0, 4, 8)

MOTION_IDLE = tuple((view, source_col, 0, base + source_col)
                    for view, base in enumerate(VIEW_BASES)
                    for source_col in range(2))
MOTION_MOVE = tuple((view, source_col + 2, 1, base + source_col)
                    for view, base in enumerate(VIEW_BASES)
                    for source_col in range(4))
ACTIONS_FIRE = tuple((view, source_col, 2, base + source_col)
                     for view, base in enumerate(VIEW_BASES)
                     for source_col in range(2))
ACTIONS_RELOAD = tuple((view, source_col + 2, 3, base + source_col)
                       for view, base in enumerate(VIEW_BASES)
                       for source_col in range(3))
ACTIONS_HURT = tuple((view, 5, 4, base)
                     for view, base in enumerate(VIEW_BASES))
```

Use one `grid_cell(sheet, col, row, cols, rows)` boundary calculation for all families. `normalize_body_cell` must resize the entire grid cell with nearest-neighbor sampling and one fixed source-coordinate transform; it must never call `getbbox()`, alpha-crop, or center based on the individual silhouette:

```py
def normalize_body_cell(cell: Image.Image) -> Image.Image:
    scale = min(CELL / cell.width, CELL / cell.height)
    width = max(1, round(cell.width * scale))
    height = max(1, round(cell.height * scale))
    resized = cell.resize((width, height), Image.Resampling.NEAREST)
    output = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    source_anchor_x = width / 2
    source_anchor_y = height * (74 / 128)
    output.alpha_composite(resized, (round(64 - source_anchor_x), round(74 - source_anchor_y)))
    return output
```

Pack motion idle/move, action fire/reload/hurt, and death row `5`, columns `0–3`, into a transparent `1536 × 768` atlas. Reject any required source cell whose alpha channel is empty after chroma removal. Use existing `fit_square` only for the three unrelated weapon/effect cells, where a shared animation baseline is irrelevant.

`validate_runtime_pack(atlas_path: Path, effect_paths: Sequence[Path]) -> list[str]` must return concrete errors for a non-`RGBA` atlas, wrong dimensions, nontransparent four outer corners, surviving pixels where `green > 110` and `green - max(red, blue) > 18`, empty required cells, nonempty unused cells, and effect sprites that are not `128 × 128 RGBA`. The CLI must accept:

```text
--motion
--actions
--death
--weapon-effects
--atlas-out
--revolver-out
--projectile-out
--muzzle-out
--contact-sheet-out
```

The contact sheet composites the atlas and three effect sprites over a dark checkerboard so visual inspection can reveal green fringe, clipping, scale drift, and empty cells.

- [ ] **Step 4: Run the synthetic tests and confirm green**

Run: `uv run --with Pillow==12.2.0 scripts/test_build_ralphy_atlas.py`

Expected: `Ran 5 tests` and `OK`.

- [ ] **Step 5: Render the canonical mascot reference and inspect all references**

Run:

```bash
rsvg-convert -w 1024 -h 1024 \
  /Users/maximovchinnikov/github/ralphy/ralphy-web/public/assets/ralphy-mascot.svg \
  -o tmp/imagegen/ralphy-reference.png
```

Use `view_image` on `tmp/imagegen/ralphy-reference.png`, `tmp/imagegen/ralphy-source.png`, `public/assets/generated/style-anchor.png`, and `public/assets/generated/room.png`. Treat them respectively as identity, current sprite continuity, pixel-art density/palette, and in-room readability references.

- [ ] **Step 6: Generate four coherent source families with built-in ImageGen**

Call the built-in ImageGen tool once per family. Use reference image paths rather than CLI fallback. Save each returned project-bound output from the tool's reported generated-image path into its exact `tmp/imagegen/*-source.png` destination before making the next call.

Motion prompt:

```text
Use case: stylized-concept
Asset type: browser-game pixel sprite animation source sheet
Input images: canonical mascot is the identity reference; current Ralphy sheet is continuity only; style anchor defines pixel density and palette; room defines 80px gameplay readability
Primary request: create one coherent animation sheet for the same original white chibi cowboy ghost Ralphy, without a weapon
Subject: large rounded ghost head, two vertical black eyes, small mitten-like ghost hands, scalloped floating tail, detailed cowboy hat with orange band; identical identity and proportions in every cell
Style/medium: crisp chunky noir pixel art, warm ivory body, near-black outline, restrained orange accent, no antialias blur
Composition/framing: exact 6-column by 3-row grid with generous clean gutters; row 1 down view, row 2 up view, row 3 side-left view; in every row columns 1-2 are subtle idle frames and columns 3-6 are a four-frame floating movement cycle; same scale and body baseline in every cell
Scene/backdrop: perfectly flat uniform #00ff00 chroma-key background
Constraints: character only; no gun; no projectile; no scenery; no shadows; no gradients; no green inside sprites; no text, letters, numbers, logo, or watermark; no copied Isaac anatomy or features
Avoid: merged cells, crop changes, camera changes, identity drift, different hats, different outline weights, mouths, legs
```

Actions prompt, additionally referencing the accepted motion sheet:

```text
Use case: identity-preserve
Asset type: browser-game pixel sprite action sheet
Input images: accepted motion sheet is the primary character anchor; canonical mascot is identity support; style anchor defines pixel density
Primary request: animate the exact same chibi Ralphy body for fire recoil, revolver reload hand motions, and taking damage; body sheet contains no gun
Style/medium: exactly the same chunky noir pixel art, palette, outline, body width, hat, scale, and baseline as the motion sheet
Composition/framing: exact 6-column by 3-row grid; row 1 down, row 2 up, row 3 side-left; in every row columns 1-2 are a two-frame fire recoil/recover, columns 3-5 are a three-frame reload hand sequence, column 6 is one hurt pose; generous clean gutters
Scene/backdrop: perfectly flat uniform #00ff00 chroma-key background
Constraints: preserve identity and grid order exactly; small hands may pose around an invisible separate gun; no actual gun, projectile, scenery, shadow, gradient, green inside sprites, text, logo, or watermark
Avoid: redesign, scale drift, baseline drift, merged cells, independent crops, mouth, legs
```

Death prompt, additionally referencing the accepted motion sheet:

```text
Use case: identity-preserve
Asset type: browser-game pixel sprite death strip
Input images: accepted motion sheet is the primary character anchor; canonical mascot is identity support; style anchor defines pixel density
Primary request: four readable sequential frames of the exact same chibi cowboy ghost losing form and settling into a final defeated ghostly puddle while keeping the hat recognizable
Style/medium: exactly the same chunky noir pixel art, warm ivory, near-black outline, restrained orange hat band
Composition/framing: exact 4-column by 1-row sequence, same scale and baseline, generous clean gutters, final frame suitable to hold indefinitely
Scene/backdrop: perfectly flat uniform #00ff00 chroma-key background
Constraints: no gore, gun, projectile, scenery, shadows, gradients, green inside sprites, text, logo, or watermark
Avoid: extra frames, merged cells, identity drift, realistic corpse, copied game character
```

Weapon/effects prompt, additionally referencing the accepted motion sheet and style anchor:

```text
Use case: stylized-concept
Asset type: browser-game pixel weapon and projectile source sheet
Input images: accepted Ralphy motion sheet defines scale and palette; style anchor defines pixel density
Primary request: three separate compatible game sprites: Ralphy's compact supernatural six-shot revolver, one round musket-like soul projectile, and one muzzle flash
Subject: short ivory-and-dark-iron revolver with oversized readable cylinder, orange chamber glow and handle pivot on its left; circular ivory soul ball with dark rim and restrained cyan supernatural glow; compact ivory-orange muzzle flash
Style/medium: crisp chunky noir pixel art matching Ralphy at 80px gameplay scale
Composition/framing: exact 3-column by 1-row grid in this order: revolver, soul projectile, muzzle flash; each centered with generous clean gutters and fully separated
Scene/backdrop: perfectly flat uniform #00ff00 chroma-key background
Constraints: weapon sheet contains no character body or hand; no elongated cartridge; no scenery, shadows, gradients, green inside sprites, text, logo, or watermark
Avoid: oversized long barrel, realistic modern handgun, merged objects, blur
```

Inspect every result with `view_image`. Regenerate only the affected family if cells merge, ordering is wrong, scale or baseline drifts, Ralphy identity changes, the silhouette is unreadable at `80 px`, or the chroma background is not flat enough to remove.

Remove chroma with the installed ImageGen helper before atlas packing:

```bash
python /Users/maximovchinnikov/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py --input tmp/imagegen/ralphy-motion-source.png --out tmp/imagegen/ralphy-motion-clean.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
python /Users/maximovchinnikov/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py --input tmp/imagegen/ralphy-actions-source.png --out tmp/imagegen/ralphy-actions-clean.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
python /Users/maximovchinnikov/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py --input tmp/imagegen/ralphy-death-source.png --out tmp/imagegen/ralphy-death-clean.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
python /Users/maximovchinnikov/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py --input tmp/imagegen/ralphy-weapon-effects-source.png --out tmp/imagegen/ralphy-weapon-effects-clean.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

Inspect the four cleaned PNGs with `view_image`. If a visible fringe remains, retry only that family once with `--edge-contract 1`; do not switch to CLI or another image model.

- [ ] **Step 7: Build, validate, and inspect the runtime pack**

Run:

```bash
uv run scripts/build_ralphy_atlas.py \
  --motion tmp/imagegen/ralphy-motion-clean.png \
  --actions tmp/imagegen/ralphy-actions-clean.png \
  --death tmp/imagegen/ralphy-death-clean.png \
  --weapon-effects tmp/imagegen/ralphy-weapon-effects-clean.png \
  --atlas-out public/assets/generated/ralphy/ralphy-atlas.png \
  --revolver-out public/assets/generated/ralphy/ghost-revolver.png \
  --projectile-out public/assets/generated/effects/soul-projectile.png \
  --muzzle-out public/assets/generated/effects/muzzle-flash.png \
  --contact-sheet-out tmp/imagegen/ralphy-runtime-contact-sheet.png
uv run --with Pillow==12.2.0 scripts/test_build_ralphy_atlas.py
```

Expected: the builder reports no validation errors and the test prints `OK`. Inspect `tmp/imagegen/ralphy-runtime-contact-sheet.png` with `view_image`; reject the pack for transparent-frame gaps, green fringe, jittering body scale/baseline, clipped hats/tails, unreadable gun/projectile, or wrong mapping.

- [ ] **Step 8: Commit only the reproducible tooling and accepted runtime PNGs**

```bash
git add scripts/build_ralphy_atlas.py scripts/test_build_ralphy_atlas.py \
  public/assets/generated/ralphy/ralphy-atlas.png \
  public/assets/generated/ralphy/ghost-revolver.png \
  public/assets/generated/effects/soul-projectile.png \
  public/assets/generated/effects/muzzle-flash.png
git commit -m "feat: add animated Ralphy ImageGen pack"
```

Do not stage ignored `tmp/imagegen/` sources.

### Task 6: Integrate the Atlas, Ghost Revolver, and Round Soul Projectile

**Files:**
- Create: `src/assets.test.ts`
- Modify: `src/assets.ts`
- Modify: `src/render.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `selectRalphyPose`, `RALPHY_ATLAS`, and the four accepted runtime PNGs from Task 5.
- Produces: required asset keys `ralphyAtlas`, `ghostRevolver`, `soulProjectile`, and `muzzleFlash`; `renderGame(context, state, assets, { reducedMotion })`.

- [ ] **Step 1: Write the failing manifest/preflight test**

Create `src/assets.test.ts`:

```ts
import { expect, test } from "bun:test";
import { ASSET_PATHS, REQUIRED_ASSET_KEYS } from "./assets";

test("requires the animated Ralphy combat pack and no static predecessors", async () => {
  expect(ASSET_PATHS).toMatchObject({
    ralphyAtlas: "/assets/generated/ralphy/ralphy-atlas.png",
    ghostRevolver: "/assets/generated/ralphy/ghost-revolver.png",
    soulProjectile: "/assets/generated/effects/soul-projectile.png",
    muzzleFlash: "/assets/generated/effects/muzzle-flash.png",
  });
  expect(REQUIRED_ASSET_KEYS).toEqual(Object.keys(ASSET_PATHS));

  const obsolete = [
    "revolver", "ralphyDown", "ralphyUp", "ralphyLeft", "ralphyRight",
    "ralphyDownMove", "ralphyUpMove", "ralphyLeftMove", "ralphyRightMove", "bullet",
  ];
  expect(obsolete.every((key) => !Object.hasOwn(ASSET_PATHS, key))).toBe(true);

  for (const path of Object.values(ASSET_PATHS).filter((path) =>
    path.includes("ralphy-atlas") || path.includes("ghost-revolver")
      || path.includes("soul-projectile") || path.includes("muzzle-flash"))) {
    expect(await Bun.file(`public${path}`).exists()).toBe(true);
  }
});
```

- [ ] **Step 2: Run the asset test and confirm red**

Run: `bun test src/assets.test.ts`

Expected: FAIL because the manifest still exposes static Ralphy, generic revolver, and elongated bullet keys.

- [ ] **Step 3: Replace the four runtime manifest families**

Remove these entries from `ASSET_PATHS`:

```text
revolver
ralphyDown
ralphyUp
ralphyLeft
ralphyRight
ralphyDownMove
ralphyUpMove
ralphyLeftMove
ralphyRightMove
bullet
```

Add:

```ts
ralphyAtlas: "/assets/generated/ralphy/ralphy-atlas.png",
ghostRevolver: "/assets/generated/ralphy/ghost-revolver.png",
soulProjectile: "/assets/generated/effects/soul-projectile.png",
muzzleFlash: "/assets/generated/effects/muzzle-flash.png",
```

Keep `REQUIRED_ASSET_KEYS = Object.keys(ASSET_PATHS) as AssetKey[]`; startup preflight therefore requires all four replacements without a second registry.

- [ ] **Step 4: Replace static body selection with fixed-cell atlas drawing**

In `src/render.ts`, import the selector and constants and reduce the options type:

```ts
import { RALPHY_ATLAS, selectRalphyPose, type RalphyPose } from "./game/presentation";

type RenderOptions = { reducedMotion: boolean };
```

Delete `ralphyKey`. Add one helper that uses the nine-argument `drawImage` overload and mirrors around the body anchor:

```ts
function drawRalphyFrame(
  context: CanvasRenderingContext2D,
  assets: Assets,
  pose: RalphyPose,
  x: number,
  y: number,
): void {
  const atlas = assets.images.ralphyAtlas;
  if (!atlas) return;
  const { cellSize, destinationSize, anchorX, anchorY } = RALPHY_ATLAS;
  context.save();
  context.translate(round(x), round(y));
  if (pose.flipX) context.scale(-1, 1);
  context.drawImage(
    atlas,
    pose.frame.col * cellSize,
    pose.frame.row * cellSize,
    cellSize,
    cellSize,
    round(-destinationSize * anchorX / cellSize),
    round(-destinationSize * anchorY / cellSize),
    destinationSize,
    destinationSize,
  );
  context.restore();
}
```

Replace `drawPlayer` with selector-driven body/gun presentation:

```ts
function drawPlayer(
  context: CanvasRenderingContext2D,
  state: GameState,
  assets: Assets,
  options: RenderOptions,
): void {
  const pose = selectRalphyPose(state, options.reducedMotion);
  const aim = Math.atan2(state.aim.y - state.player.y, state.aim.x - state.player.x);
  const bob = options.reducedMotion || pose.state !== "move"
    ? 0
    : Math.round(Math.sin(state.time * 14) * 2);
  const bodyX = state.player.x - Math.cos(aim) * pose.bodyRecoil;
  const bodyY = state.player.y + bob - Math.sin(aim) * pose.bodyRecoil;
  drawRalphyFrame(context, assets, pose, bodyX, bodyY);

  if (pose.state === "death") return;
  context.save();
  context.translate(round(bodyX), round(bodyY));
  context.rotate(aim + Math.sin(pose.gunSpin) * 0.08);
  imageAt(context, assets, "ghostRevolver", 9 - pose.gunRecoil, -32, 64);
  if (pose.state === "fire" && pose.frame.col % 4 === 0) {
    imageAt(context, assets, "muzzleFlash", 55 - pose.gunRecoil, -16, 32);
  }
  context.restore();
}
```

This keeps right-facing body mirroring separate from continuous cursor rotation. The dead pose intentionally hides the loose separate gun.

- [ ] **Step 5: Render the spectral trail directionally but the soul core unrotated**

Inside `drawProjectiles`, keep the existing radius-derived size. Replace the current rotated bullet branch with:

```ts
if (projectile.penetration) {
  context.save();
  context.translate(round(projectile.x), round(projectile.y));
  context.rotate(Math.atan2(projectile.vy, projectile.vx));
  imageAt(context, assets, "spectralTrail", -size * 1.8, -size / 2, size * 2.3, size);
  context.restore();
}
centeredImage(context, assets, "soulProjectile", projectile, size);
```

Do not rotate the circular core. `size = Math.max(10, projectile.radius * 4.2)` remains unchanged; a base Shotgun pellet renders at `2.75 × 4.2 = 11.55 px`, exactly `55%` of the normal `21 px` core.

- [ ] **Step 6: Remove the duplicate movement decision from the browser loop**

In `src/main.ts`, delete the local `moving` calculation and call:

```ts
renderGame(context, state, assets, { reducedMotion });
```

The pure selector now derives `move` from simulation velocity and pause state.

- [ ] **Step 7: Run focused tests and production build**

Run:

```bash
bun test src/assets.test.ts src/game/presentation.test.ts
bun run build
```

Expected: PASS; TypeScript reports no obsolete asset keys.

- [ ] **Step 8: Commit runtime integration**

```bash
git add src/assets.ts src/assets.test.ts src/render.ts src/main.ts
git commit -m "feat: render animated Ralphy combat assets"
```

### Task 7: Verify Runtime Assets, Animation Flows, and Final Visual Quality

**Files:**
- Modify: `tests/lab.spec.ts`
- Inspect only: `test-results/screenshots/ralphy-1440x900.png`
- Inspect only: `test-results/screenshots/ralphy-1024x768.png`

**Interfaces:**
- Consumes: browser resource requests, existing lab controls/telemetry, and Canvas 2D `drawImage` calls.
- Produces: deterministic E2E proof for new asset requests, atlas rows, right mirroring, muzzle/projectile rendering, reload, hurt, death hold, reset, and reduced motion.

- [ ] **Step 1: Update failing combat telemetry expectations**

In the existing `catalog telemetry` test, add the Tesla spread assertion and replace the split expectation:

```ts
await page.getByRole("button", { name: "Take Tesla Bullets" }).click();
await expect(page.locator('[data-stat="multishot"]')).toContainText("1.33×");
await expect(page.locator('[data-stat="spread"]')).toHaveText("8°");

await page.getByRole("button", { name: "Take Shotgun" }).click();
await expect(page.locator('[data-stat="split"]')).toHaveText(
  "160 px distance · 8 pellets · 320 px child range · 48° cone · 25% damage · 55% size",
);
```

- [ ] **Step 2: Add a failing resource-request regression**

Add this test before the combined-effect loop:

```ts
test("loads only the animated Ralphy combat pack", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/assets/generated/")) requests.push(path);
  });

  await page.goto("/");
  await expect(page.locator("#asset-diagnostics")).toContainText("All generated assets loaded");
  expect(requests).toEqual(expect.arrayContaining([
    "/assets/generated/ralphy/ralphy-atlas.png",
    "/assets/generated/ralphy/ghost-revolver.png",
    "/assets/generated/effects/soul-projectile.png",
    "/assets/generated/effects/muzzle-flash.png",
  ]));
  expect(requests.some((path) =>
    /\/ralphy\/(down|up|left|right)-(idle|move)\.png$/.test(path)
      || path.endsWith("/revolver.png")
      || path.endsWith("/effects/bullet.png"))).toBe(false);
});
```

- [ ] **Step 3: Add a failing Canvas animation probe**

Declare these test-side types:

```ts
type AnimationDraw = {
  path: string;
  col?: number;
  row?: number;
  a: number;
  b: number;
  c: number;
  d: number;
};
type AnimationProbe = { draws: AnimationDraw[] };
```

Add a reusable `installAnimationProbe(page)` helper whose init script patches `CanvasRenderingContext2D.prototype.drawImage` before the app loads:

```ts
async function installAnimationProbe(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: AnimationProbe = { draws: [] };
    (window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe = probe;
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      ...args: Parameters<typeof original>
    ) {
      const source = args[0];
      if (source instanceof HTMLImageElement && probe.draws.length < 20_000) {
        const path = new URL(source.currentSrc || source.src).pathname;
        const transform = this.getTransform();
        const draw: AnimationDraw = {
          path,
          a: transform.a,
          b: transform.b,
          c: transform.c,
          d: transform.d,
        };
        if (path.endsWith("/ralphy/ralphy-atlas.png") && args.length === 9) {
          draw.col = Number(args[1]) / 128;
          draw.row = Number(args[2]) / 128;
        }
        probe.draws.push(draw);
      }
      return Reflect.apply(original, this, args);
    } as typeof original;
  });
}
```

Add the normal-motion fire/reload test:

```ts
test("draws right-facing fire reload and round soul frames", async ({ page }) => {
  await installAnimationProbe(page);
  await page.goto("/");
  const canvas = page.locator("#game");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("game canvas is not visible");

  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();

  await expect.poll(async () => page.evaluate(() => {
    const probe = (window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe;
    return probe.draws.some(({ row }) => row === 2);
  })).toBe(true);

  await page.keyboard.press("r");
  await page.waitForTimeout(1_150);
  const draws = await page.evaluate(() =>
    (window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe.draws);
  const atlas = draws.filter(({ path }) => path.endsWith("/ralphy/ralphy-atlas.png"));
  expect(atlas.some(({ row, col, a }) => row === 2 && (col === 8 || col === 9) && a < 0)).toBe(true);
  expect(new Set(atlas.filter(({ row }) => row === 3).map(({ col }) => col)).toEqual(new Set([8, 9, 10]));
  expect(draws.some(({ path }) => path.endsWith("/muzzle-flash.png"))).toBe(true);
  expect(draws.some(({ path }) => path.endsWith("/soul-projectile.png"))).toBe(true);
  expect(draws.filter(({ path }) => path.endsWith("/soul-projectile.png"))
    .every(({ b, c }) => Math.abs(b) < 1e-10 && Math.abs(c) < 1e-10)).toBe(true);
});
```

- [ ] **Step 4: Add a failing browser death-and-reset regression**

Use the same probe and deterministic spawn order:

```ts
test("shows hurt then holds death until the laboratory resets", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await installAnimationProbe(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Spawn chaser" }).click();

  await page.keyboard.down("w");
  await page.keyboard.down("a");
  await expect(page.locator('[data-stat="health"]')).not.toHaveText("100/100", { timeout: 10_000 });
  await page.keyboard.up("w");
  await page.keyboard.up("a");
  await expect(page.locator('[data-stat="health"]')).toHaveText("0/100", { timeout: 10_000 });

  await page.waitForTimeout(500);
  let atlas = await page.evaluate(() =>
    (window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe.draws
      .filter(({ path }) => path.endsWith("/ralphy/ralphy-atlas.png")));
  expect(atlas.some(({ row }) => row === 4)).toBe(true);
  expect(new Set(atlas.filter(({ row }) => row === 5).map(({ col }) => col)).toEqual(new Set([0, 1, 2, 3]));
  expect(atlas.at(-1)).toMatchObject({ row: 5, col: 3 });

  const ammo = await page.locator('[data-stat="ammo"]').textContent();
  await page.keyboard.down("d");
  await page.mouse.down();
  await page.keyboard.press("r");
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.keyboard.up("d");
  await expect(page.locator('[data-stat="health"]')).toHaveText("0/100");
  await expect(page.locator('[data-stat="ammo"]')).toHaveText(ammo ?? "6/6");

  atlas = await page.evaluate(() =>
    (window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe.draws
      .filter(({ path }) => path.endsWith("/ralphy/ralphy-atlas.png")));
  expect(atlas.at(-1)).toMatchObject({ row: 5, col: 3 });

  await page.getByRole("button", { name: "Reset lab" }).click();
  await expect(page.locator('[data-stat="health"]')).toHaveText("100/100");
  await expect.poll(async () => page.evaluate(() => {
    const atlasDraws = (window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe.draws
      .filter(({ path }) => path.endsWith("/ralphy/ralphy-atlas.png"));
    return atlasDraws.at(-1)?.row;
  })).toBe(0);
});
```

- [ ] **Step 5: Run the focused browser tests and confirm red before integration, then green after Tasks 1–6**

Run:

```bash
bun run test:e2e --grep "catalog telemetry|animated Ralphy|right-facing|hurt then holds death"
```

Expected after Tasks 1–6: PASS. Before their implementation, the new tests fail on telemetry, missing assets, missing atlas rows, and unlocked death input.

- [ ] **Step 6: Extend reduced-motion coverage without weakening essential feedback**

Extend the existing `RenderProbe` and its `drawImage` patch:

```ts
type RenderProbe = {
  teslaOffsets: number[];
  impactDraws: number;
  atlasCells: { col: number; row: number }[];
  soulDraws: number;
};
```

Initialize the two new fields with `[]` and `0`, then record them beside the existing Tesla/impact branches:

```ts
if (path.endsWith("/ralphy/ralphy-atlas.png") && args.length === 9) {
  probe.atlasCells.push({ col: Number(args[1]) / 128, row: Number(args[2]) / 128 });
}
if (path.endsWith("/soul-projectile.png")) probe.soulDraws += 1;
```

Append these assertions inside the existing `if (reducedMotion)` branch, preserving its Tesla phase and disabled-impact assertions:

```ts
expect(probe.atlasCells.filter(({ row }) => row === 0 || row === 1)
  .every(({ col }) => col % 4 === 0)).toBe(true);
expect(probe.atlasCells.some(({ row }) => row === 2)).toBe(true);
expect(probe.soulDraws).toBeGreaterThan(0);
```

- [ ] **Step 7: Run complete automated verification**

Run:

```bash
uv run --with Pillow==12.2.0 scripts/test_build_ralphy_atlas.py
bun test
bun run build
bun run test:e2e
git diff --check
git status --short
```

Expected: atlas tests, all Bun tests, TypeScript/Vite production build, and every Playwright test pass; `git diff --check` prints nothing; status contains only the intended E2E test change before the final commit.

- [ ] **Step 8: Inspect fresh responsive screenshots**

The existing viewport tests write:

```text
test-results/screenshots/ralphy-1440x900.png
test-results/screenshots/ralphy-1024x768.png
```

Open both with `view_image`. Confirm Ralphy remains approximately one `64 px` tile tall inside the existing `80 × 80` destination, the body is crisp and grounded without frame jitter, the compact revolver aligns with his hand, the round soul projectile and smaller Shotgun pellets read clearly, and neither HUD nor independently scrolling lab is obscured. These ignored evidence files are not committed.

- [ ] **Step 9: Commit browser regressions**

```bash
git add tests/lab.spec.ts
git commit -m "test: cover Ralphy combat animations in browser"
```

### Final Review Gate

After Task 7, run the complete verification commands once more from a clean working tree, inspect both screenshots again, and request an independent whole-branch code review against `docs/superpowers/specs/2026-07-19-ralphy-arsenal-animation-redesign.md`. Fix every Critical or Important finding with a regression test, rerun the full gate, and leave the branch clean and ready for the user to play at `http://127.0.0.1:4173/`.
