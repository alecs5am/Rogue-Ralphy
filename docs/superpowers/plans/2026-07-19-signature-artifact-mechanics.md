# Thirty-Six Signature Artifact Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the exact signature behavior of all thirty-six artifacts on the compiled deterministic combat foundation, including every approved cross-artifact composition and the all-artifact bound.

**Architecture:** Add mechanics by the six catalog rows and keep each phase reducer pure and exhaustive. `trigger.ts` owns trigger/cylinder scheduling, `motions.ts` owns geometric motion, `emissions.ts` owns generation-one payload construction, `statuses.ts` owns target state, `areas.ts` owns relations/fields, and `reactive.ts` owns player/hurt/low-health behavior; `simulation.ts` only orchestrates their fixed order.

**Tech Stack:** TypeScript 5.7, Bun test runner, existing fixed-step simulation and Canvas-state records.

## Global Constraints

- Complete `docs/superpowers/plans/2026-07-19-signature-artifact-engine.md` first.
- Use the exact values, ordering, inheritance, and exceptions from `docs/superpowers/specs/2026-07-19-36-signature-artifacts-design.md`.
- Every artifact needs a deterministic signature test and at least two explicit composition assertions.
- No artifact may degrade into a stat-only effect.
- One Tesla Bernoulli decision is consumed per root trigger; Fan reuses it for all three volleys.
- Generation-one projectiles cannot emit, run kill-reactive rules, or create their own lineage.
- Secondary damage may invoke declared kill reactions once at `killReactionDepth: 1`; depth-one damage cannot invoke another.
- Same-step impacts sort by event time, projectile ID, target ID, and stable event-kind priority.
- No runtime truncation: all effects must fit the static `294 < 384` descendant contract.
- Use TDD and one independently reviewable commit per row.

## File Structure

- Modify `src/game/trigger.ts` and `src/game/trigger.test.ts`: Row 1 scheduling and Deadeye/Last Bell cylinder integration.
- Create `src/game/motions.ts` and `src/game/motions.test.ts`: Row 2 motion reducers.
- Create `src/game/emissions.ts`, `src/game/emissions.test.ts`, and `src/game/impacts.test.ts`: Row 3 impact/emission rules.
- Create `src/game/statuses.ts` and `src/game/statuses.test.ts`: Row 4 target states and status ticks.
- Create `src/game/areas.ts` and `src/game/areas.test.ts`: Row 5 links, fields, satellites, and shared spatial candidates.
- Create `src/game/reactive.ts` and `src/game/reactive.test.ts`: Row 6 player/reactive mechanics.
- Modify `src/game/combat-effects.ts`: delegate each fixed phase to the focused reducer without a generic registry.
- Modify `src/game/projectiles.ts`: carry the closed motion/status/lineage state required by the reducers.
- Modify `src/game/simulation.ts`: store explicit counters, areas, satellites, orbitals, recoil windows, decoy, and pending refunds.
- Modify `src/game/metrics.ts`: record every new source/provenance path.
- Create `src/game/composition.test.ts` and `src/game/stress.test.ts`: exact synergies and all-artifact deterministic stress.

---

### Task 1: Row 1 — Trigger and Cylinder Artifacts

**Files:**

- Modify: `src/game/trigger.ts`
- Modify: `src/game/trigger.test.ts`
- Modify: `src/game/cylinder.ts`
- Modify: `src/game/cylinder.test.ts`
- Modify: `src/game/weapon.ts`
- Modify: `src/game/weapon.test.ts`
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/combat-effects.ts`
- Modify: `src/game/simulation.ts`

**Interfaces:**

- Produces: Twin convergence metadata, Deadeye echo scheduling, Last Bell pulse metadata, Grave Echo, Fan scheduling, Dealer cadence, numeric schedule ordinals, and explicit emission provenance.
- Consumes: `TriggerContext`, neutral pre-arrangement projectile values, `CombatBuild.triggers`, ordered cylinder slots, wall-clock scheduler, area phase, and VFX commands.

- [ ] **Step 1: Write one failing signature test per artifact**

Use a shared exact trigger harness and assert this table:

```ts
const ROW_ONE = [
  ["twinChamber", { count: 2, headings: [0, 0], damage: 0.70, convergeMin: 96, convergeMax: 480 }],
  ["deadeye", { echoDelay: 0.12, echoDamage: 0.35, echoSlots: 6 }],
  ["lastBell", { ammoBefore: 1, speed: 0.45, radius: 1.60, damage: 1.50, rings: 3, interval: 0.25 }],
  ["graveEcho", { delay: 0.28, damage: 0.40 }],
  ["fanThePhantom", { delays: [0, 0.09, 0.18], centers: [-8, 0, 8], damage: 0.45 }],
  ["dealersCut", { cadence: 3, offsets: [-35, 35], damage: 0.55 }],
] as const;
```

Explicitly test that the Twin pair follows `±18 × sin(π × progress)`, Tesla adds one center shot at `0.70`, Last Bell selects lowest stable ID, Dealer applies only to the first Fan volley, and Deadeye/Grave copy the finished generation-zero values without copying a Locket orbital.

`TriggerContext` snapshots the muzzle-to-cursor distance in addition to the aim angle; clamp it once to `96–480 px` for Twin convergence. Tesla consumes exactly one `< 0.33` roll only when owned and reuses that result for every Fan volley; it consumes no RNG call when absent. With Twin, its pair shares the exact volley heading and Tesla is a center third. Without Twin, a successful Tesla proc creates the ordinary/Tesla pair at `−4°/+4°`; a failed proc leaves one center shot. Halo phase is separate motion metadata and never changes these headings.

Use numeric `rootIndex` and `localOrdinal` fields for schedule ordering; string lineage IDs remain provenance, not numeric sort keys. Create all nine chronological Fan logical shots first, then append Dealer `aim−35°` and `aim+35°` shots with ordinals `9/10` at first-volley time. Last Bell selects ordinal `0`; a due Locket selects the highest non-bell ordinal (`10` in the all-row case). Dealer's counter increments on accepted roots while owned, persists across reloads and dormant time, fires on transition to three, and resets only with a new laboratory run.

Do not feed already arranged `DerivedWeapon` values back through signature transforms. Add one neutral projectile-base snapshot containing unrelated accepted numeric/behavior traits before Twin, Tesla, Stillwater, Bell, Locket, and Big Iron arrangement transforms. Update legacy `buildShot`/weapon tests so the trigger reducer is the single owner of those multipliers; this prevents Big Iron radius and arrangement damage from being applied twice.

- [ ] **Step 2: Write the all-row expansion boundary test**

```ts
test("row-one composition launches eleven generation-zero projectiles for one cartridge", () => {
  const result = expandTrigger(triggerContext({
    owned: ["twinChamber", "deadeye", "lastBell", "graveEcho", "fanThePhantom", "dealersCut", "teslaBullets"],
    rootIndex: 3,
    ammoBefore: 2,
    rng: () => 0.1,
  }));
  expect(result.projectiles.filter(({ generation }) => generation === 0)).toHaveLength(11);
  expect(result.roundsConsumed).toBe(1);
  expect(result.projectiles.filter(({ generation }) => generation === 0).map(({ at }) => at - result.now)).toEqual([
    0, 0, 0, 0.09, 0.09, 0.09, 0.18, 0.18, 0.18, 0, 0,
  ]);
  expect(result.projectiles.filter(({ effectIds }) => effectIds.includes("graveEcho.copy")).map(({ at }) => at)).toContain(result.now + 0.28);
});
```

The `11` consists of three Fan volleys of a Twin pair plus one successful Tesla center (`9`) and exactly two Dealer shots on the first volley (`2`). The nine logical shots use `0.70 × 0.45 = 0.315` base damage; Dealer shots use `0.55` base and receive neither Twin nor Fan scale. The eleven are all scheduled generation-zero entries for one cartridge, even though only five are due at `t=0`.

Deadeye is governed by the consumed `round.echo` snapshot, not by current ownership after the cartridge was charged. For each generation-zero source, schedule Deadeye at `source.at + 0.12` and Grave Echo at `source.at + 0.28`; Fan therefore creates staggered echo batches rather than one collapsed root-time batch. Echoes are generation one, reuse the root and parent lineage, start at the original trigger origin/heading, copy the fully transformed generation-zero speed/radius/damage and compatible motion, penetration, direct-status, Tesla, and bounce traits, then apply only `0.35`/`0.40` damage. They carry no split/other emission payload and cannot copy a Locket orbital or create a fresh lineage. Refunds remain ordinary and cannot revoke an echo already queued.

Keep the effect that created a copy as explicit top-level emission provenance (`artifactId`/`effectId` or one equivalent closed record), separate from inherited `activatedEffectIds`. That list may describe compatible inherited behavior but cannot make generation one eligible to emit or run kill reactions.

- [ ] **Step 3: Run tests and confirm failure**

Run: `bun test src/game/trigger.test.ts src/game/cylinder.test.ts`

Expected: FAIL on the six unimplemented behaviors.

- [ ] **Step 4: Implement the exact expansion reducer**

Use the locked sequence:

```ts
const teslaProc = hasTesla && context.rng() < 0.33;
const logicalCount = hasTwin ? 2 + Number(teslaProc) : 1 + Number(teslaProc);
const fan = hasFan ? [
  { delay: 0, center: radians(-8) },
  { delay: 0.09, center: 0 },
  { delay: 0.18, center: radians(8) },
] : [{ delay: 0, center: 0 }];
```

Create logical-volley projectiles first, add Dealer side shots to the first volley only, apply Stillwater → Last Bell → Locket → Big Iron hooks, then snapshot Deadeye and Grave Echo. Store `dealerCounter`, Last Bell ring schedule, and echo-cartridge consumption explicitly.

Last Bell stores pulse state on the live bell rather than scheduling fake projectiles. Its area pulses occur at the bell's own materialized `bornAt + 0.25/0.50/0.75`, only while it is still alive; exact-time physical removal wins before the area phase. Each pulse uses `25%` of the bell's then-current damage, is secondary area damage, and cannot proc impacts. Locket uses explicit `armed/cadence` state: health above `40` resets it, a due bell-only trigger leaves it armed, and converting a projectile removes that source from Big Iron, Deadeye, and Grave snapshots.

- [ ] **Step 5: Run tests and commit**

```bash
bun test src/game/trigger.test.ts src/game/cylinder.test.ts src/game/weapon.test.ts src/game/projectiles.test.ts src/game/combat-effects.test.ts src/game/simulation.test.ts
git add src/game/trigger.ts src/game/trigger.test.ts src/game/cylinder.ts src/game/cylinder.test.ts src/game/weapon.ts src/game/weapon.test.ts src/game/projectiles.ts src/game/combat-effects.ts src/game/simulation.ts
git commit -m "feat: add signature trigger artifacts"
```

---

### Task 2: Row 2 — Motion Controllers

**Files:**

- Create: `src/game/motions.ts`
- Create: `src/game/motions.test.ts`
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/combat-effects.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`
- Modify: `src/game/trigger.ts`
- Modify: `src/game/trigger.test.ts`
- Modify: `src/game/combat-build.ts`
- Modify: `src/game/combat-build.test.ts`
- Modify: `src/game/metrics.ts`
- Modify: `src/game/metrics.test.ts`
- Modify: `src/game/simulation.test.ts`

