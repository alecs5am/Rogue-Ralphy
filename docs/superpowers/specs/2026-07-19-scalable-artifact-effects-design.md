# Scalable Artifact Effects and Combat HUD

**Date:** 2026-07-19

**Status:** Approved for implementation

## Summary

Build the first scalable combat-effects vertical slice for Ralphy Combat Lab. Replace the current flat collection of artifact-specific weapon fields with a data-driven artifact catalog and a deterministic projectile-effect pipeline. Use that foundation to add Tesla Bullets, Shotgun, and Spectral Bullets, rework Halo Chamber, repair Ghost Sight, and replace the text health/ammunition HUD with an ImageGen-produced pixel-art HUD.

This is the first of three ordered demo stages:

1. Scalable effect engine, five signature artifact behaviors, metrics integration, and projectile obstacles.
2. ImageGen HUD asset pack and heart/ammunition/resource presentation.
3. A separate follow-up catalog expansion to approximately 50 unique passive artifacts.

Stages 1 and 2 belong to this implementation slice because they share the same combat state and acceptance tests. The full 50-item catalog receives its own later design and plan after this slice is playable.

## Relationship to Earlier Specifications

This document preserves the unique-ownership contract in `2026-07-19-unique-artifacts-design.md`: an artifact is either owned or absent, the same artifact cannot be collected twice, and every different artifact may be active simultaneously.

It supersedes the following parts of `2026-07-18-ralphy-combat-lab-design.md` and `2026-07-19-unique-artifacts-design.md`:

- The flat artifact-specific `DerivedWeapon` model.
- Halo Chamber's player-centered hold-and-release orbit.
- Ghost Sight's `40 px`, unlocked point-sample acquisition.
- Numeric health and ammunition text in the in-room HUD.
- The implication that all projectile behavior must be expressed as fields on one weapon snapshot.

Existing movement, six-round revolver, automatic reload, active-reload timing, unique artifacts, test-room dimensions, laboratory controls, and fixed-timestep simulation remain in force unless explicitly changed below.

## Goals

- Make new artifact mechanics declarative enough that adding the later 50-item catalog does not require growing a central chain of artifact-specific conditionals.
- Make Tesla Bullets, Shotgun, Spectral Bullets, Halo Chamber, and Ghost Sight individually obvious and predictably composable.
- Preserve deterministic simulation and testability even though multishot uses real random rolls during play.
- Track direct, secondary, and status damage without corrupting DPS or accuracy.
- Give the room real projectile obstacles so spectral behavior has visible meaning.
- Present health, the six-round cylinder, and resources through cohesive original pixel-art generated with ImageGen.
- Keep implementation appropriate for a two-day game-jam demo: typed objects and focused systems, not a general-purpose ECS or visual scripting runtime.

## Non-goals

- Designing or implementing the full 50-artifact catalog in this slice.
- Procedural floors, pickups, item pools, shops, drops, or run persistence.
- Player collision with rocks, crates, or laboratory markers. They become ballistic cover in this slice, not navigation blockers.
- Resource pickup/spending mechanics. Coins, bombs, and keys receive bounded state and HUD counters only.
- Replacing Canvas 2D, Vite, TypeScript, or the current fixed-step game loop.
- Copying item names, descriptions, icons, characters, or visual expression from *The Binding of Isaac*. Only abstract mechanic families are inspiration.

## Architecture Decision

Use a lightweight artifact catalog plus ordered effect handlers. Do not extend the current design with dozens of booleans and artifact-specific fields, and do not introduce a full entity-component system.

### Artifact catalog

One catalog is the source of truth for artifact identity and laboratory presentation. Each definition contains:

- Stable unique identifier.
- Display name and short description.
- ImageGen icon asset key.
- Category and searchable mechanic tags for the later larger catalog.
- Ordered references to effect handlers.

The owned loadout stores identifiers only. The laboratory builds cards, `Take all`, `Clear artifacts`, selected state, and descriptions from this same catalog. Duplicate catalog identifiers, missing effect references, and missing asset keys fail catalog validation during development and tests.

### Effect handlers and phases

Effects participate only in declared phases:

