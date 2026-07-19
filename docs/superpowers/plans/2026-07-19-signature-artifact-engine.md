# Signature Artifact Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eleven-item ad hoc weapon path with a deterministic compiled combat build, ordered six-slot cylinder, bounded generation-one scheduler, and provenance-aware phase backbone while preserving the current playable mechanics.

**Architecture:** Keep `simulation.ts` as the fixed-step orchestrator and move only four cohesive responsibilities into `combat-build.ts`, `cylinder.ts`, `trigger.ts`, and `combat-effects.ts`. The compiler emits five closed sorted rule lists; runtime owns explicit serializable state and resolves fixed phases without an ECS, event bus, scripting runtime, or handler registry.

**Tech Stack:** TypeScript 5.7, Bun test runner, Vite 6, Canvas 2D, Playwright 1.61.

## Global Constraints

- The catalog contains exactly `36` unique boolean-owned artifacts in a `6 × 6` row-major layout.
- All thirty-six artifacts may be active simultaneously; duplicate copies and numeric stacks do not exist.
- One root trigger consumes exactly one of six ordered cartridge slots.
- Generation is only `0` or `1`; generation-one projectiles inherit compatible motion/direct-status rules but never emission or kill-reactive rules.
- Trigger expansion is deterministic and creates at most `11` generation-zero projectiles.
- Static descendant validation rejects more than `384`; the approved all-artifact maximum is `294`.
- RNG order is `phase → effectId → projectileId → targetId` and is injectable.
- Keep the fixed `13 × 7` room, `1/120 s` fixed step, Isaac-style movement, automatic `1.5 s` reload, current controls, and current ImageGen art.
- Do not add dependencies, a framework, ECS, event bus, runtime scripting, or generalized plugin mechanism.
- Use TDD for every behavior and commit each task independently.

## File Structure

- Modify `src/game/artifacts.ts`: exact catalog metadata and per-artifact declarative rule definitions.
- Modify `src/game/artifacts.test.ts`: exact-36, grid, synergy, icon, uniqueness, and quality validation.
- Create `src/game/combat-build.ts`: five closed rule unions, compiler, stable ordering, numeric reducers, and bound validation.
- Create `src/game/combat-build.test.ts`: compiler invariance, validation, and descendant-bound tests.
- Create `src/game/cylinder.ts`: ordered slots, reload timing, Deadeye echo state, consume, and refund transitions.
- Create `src/game/cylinder.test.ts`: cylinder/reload/refund boundary tests.
- Delete `src/game/reload.ts` and `src/game/reload.test.ts` only after all callers and assertions use `cylinder.ts`.
- Create `src/game/trigger.ts`: root trigger context, stable IDs, scheduled volleys, and generation-zero expansion.
- Create `src/game/trigger.test.ts`: ordering, RNG, schedule, and maximum-count tests.
- Create `src/game/combat-effects.ts`: sorted combat-event queue, emission queue, area/VFX records, and phase reducers.
- Create `src/game/combat-effects.test.ts`: stable ordering, generation guard, provenance, and cleanup tests.
- Modify `src/game/projectiles.ts`: add root/lineage/generation and compiled motion descriptors while retaining geometry helpers.
- Modify `src/game/projectiles.test.ts`: inherited-rule and stable-motion regression coverage.
- Modify `src/game/weapon.ts` and `src/game/weapon.test.ts`: reduce only universal weapon values from `CombatBuild`.
- Modify `src/game/metrics.ts` and `src/game/metrics.test.ts`: five damage sources and complete provenance.
- Modify `src/game/simulation.ts` and `src/game/simulation.test.ts`: compile-on-loadout-change and fixed phase orchestration.
- Modify `src/game/presentation.ts`, `src/game/presentation.test.ts`, and `tests/lab.spec.ts`: close the three accepted animation/death review findings before engine migration.

---

### Task 1: Close the Accepted Animation and Death Regressions

**Files:**

- Modify: `src/game/presentation.ts`
- Modify: `src/game/presentation.test.ts`
- Modify: `tests/lab.spec.ts`

**Interfaces:**

- Consumes: current `selectRalphyPose(state, reducedMotion)` and `validateRalphyAtlas()`.
- Produces: direction-locked death pose, exact held-clip validation, and a non-vacuous post-death ammo regression.