**Interfaces:**

- Produces: `applyMotionRules(projectile, targets, dt, now)`, a canonical swept polyline, and exact converge, spiral, homing, relay, wave, return, and comet state.
- Consumes: compiled motion rules, Task-1 per-projectile motion seeds, stable projectile/target identifiers, Wanted Brand input, and a bounded lineage relay ledger.

- [ ] **Step 1: Write six failing signature tests**

```ts
const ROW_TWO = [
  ["haloChamber", { initialRadius: 24, radialSpeed: 48, angularSpeed: 3 * Math.PI, lifetime: 4 }],
  ["ghostSight", { acquireRadius: 96, turnRate: 3 * Math.PI }],
  ["pinball", { bounces: 1, retention: 0.90, relaySpeed: 1.35, relayRadius: 160 }],
  ["wailingLead", { amplitude: 22, wavelength: 144 }],
  ["undertakersReturn", { outbound: 240, inbound: 240, returnDamage: 0.65 }],
  ["cometSpur", { duration: 1, speed: 1.50, radius: 1.50, damage: 1.35 }],
] as const;
```

Test values immediately before and after `240 px`, ages `0/.5/1`, stable child wave phase, and swept collision against the visible sine curve.

Task 1 supplies explicit serializable seeds on each projectile: immutable `baseHeading`, optional Twin `converge: { side: -1 | 1, distance }`, separate `haloPhase`, and numeric `childIndex/childCount`. Never infer these values from lineage strings. Twin center/Dealer shots omit convergence. Progress uses monotonic actual path distance clamped to `[0, 1]`; its lateral offset permanently becomes zero after convergence. Halo phases use numeric `localOrdinal` order across sources sharing a volley time; echoes retain the source phase.

`MotionResult` returns an ordered polyline rather than one chord. Every subsegment records its endpoints, cumulative actual distance, and absolute normalized time within the fixed step. Motion collision, distance thresholds, later Wake/Crossfire paths, and rendering consume this same canonical path. Wailing Lead uses `22 × (sin(2πs/144 + phase) − sin(phase))`, generation-zero phase `0`, and stable generation-one sibling phase `2π × childIndex / childCount`; this keeps children at their emission point. Tessellate deterministically with no segment exceeding `π/8` wave-phase advance, and convert local segment hits back to full-step event time before Task-5 sorting.

- [ ] **Step 2: Write motion composition tests**

```ts
test("motion order is anchor spiral converge wave accelerate return homing sweep", () => {
  const result = applyMotionRules(projectileWithAllMotion(), targets, 1 / 120, 1);
  expect(result.trace).toEqual(["anchor", "spiral", "converge", "wave", "accelerate", "return", "homing", "sweep"]);
});

test("target reducers use Pinball then retained Ghost then Wanted and highest steering cap", () => {
  const result = selectMotionTarget(projectileWithRelayGhostAndBrand(), targets);
  expect(result).toMatchObject({ targetId: "relay", turnRate: 3 * Math.PI });
});
```

Keep Task-5 event order unchanged: tolerant full-step time → projectile ID → stable target/collider ID → semantic kind. Distance events carry an explicit motion/effect discriminator; a Shotgun distance removes/splits, while Undertaker's Return turns and survives.

Pinball relay state is lineage-wide runtime state, not a copied projectile boolean. The first successful wall or prop bounce marks the lineage consumed even when no relay target exists, applies the `1.35` speed multiplier once, emits one relay VFX, and selects the Euclidean-nearest live target within `160 px` of impact with stable-ID tie-breaking. Ordinary target ricochets do not activate relay. Store relay and Ghost locks separately: live relay wins, retained Ghost remains underneath, then Wanted Brand, then ordinary Ghost acquisition; a lost relay never reacquires. Wanted steering applies to generation zero only. Clear the bounded relay ledger when the root has no live/scheduled/pending/area/status references and on lab reset.

Every materialized generation-one child receives a fresh `bornAt = now`, age/travelled/leg distance `0`, empty target-hit histories and locks, and its explicit stable child motion seed. Shotgun starts at the exact split position, preserves Halo origin, takes one physical cone-launch step, then resynchronizes to the origin; echoes restart at the original trigger origin/heading with the source convergence side/distance and Halo phase. Children inherit compatible motion, penetration, direct-status, Tesla, and bounce state but never emission or kill-reactive eligibility.