1. **Derive stats:** adjust universal weapon and player statistics.
2. **Build trigger:** roll multishot, choose headings, attach projectile behavior descriptors, and consume one cartridge.
3. **Advance projectile:** calculate trajectory, targeting, swept movement, travel distance, and timed behaviors.
4. **Resolve events:** handle the earliest split, obstacle, wall, or target event along the swept segment.
5. **Resolve secondary effects:** create Tesla links, secondary damage, status applications, and visual-effect commands.
6. **Finalize:** expire projectiles, append metrics, and publish a render snapshot.

Phase order is fixed and handlers cannot reorder it. An effect receives a constrained context and returns typed changes or commands; it does not mutate unrelated global state. This keeps effects independently testable and prevents catalog order from silently changing gameplay.

### Projectile behavior descriptors

Universal projectile data remains direct: position, velocity, damage, radius, lifetime, source trigger, and travelled path length. Optional behaviors are represented by focused descriptors rather than a new top-level weapon field for every artifact:

- Trajectory controller, including straight flight or outward spiral.
- Multishot and spread metadata.
- Split-on-distance configuration.
- Obstacle and target penetration policy.
- Homing acquisition and steering state.
- Tesla linking state.
- Bounce, freeze, and other existing behavior state.
- Effect history and generation identifiers used to prevent accidental recursive retriggers.

Shotgun children inherit compatible descriptors but explicitly remove the split descriptor. No global inventory cap or silent artifact normalization is added.

## Deterministic Randomness and Multishot

`multishot` is a scalar, not a projectile counter and not an accumulating pity system.

- The integer part is the guaranteed projectile count.
- The fractional part is an independent probability of one additional projectile on that trigger.
- The base revolver has `1.00` multishot.
- Tesla Bullets adds `+0.33`, producing one guaranteed projectile and a `33%` chance of a second.
- Twin Chamber adds `+1.00`; Twin Chamber plus Tesla Bullets produces two guaranteed projectiles and a `33%` chance of a third.
- Future additive bonuses compose by ordinary addition. For example, `2.66` means two guaranteed projectiles and a `66%` chance of a third.
- A trigger always consumes exactly one cartridge regardless of its resulting projectile count.

Gameplay uses the simulation's seeded random source. Tests inject or seed that source so boundary cases can be asserted. A failed fractional roll is forgotten immediately; it does not increase a later roll.

## Signature Artifact Mechanics

### Tesla Bullets

Tesla Bullets has two effects:

1. Add `+0.33` multishot.
2. Give spawned projectiles the Tesla-link behavior.

After active projectiles move, each Tesla projectile may connect to its two nearest Tesla neighbors within `96 logical pixels`. Links are undirected and deduplicated, so the same pair is resolved once per step. Links may connect projectiles from different triggers; this makes the effect visible even when the fractional multishot roll fails on the current shot and rewards overlapping projectile patterns.

An electric arc damages a target whose collision circle intersects the segment between its endpoints. Damage is `25%` of the lower endpoint's current damage. A specific arc-target pair can apply damage at most once every `0.15 seconds`. Tesla damage contributes to total damage, rolling DPS, peak DPS, per-target damage, and secondary-hit telemetry. It does not count as a direct projectile contact and therefore does not turn a missed projectile into a successful projectile for accuracy.

The two-neighbor limit and per-target cooldown are explicit mechanic rules, not emergency frame-rate clamps. They keep Tesla plus Shotgun readable and bounded.

### Shotgun

Shotgun attaches one split-on-distance descriptor to primary projectiles:

- Split distance: `160 logical pixels`, equal to `2.5` room tiles.
- Child count: `8` pellets.
- Child path limit: `128 logical pixels`, equal to `2` room tiles.
- Damage per pellet: `35%` of the parent's current damage at split time.
- Pellets begin at the exact split position and fan evenly through `360°` around the parent's current heading.

Travelled distance uses actual path length, including bounces and spiral motion, rather than straight-line displacement from the muzzle. If an obstacle or target collision occurs earlier on the swept segment than the split threshold, the collision resolves first. A non-piercing parent that is consumed before `160 px` never splits. A piercing parent may damage targets and still split after reaching the threshold.

