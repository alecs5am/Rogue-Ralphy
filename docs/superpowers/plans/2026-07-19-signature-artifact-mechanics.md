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
- Modify: `src/game/simulation.ts`
- Modify: `src/game/metrics.ts`

**Interfaces:**

- Produces: `TargetEffects`, `applyDirectStatuses`, `advanceStatuses`, `selectBrandTarget`, and status VFX commands.
- Consumes: sorted direct impacts, source provenance, area damage, and fixed time.

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

- [ ] **Step 3: Run tests and confirm failure**

Run: `bun test src/game/statuses.test.ts src/game/metrics.test.ts`

Expected: FAIL because target-effect reducers do not exist.

- [ ] **Step 4: Implement closed target state and ticks**

```ts
export type TargetEffects = Readonly<{
  chill: Readonly<{ count: 0 | 1 | 2; expiresAt: number }>;
  frozenUntil: number;
  burn?: Readonly<{ potency: number; remainingTicks: number; nextTickAt: number; originPower: number; rootTriggerId: string }>;
  hollowPoint?: Readonly<{ damage: number; expiresAt: number; rootTriggerId: string }>;
  ledger: Readonly<{ count: number; expiresAt: number }>;
  slows: readonly Readonly<{ effectId: string; multiplier: number; until: number }>[];
}>;
```

Status damage records `source: "status"`; pools/lines/rings record `area` or `reactive`. Apply kill reactions in phase 8 once per `effectId/rootTriggerId` and mark their damage depth one.

- [ ] **Step 5: Run tests and commit**

```bash
bun test src/game/statuses.test.ts src/game/impacts.test.ts src/game/metrics.test.ts src/game/simulation.test.ts
git add src/game/statuses.ts src/game/statuses.test.ts src/game/combat-effects.ts src/game/simulation.ts src/game/metrics.ts
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

- Produces: shared spatial candidates, spectral traversal, Tesla links, Big Iron pairs, Ghost Posse satellites, Wake trails, and Crossfire areas.
- Consumes: generation/root/lineage projectile state and bounded area/VFX records.

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

- [ ] **Step 5: Run tests and commit**

```bash
bun test src/game/areas.test.ts src/game/projectiles.test.ts src/game/metrics.test.ts src/game/simulation.test.ts
git add src/game/areas.ts src/game/areas.test.ts src/game/projectiles.ts src/game/projectiles.test.ts src/game/combat-effects.ts src/game/simulation.ts
git commit -m "feat: add signature projectile relations"
```

---

### Task 6: Row 6 — Ralphy, Risk, and Positioning

**Files:**

- Create: `src/game/reactive.ts`
- Create: `src/game/reactive.test.ts`
- Modify: `src/game/trigger.ts`
- Modify: `src/game/cylinder.ts`
- Modify: `src/game/combat-effects.ts`
- Modify: `src/game/simulation.ts`
- Modify: `src/game/simulation.test.ts`

**Interfaces:**

- Produces: recoil windows, Stillwater charge, Dustline threshold, Bonanza delivery, Locket orbitals, and Undertaker decoy.
- Consumes: player motion/clamping, ordered cylinder, root/lineage state, damage/kill events, and VFX commands.

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

- [ ] **Step 3: Run tests and confirm failure**

Run: `bun test src/game/reactive.test.ts src/game/simulation.test.ts src/game/cylinder.test.ts`

Expected: FAIL because row-six state and reducers do not exist.

- [ ] **Step 4: Implement explicit bounded player state**

```ts
export type RecoilWindow = Readonly<{ rootTriggerId: string; vector: Point; expiresAt: number; refunded: boolean }>;
export type ProtectiveOrbital = Readonly<{ id: string; rootTriggerId: string; damage: number; angle: number; expiresAt: number }>;
export type DecoyState = Readonly<{ x: number; y: number; expiresAt: number }>;
export type PendingRefund = Readonly<{ effectId: "bonanzaClip" | "recoilBoots"; rootTriggerId: string; arrivesAt: number }>;
```

Prune timed records every step. Apply recoil as additive velocity, refund only windows pointing into the clamped boundary, and resolve pending refunds in phase-eight effect-ID order. Decoy retargeting affects chasers only; Ralphy keeps control while alive.

- [ ] **Step 5: Run tests and commit**

```bash
bun test src/game/reactive.test.ts src/game/trigger.test.ts src/game/cylinder.test.ts src/game/simulation.test.ts
git add src/game/reactive.ts src/game/reactive.test.ts src/game/trigger.ts src/game/cylinder.ts src/game/combat-effects.ts src/game/simulation.ts src/game/simulation.test.ts
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