- [ ] **Step 3: Run tests and confirm failure**

Run: `bun test src/game/motions.test.ts src/game/projectiles.test.ts`

Expected: FAIL because the new reducer and four new motions do not exist.

- [ ] **Step 4: Implement the closed motion reducer**

```ts
export function applyMotionRules(input: MotionInput): MotionResult {
  let state = applyAnchor(input);
  state = applySpiral(state);
  state = applyConvergence(state);
  state = applyWave(state);
  state = applyAccelerationAndReturn(state);
  state = applyHoming(state);
  return applySweptMovement(state);
}
```

Use actual travelled distance for thresholds, split outbound/return target-hit histories, and maximum applicable turn rate rather than additive caps. Pinball relay acceleration/acquisition occurs once per lineage even with extra bounces.

Comet Spur stores spawn baselines and applies non-compounding factors at `p = clamp((time - bornAt) / 1, 0, 1)`: speed/radius `1 + 0.5p`, damage `1 + 0.35p`. Advance factors by ratios so bounce/return retention persists, integrate the linear speed factor over the elapsed age interval, and interpolate radius/damage at exact hit time. A generation-one child treats its already-scaled materialized values as fresh baselines.

Undertaker's Return splits the motion step at exactly `240` actual swept-path pixels, scales current damage once by `0.65`, reverses the pre-homing base tangent, preserves remaining `dt`, keeps total travelled monotonic, resets leg distance, and expires after `240` inbound pixels. Tag path/events by leg and use separate outbound/return hit histories so Spectral may hit once per leg. Physical impact at the exact turn wins. Return replaces a parent's remaining Shotgun range with the full inbound budget (maximum total `480`); generation-one children with less than `240` residual range expire before returning.

Unsteered/unmodified Halo remains exactly `r = 24 + 48t`, `θ = phase + 3πt`, immutable origin, and `4 s` lifetime. Composed Homing/Comet may alter the live path without moving that origin. Ghost steering runs only after spiral/converge/wave/Comet/Return and resynchronizes polar state. A physical Pinball bounce removes only Halo spiral state and continues as ordinary reflected flight.

- [ ] **Step 5: Run tests and commit**

```bash
bun test src/game/motions.test.ts src/game/projectiles.test.ts src/game/combat-effects.test.ts src/game/simulation.test.ts
git add src/game/motions.ts src/game/motions.test.ts src/game/projectiles.ts src/game/projectiles.test.ts src/game/combat-effects.ts src/game/simulation.ts src/game/simulation.test.ts
git commit -m "feat: compose signature projectile motions"
```

---

### Task 3: Row 3 — Impact and Transformation

**Files:**

- Create: `src/game/emissions.ts`
- Create: `src/game/emissions.test.ts`
- Create: `src/game/impacts.test.ts`
- Modify: `src/game/combat-effects.ts`
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/metrics.ts`
- Modify: `src/game/metrics.test.ts`

**Interfaces:**

- Produces: `resolveImpactRules`, `buildGenerationOneEmission`, canonical target Hollow state, ordered `KillContext`, explicit creation provenance, and bounded once-history for Shotgun, Hollow Point, Bone Orchard, Grave Bloom, Soul Harvester, and Bootleg Mint.
- Consumes: already-sorted direct-impact events, generation/eligibility guards, Task-5 pending-emission queue, numeric projectile ordinals, and captured kill context.

- [ ] **Step 1: Write six failing signature tests**

```ts
const ROW_THREE = [
  ["shotgun", { distance: 160, count: 8, childRange: 320, cone: 48, damage: 0.25, radius: 0.55 }],
  ["hollowPoint", { storedDamage: 0.60, duration: 2, explosionRadius: 64 }],
  ["boneOrchard", { offsets: [-18, 0, 18], damage: 0.20, radius: 0.55, range: 160 }],
  ["graveBloom", { count: 6, damage: 0.18, radius: 0.45, range: 128 }],
  ["soulHarvester", { count: 2, damage: 0.35, acquireRadius: 240 }],
  ["bootlegMint", { tangent: 90, damage: 0.30, radius: 0.55, range: 160 }],
] as const;
```

Assert Hollow Point plants only on an uncharged direct target and detonates on the next direct hit; Bone/Mint fire once per lineage; Bloom fires only on natural expiry or the explicit Shotgun transformation; Harvester fires once per root and selects two distinct nearest targets.

Keep three concepts separate: inherited direct/motion/status eligibility (`activatedEffectIds`), the artifact/effect that created a child (`emission` provenance), and explicit `emittedEffectIds` once-history keyed by lineage or root. Generation-one projectiles retain creation provenance but have no emission or kill-reactive eligibility; the generation guard remains the hard backstop. Never infer once-history from metrics or from `activatedEffectIds`.

Task 3 introduces the minimal canonical target-effects record needed by Hollow Point; Task 4 extends the same record. A charge is `{ damage, expiresAt, rootTriggerId, lineageId?, projectileId?, originPower }`. At `expiresAt <= now` it is absent. For each already-sorted direct hit, apply ordinary direct damage, then plant `60%` of current pre-impact damage on an uncharged live target or consume/detonate an existing live charge in a `64 px` secondary area payload. The explosion resolves even if the second direct hit kills the target; secondary damage never plants or consumes a charge.

Capture an immutable ordered `KillContext` at the first damage event that crosses health to dead, before removal: victim ID/position, source family, generation/reactive eligibility, full root/lineage/projectile/effect provenance, current origin power, and kill depth. Kill reactions consume these contexts directly. Soul Harvester activates only once per `effectId + rootTriggerId`, rejects generation one and depth one, and never reconstructs context from pruned metrics.

- [ ] **Step 2: Write generation and special-composition tests**

```ts
test("Shotgun preserves Bloom and Dustline pending tokens", () => {
  const split = resolveDistanceEvent(allArtifactParentAt(160));
  expect(split.children.filter(({ sourceEffectId }) => sourceEffectId === "shotgun.split")).toHaveLength(8);
  expect(split.children.filter(({ sourceEffectId }) => sourceEffectId === "graveBloom.expiry")).toHaveLength(6);
  expect(split.pending.some(({ effectId, distance }) => effectId === "dustlineDuel.afterimage" && distance === 32)).toBe(true);
});