Children inherit current size, damage modifiers, Tesla linking, target/obstacle penetration, freeze, remaining bounce behavior, and Ghost Sight. They do not inherit split-on-distance, so one Shotgun artifact cannot recurse.

When Shotgun and Halo Chamber are both owned, pellets start together at the parent's current spiral position, retain the original fixed shot origin, and receive evenly varied angular velocity. They fan outward while continuing the expanding spiral, producing the agreed rosette rather than teleporting to pre-spaced points.

### Spectral Bullets

The player-facing artifact intentionally combines two internal capabilities:

- **Spectral:** ignore projectile obstacles.
- **Piercing:** pass through enemies after applying damage.

Keeping the capabilities separate internally allows later artifacts to grant only one of them. A Spectral projectile may hit each target at most once unless a future explicit multihit effect says otherwise. Room boundary walls are never bypassed. If Pinball has remaining bounces, wall behavior continues to take precedence over expiration.

Existing rock, crate, and lab-marker props receive simple projectile collision shapes. A normal projectile is consumed on contact; a Pinball projectile reflects and spends a bounce; a Spectral projectile ignores the prop. Player movement remains unaffected by these shapes in this slice.

### Halo Chamber

Halo Chamber no longer follows Ralphy and never launches toward a later aim direction. It gives a projectile a spiral controller with an immutable shot origin:

- Initial radius: `24 logical pixels`.
- Radius growth: `48 logical pixels/second`.
- Angular speed: `1.5 revolutions/second`.
- Maximum lifetime: `4 seconds`.
- Multishot projectiles begin with evenly spaced angular phases.

The controller produces outward radial motion plus tangential motion around the fixed origin. Collision remains active during the entire spiral. A projectile expires at four seconds if it has not already been consumed. Room walls and Pinball still behave normally.

Ghost Sight is applied after the spiral controller chooses its desired direction. Homing may bend the outward swirl toward a locked target, but it does not move the origin to Ralphy or otherwise bind the projectile to player motion.

### Ghost Sight

Ghost Sight acquires targets by testing the complete swept movement segment against targets within `96 logical pixels`, not by sampling only the projectile's end position.

- The closest eligible target to the swept segment is acquired.
- The projectile stores the target identifier and keeps the lock outside the original acquisition radius.
- Steering rotates toward the locked target at up to `540°/second` so the behavior is visually obvious at current projectile speed.
- If the target dies or is removed, the projectile may reacquire on a later swept segment.
- A lock does not permit repeat damage to a target already present in that projectile's hit history.

Homing applies to straight, bounced, spectral, Shotgun-child, and Halo spiral projectiles through the same steering phase.

## Combination Order and Expected Results

The critical composition order is:

1. Derive base damage, size, fire rate, multishot, and temporary reload buffs.
2. Roll the fractional multishot chance once per trigger.
3. Build primary projectiles and attach artifact descriptors.
4. Advance Halo or straight trajectory, then apply Ghost steering.
5. Resolve the earliest split or collision along each swept path.
6. Spawn Shotgun children with inherited compatible behaviors.
7. Build the Tesla neighbor graph from surviving active Tesla projectiles.
8. Resolve direct and secondary damage, statuses, metrics, and VFX.

Required signature combinations are:

- **Tesla + Shotgun:** pellets form a bounded moving electrical web.
- **Tesla + Halo:** successive spirals connect when their paths approach.
- **Shotgun + Spectral:** the parent and pellets pass through cover and may damage several different targets.
- **Shotgun + Ghost:** pellets acquire targets independently after splitting.
- **Shotgun + Halo:** one spiral blooms into an expanding rosette.
- **Halo + Ghost:** the fixed-origin spiral visibly bends toward nearby targets without following Ralphy.
- **All five:** a probabilistic multishot launches fixed-origin homing spirals that bloom into penetrating pellets and create bounded Tesla arcs.

Existing Big Iron, Hollow Point, Coldcaster, Pinball, Deadeye, and Twin Chamber continue to compose through the same phases.

## Damage and Telemetry

Damage events carry an explicit source: direct projectile, Tesla arc, status, or future secondary effect. They also retain trigger, projectile, artifact, target, position, and timestamp where applicable.