- [ ] **Step 1: Write failing unit regressions**

Add assertions that death ignores aim mirroring and is the only held nonlooping clip:

```ts
test("death pose never mirrors when aim changes", () => {
  const base = createGame(() => 0);
  const dead = { ...base, diedAt: 1, time: 2, player: { ...base.player, health: 0 } };
  expect(selectRalphyPose({ ...dead, aim: { x: 0, y: dead.player.y } }, false).flipX).toBe(false);
  expect(selectRalphyPose({ ...dead, aim: { x: 999, y: dead.player.y } }, false).flipX).toBe(false);
});

test("death is the sole held nonlooping atlas clip", () => {
  expect(validateRalphyAtlas()).toEqual([]);
  expect(RALPHY_CLIPS.filter((clip) => clip.holdLast).map((clip) => clip.state)).toEqual(["death"]);
});
```

- [ ] **Step 2: Run the unit regression and confirm failure**

Run: `bun test src/game/presentation.test.ts`

Expected: FAIL because right-facing death currently returns `flipX: true`, and held-clip metadata is not exported/validated explicitly.

- [ ] **Step 3: Implement the minimal pose and atlas fixes**

Make death orientation stable without changing live facing rules:

```ts
const flipX = stateName === "death" ? false : facing === "right";
```

Represent clip holding as data and validate exactly one held clip:

```ts
export const RALPHY_CLIPS = [
  { state: "idle", loop: true, holdLast: false },
  { state: "move", loop: true, holdLast: false },
  { state: "fire", loop: false, holdLast: false },
  { state: "reload", loop: false, holdLast: false },
  { state: "hurt", loop: false, holdLast: false },
  { state: "death", loop: false, holdLast: true },
] as const;
```

- [ ] **Step 4: Make the browser death assertion non-vacuous**

In the existing hurt/death test, fire once before spawning/approaching the fatal chaser, wait for `5/6`, move the pointer to the canvas center after death, hold the mouse button, press `R`, and assert ammo remains `5/6`.

- [ ] **Step 5: Run focused and full tests**

Run:

```bash
bun test src/game/presentation.test.ts
bun run test:e2e --grep "shows hurt then holds death"
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/presentation.ts src/game/presentation.test.ts tests/lab.spec.ts
git commit -m "fix: close animation review findings"
```

---

### Task 2: Define the Exact Catalog and Compiled Combat Build

**Files:**

- Modify: `src/game/artifacts.ts`
- Modify: `src/game/artifacts.test.ts`
- Create: `src/game/combat-build.ts`
- Create: `src/game/combat-build.test.ts`
- Modify: `src/game/weapon.ts`
- Modify: `src/game/weapon.test.ts`
- Modify: `src/game/simulation.ts`

**Interfaces:**

- Produces: `ArtifactFamily`, `ArtifactDefinition`, `ARTIFACT_CATALOG`, `CombatBuild`, `compileCombatBuild(loadout)`, `validateCombatBuild(build)`, `setArtifactLoadout(state, loadout)`, and `deriveWeapon(build, fireRateBuff)`.
- Consumes: existing `ArtifactLoadout`, base weapon constants, and the exact design specification.

- [ ] **Step 1: Write failing catalog tests**

Add exact structure checks:

```ts
test("catalog is a complete six-by-six signature grid", () => {
  expect(ARTIFACT_CATALOG).toHaveLength(36);
  expect(new Set(ARTIFACT_CATALOG.map(({ id }) => id)).size).toBe(36);
  expect(new Set(ARTIFACT_CATALOG.map(({ grid }) => `${grid.row}:${grid.column}`)).size).toBe(36);
  expect(new Set(ARTIFACT_CATALOG.map(({ icon }) => icon)).size).toBe(36);
  for (let row = 1; row <= 6; row += 1)
    expect(ARTIFACT_CATALOG.filter((item) => item.grid.row === row)).toHaveLength(6);
  expect(validateArtifactCatalog(ARTIFACT_CATALOG)).toEqual([]);
});

test("every synergy points at a live artifact", () => {
  const ids = new Set(ARTIFACT_CATALOG.map(({ id }) => id));
  for (const artifact of ARTIFACT_CATALOG) {
    expect(artifact.synergies).toHaveLength(3);
    expect(artifact.synergies.every((id) => ids.has(id))).toBe(true);
  }
});
```