test("generation-one children inherit no emission rules", () => {
  const child = materializeEmission(boneEmission(), 2)[0]!;
  expect(child.generation).toBe(1);
  expect(child.rules.emissions).toEqual([]);
  expect(resolveImpactRules(childImpact(child))).toMatchObject({ emissions: [] });
});
```

Every direct event uses the projectile's current pre-impact damage (after Comet/bounce retention) as `originPower`. Generation-zero base direct hits keep base provenance unless explicitly transformed; a generation-one direct hit uses its creation effect provenance. Only direct contact changes that projectile's accuracy. Explosion/link/status/area/reactive descendants retain the originating direct `originPower` rather than replacing it with scaled damage.

For damage derived from two projectiles (Tesla/Crossfire), the lower-current-damage projectile owns root/lineage/origin provenance; ties use the lower stable projectile ID. Crossfire remains secondary and generation-zero-only. Task 3 consumes Task-5's existing event order without re-sorting: tolerant time → projectile ID → stable target/collider ID → semantic kind.

Every child starts with fresh empty target-hit histories; Spectral does not copy a parent's prior targets. Undertaker's Return uses Task-2's separate outbound/inbound histories, while Bone/Mint once-history remains lineage-wide so a return hit/bounce cannot emit twice.

- [ ] **Step 3: Run tests and confirm failure**

Run: `bun test src/game/impacts.test.ts src/game/emissions.test.ts`

Expected: FAIL because row-three impact/emission handlers do not exist.

- [ ] **Step 4: Implement queued generation-one emissions**

```ts
export function buildGenerationOneEmission(source: ProjectileState, rule: EmissionRule, specs: readonly ProjectileSpec[]): PendingEmission {
  if (source.generation !== 0) throw new Error("generation-one projectile cannot emit");
  if (!source.activatedEffectIds.includes(rule.effectId)) throw new Error(`${rule.effectId} is not eligible`);
  if (source.emittedEffectIds.includes(rule.effectId)) throw new Error(`${rule.effectId} already emitted for lineage`);
  return {
    atStep: source.step + 1,
    artifactId: rule.artifactId,
    effectId: rule.effectId,
    rootTriggerId: source.rootTriggerId,
    lineageId: source.lineageId,
    generation: 1,
    originPower: source.originPower,
    specs,
  };
}
```

Implement the exact cone/radial/tangent headings and source percentages. Queue children for the next fixed step; never materialize recursively inside the impact loop.

Allocate immutable child stable IDs/ordinals at queue time, not materialization time. Each pending child carries exact origin, heading/spec, source artifact/effect, root/lineage, inherited non-emission traits, and finite origin power. Sort by `atStep`, root/lineage, rule phase/effect, then numeric child ordinal. Validate exact counts and the per-root descendant bound; never truncate. Clean root/lineage once-history only when no live/scheduled/pending/status/area record can reference it.

Bootleg Mint queues only after a successful wall/prop bounce, after spending one bounce and applying retention/Pinball relay. Snapshot post-bounce damage/speed/radius/remaining-bounce at the collision point, rotate the reflected heading by `+90°` for even numeric local ordinal and `−90°` for odd, then apply `0.30` damage, `0.55` radius, and `160 px` range. Mark lineage history before settling. Target ricochets do not mint; generation-one copies may retain remaining bounces but never mint again.

At Shotgun split, remove and record the parent but create no live child in that call. Queue separate Shotgun `8` and Grave Bloom `6` descriptors for `step + 1`; Bloom fires here exactly once and never again as range/lifetime. Preserve one parent-owned Dustline token for Task 6's delayed afterimage. Shotgun pellets are not emitters. Bone uses the same queue seam for three `−18/0/+18°` children on the first direct hit per lineage.

Soul Harvester excludes the victim, selects live targets within inclusive `240 px` by squared distance then stable target ID, and queues exactly two spirits. Targets are distinct; an unmatched spirit still spawns unbound rather than silently reducing descendant count or telemetry.

- [ ] **Step 5: Run tests and commit**

```bash
bun test src/game/impacts.test.ts src/game/emissions.test.ts src/game/projectiles.test.ts src/game/combat-effects.test.ts src/game/metrics.test.ts src/game/simulation.test.ts
git add src/game/emissions.ts src/game/emissions.test.ts src/game/impacts.test.ts src/game/combat-effects.ts src/game/projectiles.ts src/game/simulation.ts src/game/metrics.ts src/game/metrics.test.ts
git commit -m "feat: resolve bounded impact emissions"
```

---

### Task 4: Row 4 — Target State and Statuses

**Files:**

- Create: `src/game/statuses.ts`
- Create: `src/game/statuses.test.ts`
- Modify: `src/game/combat-effects.ts`
- Modify: `src/game/combat-effects.test.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`
- Modify: `src/game/metrics.ts`
- Modify: `src/game/metrics.test.ts`
- Modify: `src/game/motions.ts`
- Modify: `src/game/motions.test.ts`
- Modify: `src/game/combat-build.ts`
- Modify: `src/game/combat-build.test.ts`

**Interfaces:**

- Produces: the canonical extended `TargetEffects`, `applyDirectStatuses`, `advanceStatuses`, one global Wanted Brand, Snare areas, ordered kill reactions, `selectBrandTarget`, and bounded status VFX commands.
- Consumes: Task-3 sorted direct impacts and `KillContext`, source provenance/eligibility, area damage, fixed time, and Task-2 steering input.

- [ ] **Step 1: Write six failing signature tests**

```ts
const ROW_FOUR = [
  ["coldcaster", { stacks: 3, stackDuration: 2, freeze: 1.05, shards: 4, shardDamage: 0.15, shardRadius: 0.45, shardRange: 128 }],
  ["cinderGospel", { ticks: 4, interval: 0.4, damage: 0.10, deathRadius: 64, deathDamage: 0.20 }],
  ["wantedBrand", { duration: 3, steer: 2 * Math.PI / 3, jumpRadius: 240 }],
  ["widowsLedger", { hits: 5, duration: 2, lineDamage: 1.20 }],
  ["ectoplasmSnare", { radius: 40, duration: 1.5, tickRate: 10, tickDamage: 0.04, slow: 0.50 }],
  ["hexBell", { cadence: 4, radius: 80, slow: 0.60, slowDuration: 1 }],
] as const;
```

Cover exact deadlines, stronger-burn refresh preserving an earlier next tick, generation-one completing freeze without shatter, generation-zero consuming freeze, brand nonreplacement/jump, fifth Ledger notch, root-scoped Snare, and Hex allow/exclusion lists.

Deadlines are active only while `now < deadline`; at equality they expire. Periodic work is due at `nextTickAt <= now`. Direct status reducers run in catalog phase order `Hollow 20 → Chill 30 → Burn 31 → Brand 32 → Ledger 33 → Snare 34 → Hex 35`; Hex therefore observes the source target's post-hit chill/burn. Phase-5 reapplication precedes phase-7 ticks. Drain every crossed burn/pool tick at its scheduled timestamp, globally sorted by timestamp then stable effect/root/target identity. A newly applied burn starts at `now + 0.4`; Snare starts at `now + 0.1` and its terminal tick at `expiresAt` is resolved before pruning to produce exactly fifteen ticks.

Coldcaster is deterministic: remove the legacy `0.25` freeze chance and consume no freeze RNG. The third chill stack freezes without shattering. Only a later generation-zero direct hit on an already frozen target consumes it, queues four next-step shards, and still applies that hit's ordinary new chill stack. Generation-one direct hits may add chill and complete a freeze but cannot consume it or emit shards.

Generation zero and one may apply inherited direct chill, burn, Brand, Ledger, Snare-first-hit, and Hex cadence. Only generation zero may steer through Brand, consume freeze, or queue shatter. Generation-one kill contexts are never reactive-eligible for Cinder even at depth zero; keep generation/reactive eligibility separate from `killReactionDepth`.

- [ ] **Step 2: Write simultaneous-order and slow-composition tests**

```ts
test("same-tick Twin hits deterministically plant then detonate Hollow and advance status counters", () => {
  const result = resolveSortedImpacts([hit("projectile-2"), hit("projectile-1")]);
  expect(result.order).toEqual(["projectile-1", "projectile-2"]);
  expect(result.target.hollowPoint).toBeUndefined();
  expect(result.target.chill.count).toBe(2);
});