The laboratory keeps its current rolling and total metrics and adds source-aware values:

- All valid damage contributes to rolling DPS, peak DPS, total damage, and per-target damage.
- Direct projectile contacts increment direct hits.
- Tesla arcs increment secondary hits.
- A projectile counts as successful for projectile accuracy only after its first direct target contact.
- Tesla damage never changes shots fired or successful-projectile accuracy.
- Spawned Shotgun pellets count as projectiles created, not additional trigger pulls or cartridges spent.

The derived-stat panel displays multishot as both a scalar and its fractional chance, such as `1.33× · 33% extra`. It also exposes the active split distance, pellet count/range, spectral/piercing state, Tesla radius/damage, Halo duration/growth, and Ghost acquisition/turn values when those behaviors are active.

## Combat HUD

### Layout and state

The in-room HUD uses the approved Isaac-like hierarchy without copying Isaac artwork:

- Top-left row: five heart containers representing the current `100` maximum health.
- Each full heart represents `20 HP`; a half heart represents `10 HP`. Existing chaser contact damage of `10` therefore removes one visible half-heart with no rounding ambiguity.
- Directly below: six ammunition tiles matching the revolver cylinder. A fired cartridge changes its corresponding tile from loaded to empty immediately.
- Below ammunition: coin, bomb, and key counters. Each value is an integer clamped to `0–99` and rendered with two digits.
- Bottom center: the existing automatic-reload progress bar, Deadeye timing zone, success state, and short Quickdraw feedback.
- Detailed DPS and derived statistics remain in the right laboratory panel and never cover the combat field.

Resource pickup and spending are out of scope, so counters initialize at zero and remain ready for later systems. Tests may set resource state directly to exercise `00`, intermediate values, and `99`.

### Mandatory ImageGen asset pipeline

The HUD's artistic elements must be original pixel-art PNG assets generated with ImageGen. The production game must not substitute hand-written SVG, Canvas/CSS-drawn hearts or icons, emoji, Unicode pictograms, or CSS geometric approximations.

ImageGen produces a coherent asset family containing:

- Full, half, and empty red-heart states.
- Loaded and empty revolver-cartridge tiles.
- Coin, bomb, and key icons.
- HUD backing/plate details as needed for contrast.
- Reload frame, neutral fill texture, gold timing-zone texture, and successful-reload highlight.
- Tesla Bullets, Shotgun, and Spectral Bullets artifact icons.
- Tesla arc, Shotgun split, spectral trail, outward-spiral trail, and homing-lock VFX sprites or texture elements where a bitmap materially improves the effect.

Assets contain no generated labels or numbers. Dynamic resource values, reload copy, accessibility text, and telemetry remain real HTML text in an existing pixel/monospace font. CSS may position and scale the generated PNGs but may not recreate their artwork. Dynamic Tesla geometry may place or stretch an ImageGen-produced electric texture between endpoints; it is not implemented as a hand-authored SVG.

The asset workflow follows the established project pipeline:

1. Use the existing Ralphy Noir pixel-art assets as style references.
2. Generate families on a perfectly flat removable background with no embedded text.
3. Remove the background locally, validate alpha, crop consistently, and downscale using nearest-neighbor resampling.
4. Save only accepted runtime PNGs under `public/assets/generated/` and register every path in the asset manifest.
5. Validate logical dimensions, transparent padding, nearest-neighbor rendering, and load success before browser tests.

No CSS/SVG fallback artwork ships. Development diagnostics may show text explaining a missing asset, but the demo build must fail its asset preflight if a required HUD asset is absent.

## Rendering and VFX

- Tesla links update after projectile positions and render behind projectile sprites but above the room floor.
- Tesla uses a generated electric texture with a restrained animated offset and a brief target flash on damage.
- Shotgun split emits one generated burst sprite and immediately reveals the eight child trajectories.
- Spectral projectiles use a generated translucent ghost trail while retaining a solid readable core.
- Halo projectiles leave a short outward-curving trail that makes the fixed origin understandable.
- Ghost Sight displays a brief generated acquisition marker when lock begins; continuous large target reticles are avoided.
- Reduced-motion mode removes texture scrolling, excessive flashes, and nonessential camera response without changing mechanics.