- [ ] **Step 2: Write failing compiler tests**

```ts
test("compiler emits stable provenance-sorted rule lists", () => {
  const loadout = { shotgun: true, teslaBullets: true, twinChamber: true } as const;
  const build = compileCombatBuild(loadout);
  expect(Object.keys(build)).toEqual(["triggers", "motions", "impacts", "emissions", "areas", "maxDescendants"]);
  for (const rules of [build.triggers, build.motions, build.impacts, build.emissions, build.areas]) {
    expect(rules).toEqual([...rules].sort((a, b) => a.phase - b.phase || a.effectId.localeCompare(b.effectId)));
    expect(rules.every((rule) => rule.artifactId && rule.effectId)).toBe(true);
  }
});

test("all-artifact build is permutation invariant and bounded", () => {
  const forward = Object.fromEntries(ARTIFACT_CATALOG.map(({ id }) => [id, true]));
  const reverse = Object.fromEntries([...ARTIFACT_CATALOG].reverse().map(({ id }) => [id, true]));
  expect(compileCombatBuild(reverse as ArtifactLoadout)).toEqual(compileCombatBuild(forward as ArtifactLoadout));
  expect(compileCombatBuild(forward as ArtifactLoadout).maxDescendants).toBe(294);
  expect(validateCombatBuild(compileCombatBuild(forward as ArtifactLoadout))).toEqual([]);
});
```

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `bun test src/game/artifacts.test.ts src/game/combat-build.test.ts src/game/weapon.test.ts`

Expected: FAIL because the catalog has eleven entries and `combat-build.ts` does not exist.

- [ ] **Step 4: Add exact metadata and rule types**

Define the UI metadata and five closed provenance-bearing unions:

```ts
export type ArtifactFamily = "trigger" | "motion" | "impact" | "status" | "relation" | "reactive";
export type ArtifactDefinition = Readonly<{
  id: string;
  name: string;
  description: string;
  icon: AssetKey;
  family: ArtifactFamily;
  grid: Readonly<{ row: 1 | 2 | 3 | 4 | 5 | 6; column: 1 | 2 | 3 | 4 | 5 | 6 }>;
  tags: readonly string[];
  synergies: readonly [string, string, string];
  rules: readonly ArtifactRule[];
}>;

type Provenance = Readonly<{ artifactId: ArtifactId; effectId: string; phase: number }>;
export type TriggerRule = Provenance & Readonly<{ family: "trigger"; kind: TriggerKind; params: Readonly<Record<string, number | boolean>> }>;
export type MotionRule = Provenance & Readonly<{ family: "motion"; kind: MotionKind; params: Readonly<Record<string, number | boolean>> }>;
export type ImpactRule = Provenance & Readonly<{ family: "impact"; kind: ImpactKind; params: Readonly<Record<string, number | boolean>> }>;
export type EmissionRule = Provenance & Readonly<{ family: "emission"; kind: EmissionKind; params: Readonly<Record<string, number | boolean>> }>;
export type AreaRule = Provenance & Readonly<{ family: "area"; kind: AreaKind; params: Readonly<Record<string, number | boolean>> }>;
export type ArtifactRule = TriggerRule | MotionRule | ImpactRule | EmissionRule | AreaRule;
```

Populate the exact thirty-six definitions in row-major order using the IDs from the specification. Every definition has at least one behavioral rule and three live synergy IDs.

- [ ] **Step 5: Implement the compiler and validator**

```ts
export type CombatBuild = Readonly<{
  triggers: readonly TriggerRule[];
  motions: readonly MotionRule[];
  impacts: readonly ImpactRule[];
  emissions: readonly EmissionRule[];
  areas: readonly AreaRule[];
  maxDescendants: number;
}>;

const stable = <T extends Provenance>(rules: readonly T[]): readonly T[] =>
  Object.freeze([...rules].sort((a, b) => a.phase - b.phase || a.effectId.localeCompare(b.effectId)));

export function compileCombatBuild(loadout: ArtifactLoadout): CombatBuild {
  const rules = getOwnedArtifacts(loadout).flatMap(({ rules }) => rules);
  return Object.freeze({
    triggers: stable(rules.filter((rule): rule is TriggerRule => rule.family === "trigger")),
    motions: stable(rules.filter((rule): rule is MotionRule => rule.family === "motion")),
    impacts: stable(rules.filter((rule): rule is ImpactRule => rule.family === "impact")),
    emissions: stable(rules.filter((rule): rule is EmissionRule => rule.family === "emission")),
    areas: stable(rules.filter((rule): rule is AreaRule => rule.family === "area")),
    maxDescendants: descendantBound(loadout),
  });
}
```