test("overlapping slows choose the smallest multiplier", () => {
  expect(effectiveSlow([{ multiplier: 0.6, until: 2 }, { multiplier: 0.5, until: 3 }], 1)).toBe(0.5);
});
```

Keep exactly one runtime Wanted Brand `{ targetId, expiresAt }`, one global Hex counter, root-scoped Snare creation history, and per-`effectId + rootTriggerId` kill-reaction history. Brand is not duplicated in target effects. It persists through phase 8 even when its target dies earlier in the step, then jumps from the death position to the nearest live target at inclusive `240 px` by distance and stable ID while preserving expiry. Motion priority remains relay → retained Ghost → Brand → ordinary Ghost, using the highest steering cap.

Apply direct statuses to a target even when that hit is lethal, then capture/remove it in phase 8. A Cinder hit may therefore create a burn-backed ring and a lethal Brand hit may jump. Record each target kill once. Cinder reacts once per eligible `effectId + rootTriggerId`, uses the victim burn's stored origin power, creates `source: "reactive"` depth-one damage, and cannot recursively trigger Cinder/Harvester/Bonanza. Prune root activation history only when no live/scheduled/pending/projectile/area/status record references it.

- [ ] **Step 3: Run tests and confirm failure**

Run: `bun test src/game/statuses.test.ts src/game/metrics.test.ts`

Expected: FAIL because target-effect reducers do not exist.

- [ ] **Step 4: Implement closed target state and ticks**

```ts
export type TargetEffects = Readonly<{
  chill: Readonly<{ count: 0 | 1 | 2; expiresAt: number }>;
  frozenUntil: number;
  burn?: Readonly<{
    potency: number; remainingTicks: number; nextTickAt: number; originPower: number;
    rootTriggerId: string; lineageId?: string; projectileId?: string; reactiveEligible: boolean;
  }>;
  hollowPoint?: TargetHollowPoint;
  ledger: Readonly<{ count: number; expiresAt: number }>;
  slows: readonly Readonly<{ effectId: string; multiplier: number; until: number }>[];
}>;
```

Status damage records `source: "status"`; pools/lines/rings record `area` or `reactive`. Apply kill reactions in phase 8 once per `effectId/rootTriggerId` and mark their damage depth one.

Store full provenance on burn and Snare records. At every derivation boundary, `originPower` is the applying direct hit's current damage: burn/Snare store it, Ledger uses the fifth hit, and Cinder retains the burn source power. A stronger burn replaces potency and provenance; equal/weaker reapplication keeps the stronger provenance, resets four ticks, and preserves any earlier next tick. Hex copies that provenance and shared refresh semantics.

Chill, freeze, burn, Task-3 Hollow, Ledger, and durable Hex slows live on targets. Snare is a geometric root-scoped `AreaState` with center/radius/damage/nextTickAt/origin/full provenance. Its `0.50` slow is transient membership, combined at movement time with durable Hex slows by selecting the smallest multiplier. Ledger line and Cinder ring are immediate area/reactive requests plus VFX; Hex pulse changes status only. Secondary damage never invokes direct-impact reducers.

Hex copies chill count/deadline and burn potency/remaining ticks to other live targets within inclusive `80 px`, but never Brand, Hollow, Ledger, or freeze. It slows chasers only. A fresh copied burn schedules `now + 0.4`; existing destinations keep maximum count/potency, never shorten deadlines/tick count, and retain an earlier tick. Widow's Ledger guarantees its `120%` area-classified damage only to the living fifth-hit target from Ralphy's current position and emits line VFX; it is not an unspecified multi-target beam.

Validate every finite status deadline/potency/counter and Snare's `40 px`, `1.5 s`, `10 Hz` geometry even though Snare compiles as an impact rule. Derive live bounds for status/area/VFX/root ledgers and upsert persistent status VFX instead of appending on refresh. Burn ticks are `status`, Ledger/Snare are `area`, Cinder ring is `reactive`, and shatter shards are generation-one direct; all affect DPS, but only each projectile's own direct contact affects accuracy.

- [ ] **Step 5: Run tests and commit**

```bash
bun test src/game/statuses.test.ts src/game/impacts.test.ts src/game/combat-effects.test.ts src/game/motions.test.ts src/game/metrics.test.ts src/game/simulation.test.ts src/game/combat-build.test.ts
git add src/game/statuses.ts src/game/statuses.test.ts src/game/combat-effects.ts src/game/combat-effects.test.ts src/game/simulation.ts src/game/simulation.test.ts src/game/metrics.ts src/game/metrics.test.ts src/game/motions.ts src/game/motions.test.ts src/game/combat-build.ts src/game/combat-build.test.ts
git commit -m "feat: apply signature target statuses"
```

---

### Task 5: Row 5 — Relations and Fields

**Files:**

- Create: `src/game/areas.ts`
- Create: `src/game/areas.test.ts`
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/combat-effects.ts`
- Modify: `src/game/simulation.ts`

**Interfaces:**

- Produces: shared swept spatial candidates, spectral traversal, canonical Tesla links, Big Iron main/moonlet pairs, Ghost Posse satellites, lossless batched Wake trails, Crossfire pulses, pair histories, and cumulative descendant accounting.
- Consumes: generation/root/lineage projectile state, Task-2 canonical paths, Task-3 provenance/once-history, accepted root snapshots, and bounded area/VFX records.

- [ ] **Step 1: Write six failing signature tests**

```ts
const ROW_FIVE = [
  ["spectralBullets", { obstacles: true, targets: true }],
  ["teslaBullets", { extraChance: 0.33, spread: 8, radius: 96, neighbors: 2, damage: 0.25, cooldown: 0.15 }],
  ["bigIron", { mainRadius: 1.25, mainDamage: 1.20, mainSpeed: 0.80, moonRadius: 14, moonAngular: 6 * Math.PI, moonSize: 0.50, moonDamage: 0.35, pairWindow: 0.25, explosionRadius: 56, explosionDamage: 0.50, knockback: 60 }],
  ["ghostPosse", { radius: 40, duration: 3, cap: 6, shotDamage: 0.20 }],
  ["ectoplasmicWake", { width: 8, duration: 0.8, tickRate: 10, damage: 0.05, cooldown: 0.2 }],
  ["crossfireCovenant", { armLength: 48, damage: 0.25, participationCap: 1 }],
] as const;
```

Assert spectral room-wall solidity, canonical Tesla/Crossfire pair IDs, degree two, cooldowns, pair explosion timing, tangential moonlet release, satellite creation/fire order, continuous bounded trail segments, and one Covenant pulse per projectile.

Extend the closed Big-Iron rule payload instead of hardcoding implementation literals: moonlet radius scale `0.50`, damage scale `0.35`, pair window `0.25`, explosion radius `56`, explosion scale `0.50`, knockback `60`, and distinct moonlet creation provenance. Crossfire similarly has an explicit one-shot pulse record/expiry contract rather than pretending to be a positive-duration ticking `AreaState`.

Use `96 px` spatial cells. Insert every physically clipped Task-2 swept center segment into all overlapped cells, not only endpoint cells. Dedupe lexicographic canonical runtime projectile pairs and stable-sort them; never silently cap candidates. Tesla considers all live Tesla-enabled generation-zero and generation-one endpoints, sorts edges by `(distance, pairId)`, then greedily enforces degree `<= 2`. Crossfire considers generation-zero current-step paths only, sorts `(crossingTime, pairId)`, and enforces one lifetime participation per projectile.

- [ ] **Step 2: Write spatial and area-key tests**

```ts
test("shared candidate pass returns each canonical pair once", () => {
  const pairs = buildSpatialCandidates(projectilesInOneCell());
  expect(pairs.map(({ id }) => id)).toEqual([...new Set(pairs.map(({ id }) => id))]);
  expect(pairs.every(({ a, b }) => a < b)).toBe(true);
});

test("area identity permits independent pair explosions but one root Snare", () => {
  expect(areaId("bigIron.merge", "trigger-1", "p1:p2")).not.toBe(areaId("bigIron.merge", "trigger-1", "p3:p4"));
  expect(areaId("ectoplasmSnare.pool", "trigger-1", "root")).toBe("ectoplasmSnare.pool:trigger-1:root");
});
```

Pair cooldown/history is separate from live area state. Tesla keys by effect + canonical projectile pair + target, preserves an unexpired `0.15 s` cooldown through a temporary disconnect, and prunes after expiry or permanent source cleanup. Damage/provenance always belongs to the lower-current-damage endpoint; ties use canonical-low projectile ID, including its root/lineage/projectile/origin power. Crossfire and Big-Iron use analogous canonical pair histories; removed anchors detach live links immediately.