## Error Handling and Safety

- Catalog validation rejects duplicate artifact identifiers, unknown effect references, invalid numeric parameters, and missing asset manifest entries.
- Runtime state rejects non-boolean artifact ownership and non-finite derived values.
- Effect history prevents a Shotgun child from receiving the same split behavior recursively.
- An arc pair is identified canonically so endpoint order cannot apply Tesla damage twice.
- Removed targets invalidate homing locks safely; reacquisition occurs through the normal acquisition phase.
- Swept-event resolution chooses the earliest event and uses stable identifier ordering for exact ties.
- Missing required HUD assets fail development preflight and automated browser setup instead of silently rendering homemade substitutes.

## Testing Strategy

### Catalog and derivation tests

- Catalog identifiers, effect references, asset keys, and uniqueness validate.
- The laboratory renders from the catalog and retains take/remove/take-all/clear behavior.
- Multishot boundary tests prove `1.33` yields two projectiles when the injected roll is below `0.33` and one otherwise, with no accumulation across triggers.
- Twin Chamber plus Tesla derives `2.33`, not a deterministic three-projectile trigger.

### Focused behavior tests

- Tesla selects no more than two neighbors, deduplicates pairs, respects `96 px`, enforces its target cooldown, and records secondary damage without accuracy.
- Shotgun splits once after `160 px`, creates eight children, applies `35%` damage, expires children after `128 px`, and respects earlier collisions.
- Spectral ignores props and pierces different enemies while preventing repeat hits on the same enemy.
- Non-spectral bullets collide with props; Pinball bullets reflect and spend a bounce.
- Halo keeps an immutable origin, grows outward at the specified rate, ignores later player movement/aim, and expires at four seconds.
- Ghost Sight acquires across a swept segment, retains a living target, reacquires after target removal, and turns at the specified rate.

### Combination and regression tests

- Cover Tesla + Shotgun, Shotgun + Spectral, Shotgun + Halo, Halo + Ghost, and all-five behavior in deterministic simulation tests.
- Preserve current movement, auto reload, Deadeye, bounce, freeze, damage, room boundary, target, and unique-ownership tests.
- Verify direct and secondary damage totals reconcile with global and per-target DPS.
- Verify the five-heart display at `100`, `90`, `10`, and `0` HP; six ammo states; and resource bounds at `00` and `99`.
- Browser tests verify every required ImageGen asset loads, no required HUD image is replaced by SVG/CSS artwork, ammo empties per trigger, auto-reload refills all six tiles, and the telemetry panel remains readable.

## Acceptance Criteria

- The central weapon derivation and projectile update code no longer needs a new artifact-specific boolean branch for every future item.
- Artifact ownership remains unique, and all existing artifacts, the three new artifacts, and both reworked artifacts can be active simultaneously.
- Tesla uses `+0.33` chance-based multishot with no accumulator.
- Tesla, Shotgun, Spectral, Halo, and Ghost match every numeric and interaction rule in this document.
- The existing room props make spectral and non-spectral bullets visibly different.
- DPS includes all damage sources while projectile accuracy includes direct projectile contact only.
- Hearts, six cartridge states, three resource counters, and reload art use accepted ImageGen PNGs; no hand-written SVG or CSS-drawn substitute ships.
- All unit, simulation, browser, asset-preflight, typecheck, and production-build checks pass.

## References

- *The Binding of Isaac* distinguishes spectral obstacle traversal from enemy piercing; Ralphy's Spectral Bullets intentionally bundles both internal capabilities: <https://bindingofisaacrebirth.wiki.gg/wiki/Tear_effect>
- Chain-lightning mechanic reference, adapted with original rules, name, presentation, and assets: <https://bindingofisaacrebirth.fandom.com/wiki/Jacob%27s_Ladder>
- Split-projectile mechanic reference, adapted with original rules, name, presentation, and assets: <https://bindingofisaac.fandom.com/wiki/The_Parasite>
- The project copies only abstract mechanic ideas, not protected art or textual expression: <https://www.copyright.gov/circs/circ33.pdf>