Validate catalog length, IDs, positions, row/family mapping, unique registered icons, three valid synergy references, nonempty behavioral rules, finite parameters, stable provenance, exclusive geometric motions, generation depth, area duration/rate, and the `384` cap.

- [ ] **Step 6: Compile only on loadout changes**

Add `build: CombatBuild` to `GameState`. Initialize once in `createGame`, replace once in `setArtifactLoadout`, and make `setArtifact` a one-ID wrapper around that batch function. Make `deriveWeapon` consume `build`; remove the per-fixed-step catalog walk. `Take all` and `Clear artifacts` will call `setArtifactLoadout` once.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
bun test src/game/artifacts.test.ts src/game/combat-build.test.ts src/game/weapon.test.ts src/game/simulation.test.ts
bun run build
```

Expected: PASS.

```bash
git add src/game/artifacts.ts src/game/artifacts.test.ts src/game/combat-build.ts src/game/combat-build.test.ts src/game/weapon.ts src/game/weapon.test.ts src/game/simulation.ts
git commit -m "feat: compile stable artifact combat rules"
```

---

### Task 3: Replace Numeric Ammo with the Ordered Cylinder

**Files:**

- Create: `src/game/cylinder.ts`
- Create: `src/game/cylinder.test.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`
- Modify: `src/game/presentation.ts`
- Modify: `src/hud.ts`
- Modify: `src/hud.test.ts`
- Delete: `src/game/reload.ts`
- Delete: `src/game/reload.test.ts`

**Interfaces:**

- Produces: `CylinderState`, `createCylinder`, `startReload`, `advanceReload`, `attemptActiveReload`, `consumeRound`, `refundRound`, `ammoCount`, and `fireRateBuffAt`.
- Consumes: `DerivedWeapon.capacity/reloadDuration/activeWindow/activeBuff/activeBuffDuration`.

- [ ] **Step 1: Write failing cylinder tests**

```ts
test("consumes ordered slots and ordinary refunds never restore echo", () => {
  const loading = startReload(emptyCylinder(), weapon, 0, "manual");
  const echoed = attemptActiveReload(loading, weapon, 0.75);
  const first = consumeRound(echoed);
  expect(first.round).toMatchObject({ slot: 0, echo: true, ammoBefore: 6 });
  const refunded = refundRound(first.state, "bonanzaClip", 1);
  expect(refunded.slots[0]).toEqual({ loaded: true, echo: false });
});

test("refund cancels manual or automatic reload unless full", () => {
  const partial = consumeRound(createCylinder(6)).state;
  const manual = startReload(partial, weapon, 1, "manual");
  expect(refundRound(manual, "recoilBoots", 1.1).reloading).toBe(false);
  const empty = Array.from({ length: 6 }).reduce((state) => consumeRound(state).state, createCylinder(6));
  const automatic = startReload(empty, weapon, 2, "automatic");
  expect(refundRound(automatic, "bonanzaClip", 2.1)).toMatchObject({ reloading: false, nextSlot: 5 });
});
```

Also cover full/partial reload, circular order, Last Bell after refunds, active-reload echo marks, full-capacity no-op, same-step automatic reload/refund, and stable dual refunds.

- [ ] **Step 2: Run and confirm failure**

Run: `bun test src/game/cylinder.test.ts src/game/reload.test.ts`

Expected: FAIL because `cylinder.ts` does not exist.

- [ ] **Step 3: Implement the closed cylinder state**

```ts
export type CylinderSlot = Readonly<{ loaded: boolean; echo: boolean }>;
export type CylinderState = Readonly<{
  slots: readonly [CylinderSlot, CylinderSlot, CylinderSlot, CylinderSlot, CylinderSlot, CylinderSlot];
  nextSlot: number;
  emptied: readonly number[];
  reloading: boolean;
  reloadKind: "manual" | "automatic" | null;
  startedAt: number;
  completesAt: number;
  sweetStart: number;
  sweetEnd: number;
  fireRateBuff: number;
  buffUntil: number;
}>;