Each actually launched non-Locket generation-zero heavy main receives exactly one same-`at`, same-`bornAt` scheduled generation-one moonlet after the main in numeric order. Echoes, Posse shots, other generation-one children, and converted Locket orbitals never create moonlets. The moonlet uses `0.35` of fully transformed main damage and `0.50` radius, inherits compatible generation-one traits, orbits at `14 px` and `6π rad/s`, and stores its parent ID/absolute expiry/range. If the main disappears for any reason, including Shotgun transformation, release at the physical removal point with tangent world velocity and unchanged expiry/range. A main/moonlet pair hitting one target within inclusive `0.25 s` creates one `56 px` area explosion for `0.50` snapshotted main damage and a `60 px` radial knockback; zero-distance fallback uses stable main heading. Mark the pair/target spent once.

At an accepted root, prune satellites with `expiresAt <= now`; older survivors fire in `(bornAt, id)` order from current orbit positions toward the root's snapshotted aim and expire, then append exactly one new satellite. If six are somehow live, evict the oldest before append. Posse shots are generation-one descendants of the current/firing root, deal `0.20` of the neutral fully-derived current weapon snapshot, inherit compatible generation-one traits, and carry distinct creation provenance. They never reproduce Twin/Fan/Dealer, Big-Iron, Wake, Crossfire, or Posse, and never consume a cartridge/trigger; their direct contacts own normal projectile accuracy.

- [ ] **Step 3: Run tests and confirm failure**

Run: `bun test src/game/areas.test.ts src/game/projectiles.test.ts`

Expected: FAIL because the shared candidate pass and row-five reducers do not exist.

- [ ] **Step 4: Implement bounded relations and areas**

Use a room-cell spatial map keyed by integer cell coordinates; emit canonical neighbor candidates once and reuse them for Tesla distance and Crossfire swept-segment intersection. Enforce area duration `<=3`, tick rate `<=10`, one Crossfire participation, Tesla degree two, and six satellites.

```ts
export const canonicalPair = (a: string, b: string): string => a < b ? `${a}:${b}` : `${b}:${a}`;
export const areaId = (effectId: string, rootTriggerId: string, instanceKey: string): string =>
  `${effectId}:${rootTriggerId}:${instanceKey}`;
```

Ectoplasmic Wake maintains one closed batched trail/polyline record per generation-zero lineage. Append only the actual clipped path up to removal; each segment expires independently after `0.8 s`. Use a lossless bounded ring/chunk representation (at `120 Hz`, at most `97` points per live lineage), one lineage-wide `10 Hz` catch-up clock, no tick at exact expiry, and cooldown key effect + lineage + target (`0.2 s`) so overlapping segments deal one tick. Snapshot damage/provenance on segments so dead sources are never consulted. Wake is secondary area damage and never affects accuracy.

Crossfire detects a unique centerline intersection of current physically clipped paths, ignores collinear overlap and the shared birth muzzle, but accepts endpoint contact so Twin convergence counts. Earliest crossing then canonical pair wins. The pulse is two source-path-aligned diagonals of total length `48 px`, centered at the intersection, damaging each target once for `25%` of the lower source damage. Creating it consumes both participation slots even without a target. A crossing before a later same-step terminal impact remains valid from stored clipped segment/event data; physical removal at the exact same time wins.

Classify moonlet/Posse contacts as direct; Tesla as `link`; kinetic explosion/Wake/Crossfire as `area`. All retain full effect/root/lineage/projectile/time/position provenance and contribute DPS/kills, while secondary damage never invokes impact reducers. Track exposed active area/satellite/descendant counts. Enforce the static all-row bound `294` with per-root cumulative generation-one accounting across live and expired children; reject overflow rather than truncating. Clean pair/cooldown/trail/descendant ledgers only when no live/scheduled/pending/status/area source remains.

- [ ] **Step 5: Run tests and commit**

```bash
bun test src/game/areas.test.ts src/game/projectiles.test.ts src/game/combat-effects.test.ts src/game/trigger.test.ts src/game/combat-build.test.ts src/game/metrics.test.ts src/game/simulation.test.ts
git add src/game/areas.ts src/game/areas.test.ts src/game/projectiles.ts src/game/projectiles.test.ts src/game/combat-effects.ts src/game/simulation.ts src/game/simulation.test.ts src/game/trigger.ts src/game/trigger.test.ts src/game/combat-build.ts src/game/combat-build.test.ts src/game/metrics.ts src/game/metrics.test.ts
git commit -m "feat: add signature projectile relations"
```

---

### Task 6: Row 6 — Ralphy, Risk, and Positioning

**Files:**

- Create: `src/game/reactive.ts`
- Create: `src/game/reactive.test.ts`
- Modify: `src/game/trigger.ts`
- Modify: `src/game/trigger.test.ts`
- Modify: `src/game/cylinder.ts`
- Modify: `src/game/cylinder.test.ts`
- Modify: `src/game/projectiles.ts`
- Modify: `src/game/projectiles.test.ts`
- Modify: `src/game/combat-effects.ts`
- Modify: `src/game/metrics.ts`
- Modify: `src/game/metrics.test.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`

**Interfaces:**

- Produces: numeric recoil windows, Stillwater charge, Dustline snapshots, ordered Bonanza delivery, deterministic Locket orbitals, Undertaker's Coat decoy, phase-eight cylinder refunds, and provenance-complete HUD/world VFX commands.
- Consumes: fixed-step player motion/clamping, ordered cylinder, Task-1 root/Locket state, Task-2 canonical paths, Task-3 ordered kill contexts/Dustline tokens, damage/contact events, and VFX commands.

- [ ] **Step 1: Write six failing signature tests**

```ts
const ROW_SIX = [
  ["recoilBoots", { impulse: 55, duration: 0.35 }],
  ["stillwater", { speedThreshold: 1, chargeTime: 0.6, damage: 1.60, radius: 2.00 }],
  ["dustlineDuel", { threshold: 192, echoDelay: 0.12, echoDamage: 0.35, echoRange: 192 }],
  ["bonanzaClip", { firstKillPerRoot: 1, delivery: 0.25 }],
  ["lastGaspLocket", { health: 40, cadence: 3, radius: 40, duration: 2.5, cap: 3 }],
  ["undertakersCoat", { decoyDuration: 1, invulnerability: 1 }],
] as const;
```

Cover overlapping recoil windows/direction filtering, stationary charge cancellation, exact `192 px` crossing, Shotgun remaining `32 px`, delayed ordinary refund, Locket highest non-bell selection/bell-only armed cadence, three-orbital cap, pre-hit decoy position, and no fatal-hit decoy.

Keep fixed-step player order explicit: reload/buff → input acceleration and player move/clamp → Stillwater update → accepted fire/root → chaser movement/contact → combat phases → phase-eight refunds/cleanup. Recoil changes velocity only after this step's player displacement and can clamp/refund no earlier than the next movement phase. Same-step contact occurs after accepted fire and never retroactively cancels that root; fatal contact still allows the already accepted root, then applies ordinary death precedence.

Recoil windows store numeric `rootIndex`, full `recoilBoots.recoil` effect ID, vector, `expiresAt`, and one-shot state. A window is live only while `expiresAt > now`; at a corner it refunds at most once if either blocked axis has a strictly into-boundary vector component. Orthogonal/away windows remain. Queue refunds in numeric root order. The global due-refund comparator is `arrivesAt`, then full effect ID (`bonanzaClip.refund` before `recoilBoots.recoil`), then numeric root index; multiple refunds pop distinct current `emptied` slots.

Stillwater measures post-input/post-clamp `hypot(vx, vy) < 1` (`1` clears), accumulates fixed-step duration, and becomes charged at exactly `0.6 s` before same-step fire. Only accepted damage clears it; invulnerable contact does not. An accepted root consumes the charge and snapshots all delayed Fan/echo entries permanently. Clear progress/charge when unowned or reset. Recoil from the root is observed on the next movement step.

