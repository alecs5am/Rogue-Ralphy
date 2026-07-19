# Unique Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace numeric artifact stacks with eight unique owned/not-owned items while preserving all cross-artifact combinations.

**Architecture:** Weapon derivation consumes a boolean `ArtifactLoadout`; simulation owns that loadout and exposes one boolean setter. The laboratory projects ownership through one Take/Remove button per card, with no numeric controls or stack-only derived fields.

**Tech Stack:** TypeScript, Bun test runner, Canvas simulation, DOM/CSS, Playwright.

## Global Constraints

- Each artifact is either owned once or absent; duplicate copies are impossible.
- All eight different artifacts may be owned together.
- Fixed effects exactly match `2026-07-19-unique-artifacts-design.md`.
- One trigger consumes one round regardless of projectile count.
- Laboratory removal remains available; no pickup/run system is added.
- Remove stack-only code instead of retaining dormant caps, counters, or formulas.

---

### Task 1: Replace Stack Derivation and Simulation State With Ownership

**Files:**
- Modify: `src/game/weapon.test.ts`
- Modify: `src/game/weapon.ts`
- Modify: `src/game/reload.test.ts`
- Modify: `src/game/simulation.test.ts`
- Modify: `src/game/simulation.ts`

**Interfaces:**
- Produces: `ArtifactLoadout = Partial<Record<ArtifactId, true>>`, fixed `deriveWeapon(loadout, fireRateBuff)`, `buildShot()` without `orbitExtraCopies`, and `setArtifact(state, id, enabled: boolean)`.
- Consumes: existing `ArtifactId`, base weapon values, `fireRateBuff`, and immutable `GameState` updates.

- [ ] **Step 1: Write ownership tests before production changes**

Replace numeric-stack expectations with owned-state expectations, including:

```ts
const all: ArtifactLoadout = {
  twinChamber: true,
  bigIron: true,
  hollowPoint: true,
  coldcaster: true,
  pinball: true,
  deadeye: true,
  haloChamber: true,
  ghostSight: true,
};

test("derives the eight unique artifact effects", () => {
  expect(deriveWeapon(all, 0)).toMatchObject({
    projectileCount: 2,
    spread: 8 * Math.PI / 180,
    radius: 6.25,
    damage: 27,
    freezeChance: 0.25,
    freezeDuration: 1.05,
    bounces: 1,
    activeWindow: 0.12,
    activeBuff: 0.2,
    activeBuffDuration: 2.25,
    orbitDuration: 0.9,
    orbitRadius: 30,
    homingTurnRate: Math.PI,
    homingRadius: 40,
  });
});

test("rejects a legacy numeric artifact value", () => {
  expect(() => deriveWeapon({ twinChamber: 2 } as unknown as ArtifactLoadout, 0))
    .toThrow("twinChamber must be true when present");
});

test("taking an owned artifact again cannot strengthen it", () => {
  let game = setArtifact(createGame(() => 0), "hollowPoint", true);
  const damage = game.weapon.damage;
  game = setArtifact(game, "hollowPoint", true);
  expect(game.weapon.damage).toBe(damage);
  expect(game.artifacts).toEqual({ hollowPoint: true });

  game = setArtifact(game, "hollowPoint", false);
  expect(game.weapon.damage).toBe(20);
  expect(game.artifacts).toEqual({});
});
```

Migrate existing tests to boolean ownership. Update combined shots to two projectiles, damage `27`, one bounce, and no stack-derived orbital copies. Change reload fixtures to `{ deadeye: true }`.

- [ ] **Step 2: Run the core tests and verify RED**

Run: `bun test src/game/weapon.test.ts src/game/reload.test.ts src/game/simulation.test.ts`

Expected: FAIL because `ArtifactLoadout` does not exist, numeric formulas remain, and `setArtifact` still accepts counts.

- [ ] **Step 3: Implement the boolean core model**

Use this ownership shape and validation:

```ts
export type ArtifactLoadout = Partial<Record<ArtifactId, true>>;

function owns(loadout: ArtifactLoadout, id: ArtifactId): boolean {
  const value = loadout[id];
  if (value !== undefined && value !== true) throw new Error(`${id} must be true when present`);
  return value === true;
}
```

Derive each fixed value from `owns(...)`. Remove `ArtifactStacks`, numeric cap formulas, `orbitExtraCopies`, and `perShotProjectileSafetyBudget`. `buildShot` creates exactly `weapon.projectileCount` projectiles.

Implement simulation ownership with:

```ts
export function setArtifact(state: GameState, id: ArtifactId, enabled: boolean): GameState {
  const artifacts = { ...state.artifacts };
  if (enabled) artifacts[id] = true;
  else delete artifacts[id];
  return {
    ...state,
    artifacts,
    weapon: deriveWeapon(artifacts, fireRateBuffAt(state.reload, state.time)),
  };
}
```

Rename all core types/imports to `ArtifactLoadout`; do not add numeric compatibility overloads.

- [ ] **Step 4: Run the complete unit suite and build**

Run:

```bash
bun test
bun run build
```

Expected: every unit test passes and TypeScript build succeeds before commit.

- [ ] **Step 5: Commit the complete core migration**

```bash
git add src/game/weapon.ts src/game/weapon.test.ts src/game/reload.test.ts src/game/simulation.ts src/game/simulation.test.ts
git commit -m "refactor: make combat artifacts unique"
```

---

### Task 2: Replace Steppers With Take/Remove Controls

**Files:**
- Modify: `tests/lab.spec.ts`
- Modify: `src/lab.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `setArtifact(state, id, enabled)` from Task 1.
- Produces: one artifact toggle button per card, `Take all`, and `Clear artifacts` browser controls.

- [ ] **Step 1: Change the browser contract first**

Update Playwright interactions to use `Take Twin Chamber`, `Remove Twin Chamber`, and `Take all`. Add:

```ts
await page.getByRole("button", { name: "Take Twin Chamber" }).click();
await expect(page.getByRole("button", { name: "Remove Twin Chamber" })).toBeVisible();
await page.getByRole("button", { name: "Remove Twin Chamber" }).click();
await expect(page.getByRole("button", { name: "Take Twin Chamber" })).toBeVisible();
await expect(page.locator(".stepper, [data-count]")).toHaveCount(0);
```

The all-artifact browser path clicks `Take all`, expects eight active cards, then clicks `Clear artifacts` and expects zero active cards.

- [ ] **Step 2: Run browser tests and verify RED**

Run: `CI=1 bunx playwright test --grep "artifact|complete lab|loadout"`

Expected: FAIL because current controls are `Add`, `Remove`, numeric counters, and `Give all ×1`.

- [ ] **Step 3: Implement a single toggle per card**

In `src/lab.ts`, render fixed-effect copy and one button in each card. Store `{ card, button }` per artifact. On click:

```ts
const state = access.get();
access.set(setArtifact(state, artifact.id, !state.artifacts[artifact.id]));
```

During projection:

```ts
const owned = state.artifacts[artifact.id] === true;
control.card.classList.toggle("active", owned);
control.button.textContent = owned ? "Remove" : "Take";
control.button.setAttribute("aria-label", `${owned ? "Remove" : "Take"} ${artifact.name}`);
```

`Take all` sets each artifact to `true`; `Clear artifacts` sets each to `false`. Remove counter/stepper construction and their CSS rules. Style `.artifact-toggle` with the existing button language and full available card width.

- [ ] **Step 4: Run complete verification**

Run:

```bash
bun test
bun run build
CI=1 bun run test:e2e
bun audit
git diff --check
```

Expected: all unit tests and 4 browser tests PASS, build succeeds, audit is clean, and no numeric artifact control remains in either viewport screenshot.

- [ ] **Step 5: Commit laboratory controls**

```bash
git add src/lab.ts src/styles.css tests/lab.spec.ts
git commit -m "feat: toggle unique laboratory artifacts"
```