export const ammoCount = (state: CylinderState): number =>
  state.slots.reduce((total, slot) => total + Number(slot.loaded), 0);

export type ConsumedRound = Readonly<{ slot: number; echo: boolean; ammoBefore: number }>;
export function consumeRound(state: CylinderState): Readonly<{ state: CylinderState; round: ConsumedRound | null }>;
export function refundRound(state: CylinderState, effectId: "bonanzaClip" | "recoilBoots", now: number): CylinderState;
```

Full reload writes six ordinary slots, resets `nextSlot = 0`, and applies six echo flags only on successful Deadeye timing. Refund selects the newest empty slot, writes `{ loaded: true, echo: false }`, and follows the exact cancellation/no-op ordering from the spec.

- [ ] **Step 4: Migrate simulation, presentation, and HUD**

Replace all `reload.ammo` reads with `ammoCount(state.cylinder)`, derive ammo tiles from ordered `slots`, and add a generated-asset key hook for the later echo overlay without creating temporary SVG/CSS art.

- [ ] **Step 5: Run tests and remove the old module**

Run:

```bash
bun test src/game/cylinder.test.ts src/game/simulation.test.ts src/game/presentation.test.ts src/hud.test.ts
rg 'from "./reload"|reload\.ammo' src
```

Expected: tests PASS and `rg` returns no matches. Then delete `reload.ts` and `reload.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/game/cylinder.ts src/game/cylinder.test.ts src/game/simulation.ts src/game/simulation.test.ts src/game/presentation.ts src/hud.ts src/hud.test.ts src/game/reload.ts src/game/reload.test.ts
git commit -m "feat: model ordered revolver cylinder"
```

---

### Task 4: Add Root Triggers, Stable Scheduling, and Provenance

**Files:**

- Create: `src/game/trigger.ts`
- Create: `src/game/trigger.test.ts`
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/metrics.ts`
- Modify: `src/game/metrics.test.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`

**Interfaces:**

- Produces: `TriggerContext`, `ScheduledProjectile`, `expandTrigger`, generation/root/lineage projectile fields, and complete `DamageEvent` provenance.
- Consumes: `CombatBuild`, `ConsumedRound`, `DerivedWeapon`, current aim/player position, and injected RNG.

- [ ] **Step 1: Write failing trigger/provenance tests**

```ts
test("one root consumes one RNG decision and emits stable identities", () => {
  let calls = 0;
  const result = expandTrigger(context({ rng: () => { calls += 1; return 0.1; } }));
  expect(calls).toBe(1);
  expect(result.rootTriggerId).toBe("trigger-7");
  expect(result.projectiles.every((shot) => shot.generation === 0 && shot.rootTriggerId === "trigger-7")).toBe(true);
  expect(new Set(result.projectiles.map(({ lineageId }) => lineageId)).size).toBe(result.projectiles.length);
});

test("damage provenance distinguishes all five source families", () => {
  const event: DamageEvent = {
    source: "area", damage: 4, time: 1, targetId: "dummy-1",
    artifactId: "ectoplasmSnare", effectId: "ectoplasmSnare.pool",
    rootTriggerId: "trigger-1", lineageId: "trigger-1:0", killReactionDepth: 0,
  };
  expect(recordDamage(createMetrics(), event).hitEvents[0]).toEqual(event);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `bun test src/game/trigger.test.ts src/game/projectiles.test.ts src/game/metrics.test.ts`

Expected: FAIL because trigger scheduling and expanded provenance do not exist.

- [ ] **Step 3: Add the trigger and projectile contracts**

```ts
export type TriggerContext = Readonly<{
  rootTriggerId: string;
  rootIndex: number;
  round: ConsumedRound;
  aim: number;
  origin: Point;
  now: number;
  stationaryCharged: boolean;
  lowHealth: boolean;
  build: CombatBuild;
  weapon: DerivedWeapon;
  rng: () => number;
}>;