- [ ] **Step 2: Write refund and overlap tests**

```ts
test("eligible overlapping recoil windows refund in stable root order once", () => {
  const result = resolveBoundaryClamp(stateWithRecoilWindows(["trigger-2", "trigger-1"]), "left", 1);
  expect(result.refunds.map(({ rootTriggerId }) => rootTriggerId)).toEqual(["trigger-1", "trigger-2"]);
  expect(result.recoilWindows).toEqual([]);
});

test("Bonanza arrival cancels reload and restores an ordinary round", () => {
  const result = resolvePendingRefund(reloadingEchoCylinder(), bonanzaAt(1.25), 1.25);
  expect(result.reloading).toBe(false);
  expect(result.slots.filter(({ loaded }) => loaded)).toHaveLength(1);
  expect(result.slots.find(({ loaded }) => loaded)?.echo).toBe(false);
});
```

Task 1 returns a closed Locket orbital seed instead of merely dropping the converted projectile: root/rootIndex/lineage/local ordinal, eligible source effects, fully transformed damage/radius/origin power, and trigger time. Conversion happens immediately at accepted-root `now` even if the selected Fan candidate would have launched later. It never creates projectile telemetry and remains excluded from Big Iron, Deadeye, Grave, Dustline, Tesla links, and projectile accuracy. Pass numeric health and active-orbital count into trigger expansion. At `health <= 40`, every third accepted owned root arms; health above `40` or unowned resets. A due bell-only trigger stays armed. If three orbitals are live, keep it armed and launch candidates normally until a slot opens.

Locket orbitals use radius `40`, duration `2.5 s`, angular speed `2π rad/s`, and the lowest free stable slot's start angle `2π × slot / 3`. Timed records are live only while `expiresAt > now`. Swept contacts sort by orbital ID then chaser ID; the first consumes the orbital. Classify damage `source: "reactive"`, `lastGaspLocket/lastGaspLocket.orbital`, with source root/lineage/origin power and no projectile accuracy/count.

Dustline listens to Task-2 monotonic actual-path distance. Physical prop/wall/target impact at exactly `192 px` wins over the distance transition. At the one crossing, snapshot exact interpolated position/time/tangent, current damage/radius/speed, compatible inherited motion/penetration/direct-status/Tesla/bounce traits, root/lineage/origin power, and creation provenance. Fire at `crossedAt + 0.12` through the first eligible fixed-step materialization, generation one, `0.35` damage, `192 px` range, and no Dustline/emission/reactive eligibility. Parent mutation/death cannot change it. With Shotgun at `160`, create one parent-owned afterimage seed from the pre-split tangent/current values; transfer only a `32 px` penetration token to each pellet, and pellets never create afterimages. Return/bounce/Halo all use monotonic path and can cross once.

- [ ] **Step 3: Run tests and confirm failure**

Run: `bun test src/game/reactive.test.ts src/game/simulation.test.ts src/game/cylinder.test.ts`

Expected: FAIL because row-six state and reducers do not exist.

- [ ] **Step 4: Implement explicit bounded player state**

```ts
export type RecoilWindow = Readonly<{
  effectId: "recoilBoots.recoil"; rootTriggerId: string; rootIndex: number;
  vector: Point; expiresAt: number; refunded: boolean;
}>;
export type ProtectiveOrbital = Readonly<{
  id: string; rootTriggerId: string; rootIndex: number; lineageId: string; originPower: number;
  damage: number; radius: number; angle: number; angularSpeed: number; expiresAt: number;
}>;
export type DecoyState = Readonly<{ x: number; y: number; expiresAt: number }>;
export type PendingRefund = Readonly<{
  effectId: "bonanzaClip.refund" | "recoilBoots.recoil";
  rootTriggerId: string; rootIndex: number; arrivesAt: number;
}>;
```

Prune timed records every step. Apply recoil as additive velocity, refund only windows pointing into the clamped boundary, and resolve pending refunds in phase-eight effect-ID order. Decoy retargeting affects chasers only; Ralphy keeps control while alive.

Bonanza consumes Task-3 ordered immutable kill contexts. Only the first reactive-eligible depth-zero kill per `effectId + rootTriggerId` creates one delivery; generation-one kills and depth-one reactions cannot. Create it even when the cylinder is full, snapshot death origin/root index/provenance, and arrive at exact kill time `+0.25`. Extra kills never create another. Phase eight applies the ordinary-round refund at `now >= arrivesAt`; full capacity is a no-op and does not cancel reload. A due refund resolves after same-step fire/automatic reload start and restores the then-most-recent empty slot, cancelling active reload only when the capacity is not full. Recoil and Bonanza may each refund once in stable order.

Undertaker's Coat is the canonical slot-36 name/ID (`undertakersCoat`); do not introduce a parallel Second Skin artifact. Accepted contact means health actually decreases at `now >= invulnerableUntil`. Snapshot post-move/pre-hit position. A nonfatal hit sets invulnerability through at least `now + 1`, replaces the singleton decoy through `now + 1`, and clears Stillwater; chasers retarget only on the next movement step. Dummies/projectile homing and player control are unchanged. Fatal contact creates no decoy. Prune at `expiresAt <= now`; stable multi-chaser contact uses target ID.

Extend VFX records with full effect/root/lineage provenance and a semantic world/HUD destination. Upsert one Stillwater ward; emit one skid per refunded recoil window, one Dustline snapshot/fire cue, one Bonanza soul delivery persisting through even a no-op arrival, one orbital/consume cue, and one decoy. Derive and validate bounds: recoil by fire-rate × `0.35`, one Bonanza delivery per live root, one Dustline afterimage per eligible generation-zero source (Shotgun still one), three orbitals, one decoy. Earned snapshots persist after loadout removal; reset clears all. Clear Targets drops target references but preserves an in-flight earned ammo delivery.

Add exact cross-row tests for Stillwater→Bell→Locket→Big Iron ordering, Stillwater+Shotgun+Dustline, bell-only and cap-full armed Locket, same-root Bonanza+Recoil, lethal/nonfatal Coat contact, and bounded all-row cleanup. A converted orbital may retain Stillwater but never Big Iron/Tesla/Deadeye/Grave/Dustline. Dustline copies prior numeric transforms then applies `0.35` once. Eligible generation-zero ring/status/area kills may activate Bonanza; generation-one kills may not. Recoil runs once per accepted cartridge root regardless of projectile count.

- [ ] **Step 5: Run tests and commit**

```bash
bun test src/game/reactive.test.ts src/game/trigger.test.ts src/game/cylinder.test.ts src/game/projectiles.test.ts src/game/combat-effects.test.ts src/game/metrics.test.ts src/game/simulation.test.ts
git add src/game/reactive.ts src/game/reactive.test.ts src/game/trigger.ts src/game/trigger.test.ts src/game/cylinder.ts src/game/cylinder.test.ts src/game/projectiles.ts src/game/projectiles.test.ts src/game/combat-effects.ts src/game/metrics.ts src/game/metrics.test.ts src/game/simulation.ts src/game/simulation.test.ts
git commit -m "feat: add signature Ralphy reactive rules"
```

---

### Task 7: Exact Compositions and All-Artifact Stress

**Files:**

- Create: `src/game/composition.test.ts`
- Create: `src/game/stress.test.ts`
- Modify: production files only when a failing composition test exposes a defect.

**Interfaces:**

- Consumes: all six completed rows.
- Produces: deterministic proof of synergies, cleanup, provenance, and the `294` bound.

- [ ] **Step 1: Add exact composition tests**

Cover these loadouts with deterministic inputs and assert their distinguishing results:

```ts
const COMPOSITIONS = [
  ["Twin + Tesla + Crossfire", ["twinChamber", "teslaBullets", "crossfireCovenant"]],
  ["Deadeye + Grave + Fan", ["deadeye", "graveEcho", "fanThePhantom"]],
  ["Halo + Shotgun + Wailing + Ghost", ["haloChamber", "shotgun", "wailingLead", "ghostSight"]],
  ["Pinball + Mint + Return", ["pinball", "bootlegMint", "undertakersReturn"]],
  ["Hollow + Bone + Comet", ["hollowPoint", "boneOrchard", "cometSpur"]],
  ["Cold + Cinder + Hex + Snare", ["coldcaster", "cinderGospel", "hexBell", "ectoplasmSnare"]],
  ["Big Iron + Posse + Tesla", ["bigIron", "ghostPosse", "teslaBullets"]],
  ["Stillwater + Shotgun + Dustline", ["stillwater", "shotgun", "dustlineDuel"]],
  ["Harvester + Brand + Bonanza", ["soulHarvester", "wantedBrand", "bonanzaClip"]],
] as const;
```

Each fixture has an exact distinguishing oracle rather than a no-throw assertion:

- Twin+Tesla+Crossfire: base `20/5/620`, aim distance `192`, RNG `0.1` creates exactly three generation-zero shots at damage `14`; Twin reconverges at `192`, shared muzzle is ignored, one canonical Crossfire pulse occurs at convergence for `3.5` with lower/canonical provenance, and Tesla degree stays `<=2`.
- Deadeye+Grave+Fan: consumed echo at `t=1` creates Fan generation-zero at `1/1.09/1.18`, damage `9`; Deadeye at `1.12/1.21/1.30`, damage `3.15`; Grave at `1.28/1.37/1.46`, damage `3.6`; six generation-one copies retain parent root/lineage/origin/heading and creation provenance but no emission/reactive eligibility.
- Halo+Shotgun+Wailing+Ghost: at exactly `160` actual-path pixels, the parent is replaced and the next step materializes eight children at damage `5`, radius `2.75`, phases `2πi/8`; spiral/wave/homing remain, emission eligibility does not, and a target within `96` proves polyline collision/steering.
- Pinball+Mint+Return: the first wall/prop bounce before `240` leaves parent damage `18`, speed `837`, consumes one relay and queues one tangent Mint child at damage `5.4`, radius `2.75`, range `160`; Return turns at total `240`, damage `11.7`, and the same target may be hit once per leg.
- Hollow+Bone+Comet: use one lineage at age `1`, current damage/radius `27/7.5`. First direct stores `16.2` and queues three Bone shards at `5.4/4.125/160`; second direct deals `27` and detonates one `64 px` area for `16.2`.
- Cold+Cinder+Hex+Snare: four ordered generation-zero direct hits on one target/same root yield chill1 → chill2 → freeze without shards → consume freeze + chill1 + four shards (`3/2.25/128`); exactly one Snare (`40/1.5/.1`, damage `.8`), burn potency `2` with four ticks/earliest tick retained, and fourth-hit Hex copies chill1/burn to a second in-range target but not excluded states.
- BigIron+Posse+Tesla: root one creates heavy main `24/6.25/496`, one moonlet `8.4/3.125`, and one nonfiring satellite; root two fires exactly one Posse shot at damage `4` before adding a satellite. Moonlet/Posse keep Tesla eligibility but no Big-Iron/Posse/Wake/Crossfire creation eligibility; Tesla includes generation one and respects degree two.
- Stillwater+Shotgun+Dustline: charging exactly `.6` creates parent `32/10` with penetration; split at `160` queues eight pellets `8/5.5`, one parent afterimage seed, and only a `32 px` token per pellet; afterimage at split `+.12` is generation one, damage `11.2`, range `192`, and cannot retrigger.
- Harvester+Brand+Bonanza: one low-health victim and two live survivors within `240`; first generation-zero kill brands then jumps to nearest/stable survivor, queues two distinct-target spirits at damage `7` from origin power `20`, and one Bonanza arrival at kill `+.25`; later same-root/generation-one/depth-one kills cannot repeat either reaction.

- [ ] **Step 2: Add deterministic ten-second stress**

Create all thirty-six ownership in one batch, spawn five dummies and five chasers, fire/reload for ten seconds at `1/120`, stop firing, and continue until all bounded transient state cleans up.

```ts
expect(maxima.generationZeroPerTrigger).toBeLessThanOrEqual(11);
expect(maxima.descendantsPerTrigger).toBeLessThanOrEqual(294);
expect(maxima.descendantsPerTrigger).toBeLessThan(384);
expect(final.scheduledProjectiles).toEqual([]);
expect(final.pendingEmissions).toEqual([]);
expect(final.areas).toEqual([]);
expectFiniteTree(serializable(final));
expect(serializable(run(seed))).toEqual(serializable(run(seed)));
```

Assert every damage event has `artifactId`, `effectId`, root trigger, depth, finite damage/time/position, and that direct accuracy ignores links/status/areas/reactive damage.

Use the per-root cumulative descendant ledger, not simultaneous arrays or global projectile telemetry. Assert the known Tesla-success/Dealer-due root has exactly `11` generation-zero launches, every root stays at or below `build.maxDescendants`, and the compiled all-artifact value is exactly `294`. Add a boundary fixture where cumulative child `294` is accepted and child `295` throws a named overflow error; no `slice`, cap, or silent suppression is allowed.

Drain with a fixed upper bound through stop `+8 s`, moving the player at speed `>=1` so owned Stillwater does not recharge. The final transient predicate covers live projectiles, schedules, pending emissions, areas, VFX, Tesla links, rolling hit history, target statuses, pair/cooldown/once/relay/descendant ledgers, trails, satellites, recoil windows, refunds/deliveries, orbitals, and decoy. Assert exact empty/null/neutral states plus cleared target deadlines/charges/notches; sample maximum size of every bounded collection during every tick, because final emptiness alone does not prove bounded growth.

Walk the raw state before serialization and reject non-finite numbers, undefined/symbol/function values except the explicitly omitted RNG closure, unsupported collections, and cycles. Then build one canonical complete gameplay snapshot, `structuredClone` it, JSON round-trip it, and compare seeded runs including hidden ledgers. Never call JSON before the finite walk because JSON masks NaN/Infinity as `null`.

Collect each newly appended damage event every fixed step before the rolling three-second metrics prune. Every observed event has a closed five-family source, nonempty target/artifact/effect/root, depth `0|1`, finite positive damage/time/originPower/position, and nonempty optional lineage/projectile IDs. Direct events require projectile/lineage IDs and `firstProjectileHit`. After drain, assert `metrics.hits` equals observed direct count, secondary hits equal observed non-direct count, successful projectiles equal distinct direct projectile IDs, total projectiles equal successes + misses, and reported accuracy equals that quotient.

The executable fixture batch-owns all 36 once, asserts exactly five nonoverlapping dummies and five chasers were spawned, uses integer clock `tick/120` for 1,200 firing ticks plus bounded drain, deterministic aim/movement, and a seeded/tape RNG containing Tesla successes and failures. Press reload on the first actual Deadeye sweet-window tick while automatic reload remains the source. Assert Ralphy is alive through the ten-second firing premise.

- [ ] **Step 3: Run stress and full unit gate**

Run:

```bash
bun test src/game/composition.test.ts src/game/stress.test.ts
bun test
bun run build
```

Expected: PASS without timeouts, non-finite state, silent truncation, or order-dependent output.

- [ ] **Step 4: Request independent mechanics review**

Review all exact numbers and special compositions against the written specification. Fix Critical/Important findings with a failing signature or composition test first.

- [ ] **Step 5: Commit**

```bash
git add src/game/composition.test.ts src/game/stress.test.ts src/game
git commit -m "test: prove all signature artifact combinations"
```