export type ScheduledProjectile = Readonly<{
  at: number;
  generation: 0 | 1;
  rootTriggerId: string;
  lineageId: string;
  effectIds: readonly string[];
  spec: ProjectileSpec;
}>;
```

`expandTrigger` snapshots input once, consumes Tesla RNG once, returns stable row-1 scheduling order, and never consumes additional ammo. Add `generation`, `rootTriggerId`, `lineageId`, `activatedEffectIds`, and `originPower` to `ProjectileState`.

- [ ] **Step 4: Expand metric provenance without changing accuracy**

```ts
export type DamageSource = "direct" | "link" | "status" | "area" | "reactive";
export type DamageEvent = Readonly<{
  source: DamageSource;
  damage: number;
  time: number;
  targetId: string;
  artifactId: string;
  effectId: string;
  rootTriggerId: string;
  lineageId?: string;
  projectileId?: string;
  killReactionDepth: 0 | 1;
  originPower: number;
  x?: number;
  y?: number;
  firstProjectileHit?: boolean;
}>;
```

Only `source === "direct"` changes projectile accuracy. Use `artifactId: "baseRevolver"`, `effectId: "baseRevolver.direct"` for an unmodified base hit; artifact transforms replace or append their own provenance as declared. Prune the rolling three-second damage history without removing per-target totals.

- [ ] **Step 5: Integrate the scheduler in simulation**

Add `scheduledProjectiles` to `GameState`; phase 2 drains entries whose `at <= now`, materializes them, records projectile telemetry, and leaves later entries sorted by `at`, stable lineage ID, then effect ID.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
bun test src/game/trigger.test.ts src/game/projectiles.test.ts src/game/metrics.test.ts src/game/simulation.test.ts
bun run build
```

Expected: PASS with current gameplay preserved.

```bash
git add src/game/trigger.ts src/game/trigger.test.ts src/game/projectiles.ts src/game/projectiles.test.ts src/game/metrics.ts src/game/metrics.test.ts src/game/simulation.ts src/game/simulation.test.ts
git commit -m "feat: schedule provenance-aware root triggers"
```

---

### Task 5: Introduce the Fixed Combat-Event Backbone

**Files:**

- Create: `src/game/combat-effects.ts`
- Create: `src/game/combat-effects.test.ts`
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`

**Interfaces:**

- Produces: `CombatEvent`, `PendingEmission`, `AreaState`, `VfxCommand`, `sortCombatEvents`, `queueEmission`, and `resolveCombatPhases`.
- Consumes: swept collision candidates from `projectiles.ts`, compiled rules, scheduled projectiles, targets, and metrics.

- [ ] **Step 1: Write failing ordering and generation tests**

```ts
test("same-step events sort by time projectile target and kind", () => {
  const events = [
    impact("projectile-2", "target-b", 0.2, "target"),
    impact("projectile-1", "target-b", 0.2, "target"),
    impact("projectile-1", "target-a", 0.2, "wall"),
  ];
  expect(sortCombatEvents(events).map(({ projectileId, targetId, kind }) => [projectileId, targetId, kind])).toEqual([
    ["projectile-1", "target-a", "wall"],
    ["projectile-1", "target-b", "target"],
    ["projectile-2", "target-b", "target"],
  ]);
});

test("generation-one cannot queue another emission", () => {
  expect(() => queueEmission(generationOneProjectile(), emissionRule())).toThrow("generation-one projectile cannot emit");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test src/game/combat-effects.test.ts src/game/simulation.test.ts`

Expected: FAIL because `combat-effects.ts` does not exist.

- [ ] **Step 3: Add explicit bounded records**

```ts
export type CombatEvent = Readonly<{
  eventTime: number;
  kind: "prop" | "wall" | "target" | "distance" | "range" | "lifetime";
  projectileId: string;
  targetId?: string;
  point: Point;
}>;

export type PendingEmission = Readonly<{
  atStep: number;
  effectId: string;
  artifactId: string;
  rootTriggerId: string;
  lineageId: string;
  generation: 1;
  originPower: number;
  specs: readonly ProjectileSpec[];
}>;

export type AreaState = Readonly<{
  id: string;
  effectId: string;
  artifactId: string;
  rootTriggerId: string;
  instanceKey: string;
  bornAt: number;
  expiresAt: number;
  tickInterval: number;
}>;

export type VfxCommand = Readonly<{
  id: string;
  kind: string;
  artifactId: string;
  bornAt: number;
  expiresAt: number;
  x: number;
  y: number;
  targetId?: string;
}>;

export type CombatRuntime = Readonly<{
  projectiles: readonly ProjectileState[];
  targets: readonly TargetState[];
  scheduledProjectiles: readonly ScheduledProjectile[];
  pendingEmissions: readonly PendingEmission[];
  areas: readonly AreaState[];
  vfxCommands: readonly VfxCommand[];
  metrics: Metrics;
  nextId: number;
  step: number;
  now: number;
}>;
```

Reject non-finite records, generation over one, areas above three seconds/ten hertz, duplicate `effectId + rootTriggerId + instanceKey`, and kill reactions above depth one.

- [ ] **Step 4: Refactor `updateGame` into phase orchestration**

Keep player movement/contact in `simulation.ts`, but replace the monolithic projectile loop with these named phase calls:

```ts
const triggered = resolveTriggerPhase(runtime);
const moved = resolveMotionPhase(triggered);
const collided = collectCombatEvents(moved);
const impacted = resolveImpactPhase(collided);
const emitted = resolveEmissionPhase(impacted);
const updated = resolveAreaPhase(emitted);
const resolved = resolveKillAndCleanupPhase(updated);
```

Each function returns the next closed `CombatRuntime` record. Child emissions start on the following fixed step. Secondary damage cannot re-enter direct impact/emission and kill reactions stop at depth one.

- [ ] **Step 5: Prove current mechanics and cleanup still work**

Retain focused regressions for Halo, Ghost, Tesla, Shotgun, Spectral, Pinball, Coldcaster, Deadeye, movement, death, and reset. Add finite-state and expired schedule/area/VFX cleanup assertions.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
bun test src/game/combat-effects.test.ts src/game/projectiles.test.ts src/game/simulation.test.ts src/game/metrics.test.ts
bun test
bun run build
```

Expected: all tests PASS.

```bash
git add src/game/combat-effects.ts src/game/combat-effects.test.ts src/game/projectiles.ts src/game/projectiles.test.ts src/game/simulation.ts src/game/simulation.test.ts
git commit -m "feat: add deterministic combat phase backbone"
```

---

### Task 6: Foundation Verification and Independent Review

**Files:**

- Create: `src/game/foundation-stress.test.ts`
- Modify: any foundation file only when a regression test proves a review finding.

**Interfaces:**

- Consumes: completed Tasks 1–5.
- Produces: a stable foundation checkpoint for the mechanics and presentation plans.

- [ ] **Step 1: Add the deterministic foundation stress test**

Run ten simulated seconds at `1/120 s` with the currently migrated eleven artifacts, five dummies, five chasers, continuous fire, reload, and deterministic RNG. Normalize only the nonserializable RNG function before comparing two runs.

```ts
const normalize = ({ rng: _, ...state }: GameState) => JSON.parse(JSON.stringify(state));
expect(normalize(runScenario(rngSequence(0.1, 0.9)))).toEqual(normalize(runScenario(rngSequence(0.1, 0.9))));
expectFiniteTree(normalize(runScenario(() => 0.1)));
```

Assert bounded projectiles, schedules, areas, links, hit histories, VFX commands, and complete cleanup after firing stops.

- [ ] **Step 2: Run the full foundation gate**

```bash
bun test
uv run --with Pillow==12.2.0 scripts/test_build_ralphy_atlas.py
bun run build
bun run test:e2e
git diff --check
gitleaks detect --source . --no-banner --redact
```

Expected: `126` previous tests plus new tests PASS, atlas tests PASS, build PASS, browser suite PASS, no diff errors, and no leaks.

- [ ] **Step 3: Request independent review**

Review the branch against `docs/superpowers/specs/2026-07-19-36-signature-artifacts-design.md`, limited to the engine-foundation requirements. Fix Critical/Important findings only with a failing regression first.

- [ ] **Step 4: Commit any review regressions**

```bash
git add src/game
git commit -m "test: verify signature artifact engine foundation"
```
