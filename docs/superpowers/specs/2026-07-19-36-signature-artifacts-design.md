# Thirty-Six Signature Artifacts

**Date:** 2026-07-19

**Status:** Approved for implementation

## Summary

Expand Ralphy Combat Lab from eleven artifacts to exactly thirty-six unique passive artifacts presented as a compact `6 × 6` laboratory grid. Every slot is a build-defining mechanic with an immediate gameplay and visual signature. Pure stat-up items do not occupy catalog slots; numeric modifiers exist only as parameters or trade-offs inside a behavior.

The complete catalog remains simultaneously equippable. `Take all` must preserve every compatible effect without recursion, non-finite state, silent item suppression, or catalog-order-dependent results. The implementation stays inside the current fixed-step TypeScript and Canvas 2D architecture. It adds five typed rule families, not an ECS, event bus, scripting language, or generalized mod runtime.

This stage also generates the twenty-five new artifact icons and shared VFX families with the built-in ImageGen tool. Handwritten SVG, emoji, CSS-drawn production icons, and temporary repeated icons are not accepted substitutes.

## Relationship to Earlier Specifications

This document preserves:

- the fixed `13 × 7` field, one-tile Ralphy scale, Isaac-like weighted movement, and Canvas renderer;
- six-cartridge revolver, automatic `1.5 s` reload, unique boolean ownership, Deadeye timing input, deterministic RNG injection, source-aware metrics, and laboratory controls;
- the redesigned Tesla, Shotgun, Spectral, Halo, Ghost, round soul projectile, ghost revolver, Ralphy animation atlas, HUD, and ImageGen-only production-art policy;
- exact current Shotgun geometry: split after `160 px`, eight children, `320 px` child range, `48°` cone, `25%` damage, and `55%` radius;
- exact current Tesla base: `+0.33` probabilistic multishot, `8°` spread, two neighbors inside `96 px`, `25%` lower-endpoint damage, and `0.15 s` target cooldown.

It supersedes only these current artifact behaviors:

- Twin Chamber is no longer merely `+1` projectile and spread; its pair follows an authored weave-and-converge motion.
- Big Iron is no longer a radius-only multiplier; it creates a heavy projectile-and-moonlet pair.
- Hollow Point is no longer damage-only; it embeds and detonates a target charge.
- Coldcaster changes from a random one-hit freeze to deterministic chill, freeze, and shatter.
- Pinball keeps its bounce and damage retention but gains a readable post-bounce relay behavior.
- A successful Deadeye reload keeps its existing fire-rate buff and additionally charges the cylinder with echo rounds.

## Goals

- Make every artifact recognizable within one trigger, one impact, one reload, one kill, or one damage event.
- Give every artifact a distinct visual hook and at least two meaningful combinations.
- Make the six rows of the grid correspond to six understandable mechanic families.
- Compile catalog ownership into a stable combat snapshot only when loadout or temporary build state changes.
- Make rule order explicit so reordering catalog cards cannot alter combat results.
- Bound secondary generation mathematically while preserving all thirty-six effects under `Take all`.
- Keep the test room readable and responsive at both `1440 × 900` and `1024 × 768`.

## Non-goals

- Floors, procedural rooms, item pools, pickups, shops, currencies, bosses, or run persistence.
- A second enemy family beyond the existing dummy and chaser.
- More than thirty-six artifacts in this stage.
- Numeric rarity tiers, stacking duplicate copies, inventory limits, or item removal during a run.
- Runtime-authored effects, plugins, JSON scripting, a general event bus, ECS, or visual graph.
- Second-generation projectile emissions or kill-reaction chains beyond the single permitted `killReactionDepth: 1` step.
- New alternate weapons, magazine sizes, or replacement of the six-round HUD cylinder.

## Artifact Quality Bar

An artifact may ship only if it changes at least one of these player-facing verbs:

- how a trigger schedules or arranges shots;
- how a projectile moves through space;
- what happens on collision, bounce, expiry, reload, kill, hurt, or low health;
- how projectiles, targets, fields, or Ralphy relate to one another;
- how the player positions, times reloads, or manages the six-cartridge cylinder.

Every artifact must also have:

- a unique ImageGen icon;
- a clear VFX or animation cue;
- deterministic unit coverage for its signature behavior;
- at least two cataloged signature synergies;
- a bounded result with every artifact enabled.

A damage, size, speed, rate, duration, or reload modifier alone fails this bar.

## Laboratory Grid

The artifact laboratory replaces the current two-column card list with one compact `6 × 6` grid. Each row is one mechanic family in catalog order:

1. Trigger and cylinder.
2. Motion controllers.
3. Impact and transformation.
4. Target state and statuses.
5. Relations and fields.
6. Ralphy, risk, and positioning.

Each square tile contains only the generated icon and selection treatment. Hover, focus, or click projects the artifact's name, exact behavior, tags, and three highlighted synergies into one detail panel adjacent to the grid. Clicking a tile toggles ownership. An owned tile uses the existing orange selection language plus `aria-pressed="true"`; it never depends on color alone. Arrow keys move within the grid, Enter and Space toggle, and focus remains visible.

`Take all` and `Clear artifacts` remain directly below the grid. The detail panel retains the last focused artifact. At `1024 × 768`, the grid remains six columns and reduces tile/icon size; it does not become a 36-row list. The laboratory continues to scroll independently from the room.

## Architecture Decision

### Compiled combat build

Keep the current catalog and discriminated unions, but compile the owned catalog into five stable rule lists:

```ts
type CombatBuild = Readonly<{
  triggers: readonly TriggerRule[];
  motions: readonly MotionRule[];
  impacts: readonly ImpactRule[];
  emissions: readonly EmissionRule[];
  areas: readonly AreaRule[];
}>;
```

Every rule includes stable `artifactId` and `effectId` provenance. The compiler sorts rules by the semantic subphases declared below and then by `effectId`; it never uses catalog insertion order to choose a winner. Universal numeric weapon values remain direct fields on the derived weapon snapshot. Temporary Deadeye state overlays fire rate and echo charge without recompiling unrelated catalog metadata every fixed step.

The five families are deliberately closed for this demo:

- `TriggerRule`: ordinary shot, numbered trigger, first/last chamber round, perfect reload, kill, hurt, stationary charge, and low-health cadence.
- `MotionRule`: converge, spiral, homing, post-bounce relay, sine wave, return, acceleration/growth, orbit, and delayed afterimage threshold.
- `ImpactRule`: penetration, embedded charge, chill/freeze/shatter, burn, mark, hit counter, knockback, and ammo return.
- `EmissionRule`: delayed copy, burst, side pair, cone, ring, forward shards, homing spirits, tangent copy, orbiting posse shot, and afterimage shot.
- `AreaRule`: pulse ring, explosion, pool, trail, trajectory-cross pulse, tether, and decoy influence.

There is no handler registry. Each closed union is handled by one exhaustive phase-specific reducer.

### Fixed combat phases

Each update follows this order:

1. Build a `TriggerContext` containing cartridge index, root trigger count, perfect-reload charge, health band, stationary charge, current aim, and deterministic RNG stream.
2. Create and schedule generation-zero projectiles from trigger rules.
3. Apply motion in the fixed order: anchor/orbit → spiral/converge/wave → acceleration/return → homing → swept movement.
4. Resolve the event with the earliest swept time along the segment. Prop → wall → target → scheduled distance emission → range/lifetime expiry is the tie priority only; stable identifiers break any remaining tie.
5. Apply direct impact, target marks/statuses, knockback, embedded charges, and direct-hit counters.
6. Queue generation-one emissions for the next fixed step.
7. Update links, pools, trails, rings, burn ticks, chill expiry, decoys, and player satellites.
8. Resolve kills, ammo return, metrics, cleanup, and VFX commands.

Within phase 5, simultaneous impact events are processed by swept event time, then projectile ID, then target ID, then stable event-kind priority. This makes Hollow Point charges, chill stacks, Ledger notches, and Hex Bell counters deterministic for same-tick Twin/Fan/Shotgun contacts.

Secondary damage never re-enters direct-impact or ordinary emission phases. It may produce the explicitly declared one-step kill reactions in phase 8; damage created by a kill reaction carries `killReactionDepth: 1` and cannot produce another kill reaction.

### Exact trigger expansion order

One root trigger is expanded in this semantic order:

1. Snapshot the loaded cartridge slot, ammo-before-trigger, aim, stationary/health state, Deadeye echo mark, root-trigger index, and RNG result.
2. Start one logical volley. Twin Chamber makes its projectile count two; a successful Tesla fractional roll adds one bonus projectile. Without Twin, the ordinary and Tesla shots are centered symmetrically at `−4°/+4°`; with Twin, its woven pair remains symmetric and Tesla adds one center-line third projectile.
3. Fan the Phantom schedules three copies of that logical volley at `0`, `0.09`, and `0.18 s`. A Tesla roll is consumed once for the root trigger and therefore gives every Fan volley the same one-or-two count without Twin, or two-or-three count with Twin.
4. Dealer's Cut, when due, adds exactly two side projectiles to the first volley only. It does not duplicate through Fan.
5. Stillwater modifies every launched generation-zero projectile. Last Bell transforms the lowest stable-ID launched projectile when ammo-before-trigger is one. Last Gasp Locket, when due, converts the highest stable-ID non-bell projectile into its orbital; if the trigger contains only the bell, the Locket cadence remains armed for the next trigger.
6. Big Iron attaches one moonlet to each launched generation-zero projectile. Each older player satellite fires exactly one generation-one shot toward the snapshotted aim using the fully derived current weapon damage and compatible inherited traits; satellites never duplicate the trigger's Twin/Fan/Dealer pattern.
7. Deadeye and Grave Echo separately snapshot every launched generation-zero projectile after the preceding transforms and schedule their generation-one copies. They do not copy a Last Gasp orbital.

The all-artifact maximum is therefore three Fan volleys of three Twin/Tesla projectiles plus two Dealer side shots: `11` launched generation-zero projectiles before an optional Locket conversion.

### Cylinder and refund semantics

The revolver owns six ordered slots, each represented by `{ loaded, echo }`, plus a stable circular `nextSlot` index. Displayed ammo is derived from loaded slots rather than stored separately.

- A completed full reload loads all six slots as ordinary rounds, sets `nextSlot` to zero, and then applies Deadeye: a successful active reload marks all six slots as echo rounds; any other reload leaves every `echo` flag false.
- A trigger consumes the first loaded slot at or after `nextSlot`, snapshots its echo flag, clears both flags on that slot, and advances `nextSlot` circularly. Last Bell therefore checks `ammoBeforeTrigger === 1`, not an absolute slot number.
- Recoil Boots and Bonanza Clip restore the most recently emptied slot as an ordinary round with `echo: false`. A refund never recreates a spent Deadeye echo mark.
- If a refund arrives during any active reload, automatic or manually requested, it cancels that reload and immediately makes the restored round fireable. If other rounds remain loaded, their established circular order stays unchanged; if none remain, the restored slot becomes `nextSlot`. A refund at full capacity has no state effect and does not cancel reload.
- When the last round starts automatic reload and a same-step phase-eight refund also resolves, the refund wins after reload start: it cancels the reload and restores one ordinary round. A later empty trigger starts automatic reload again normally.
- At most one refund from Recoil Boots and one from Bonanza Clip may resolve for the same root trigger because their effect IDs are distinct. If both resolve together, they restore two different most-recently-emptied slots when capacity allows, ordered by stable effect ID.

## Shared Composition and Generation Rules

- Projectiles use generation `0` or `1` only.
- Generation-one projectiles inherit compatible motion, penetration, direct status application, damage, radius, homing, Tesla, and bounce state. They may add or complete Coldcaster chill/freeze, but cannot consume freeze or emit shatter payloads.
- Generation-one projectiles inherit no `EmissionRule`, reactive kill rule, or rule that created their lineage.
- An `effectId` may emit at most once per projectile lineage.
- Child emissions are queued and begin moving on the following fixed step; no emission recursively executes inside its creator's step.
- Catalog validation computes a conservative worst-case descendant count and rejects a build definition that can exceed `384` generation-one descendants per root trigger. The approved all-artifact trigger has at most `11` generation-zero projectiles. Each can account for at most `26` descendants: eight Shotgun pellets, two echoes, one moonlet, three Bone Orchard shards, six Grave Bloom spirits, one Bootleg copy, four shatter shards, and one Dustline copy. Adding at most two Soul Harvester spirits and six Posse shots gives `11 × 26 + 2 + 6 = 294`. Runtime does not silently truncate a valid build.
- Each root trigger may activate each kill-reactive `effectId` once, regardless of simultaneous AoE kills.
- Areas use `effectId + rootTriggerId + instanceKey`. The rule declares whether `instanceKey` is a lineage ID, canonical projectile-pair ID, target ID, or the literal root scope. This permits independent Big Iron pair explosions and Crossfire pair pulses while keeping Ectoplasm Snare root-scoped. Areas live at most `3 s` and tick at no more than `10 Hz`.
- A projectile may create at most one Crossfire Covenant pulse. A projectile pair and target pair use canonical stable identifiers.
- Tesla and other projectile links remain undirected, canonical, chain-depth one, and degree at most two.
- A status source affects the same target no faster than its declared cooldown.
- Applying the same status refreshes duration and takes maximum potency; different statuses coexist.
- Numeric transforms never replace an earlier transform. For each spawned projectile, `damage = baseDamage × arrangementScale × stillwaterScale × bellScale × bigIronScale`; radius and speed use the same ordered product of their applicable scales. `arrangementScale` is `0.70` for each Twin/Tesla-in-Twin projectile, then `×0.45` for a Fan copy; Dealer side shots instead begin at `0.55` and do not receive Twin or Fan's arrangement scale. Missing factors are `1`. Last Bell modifies only its selected projectile. Big Iron then modifies every still-launched generation-zero projectile. Comet Spur multiplies the resulting live speed, radius, and damage by its age interpolation rather than recomputing from base.
- Retention and emission percentages also multiply the fully derived current source value at the moment of bounce, snapshot, impact, threshold, or expiry. Grave/Deadeye echoes snapshot the completed generation-zero values and then apply `0.40`/`0.35`; no trigger transform is reapplied to a copy. An artifact uses a different source only when it explicitly names `base` or `originPower`.
- Penetration combines with logical OR. Bounce counts add; retention factors multiply.
- Target selection and steering are separate reducers. A live Pinball relay target is the temporary highest-priority target, then a retained Ghost Sight lock, then Wanted Brand. Wanted Brand makes its target eligible to Ghost Sight outside the normal acquisition radius. The selected target uses the highest applicable steering cap; motion providers never stack angular caps additively.
- Multiple geometric motion kinds compose in the fixed motion order. Catalog validation rejects only duplicate providers of the same exclusive geometric kind; target selection, target eligibility, and steering-cap rules are not geometric motion providers.
- RNG consumption order is `phase → effectId → projectileId → targetId`. Tests inject the RNG and assert boundaries.

## Exact Catalog

### Row 1 — Trigger and cylinder

#### 1. Twin Chamber

One cartridge guarantees two generation-zero projectiles. Across a convergence distance clamped from the muzzle-to-cursor distance into `96–480 px`, the pair uses opposite lateral offsets `±18 × sin(π × progress)`. It begins together, visibly separates, crosses back together at the chosen distance, then resumes straight flight. Both projectiles deal `70%` base current damage and carry all compatible effects. Tesla's fractional proc adds one center-line generation-zero projectile at the same `70%` damage rather than another pair, preserving the accepted two-guaranteed-plus-`33%`-third rule. The tile VFX is an intertwined twin trail. Signature synergies: Tesla Bullets, Crossfire Covenant, Shotgun.

#### 2. Deadeye

Keep the existing `12%` active-reload timing window, `+20%` fire-rate buff, and `2.25 s` buff duration. A successful press additionally marks all six newly loaded cartridges as echo rounds. Each echo round schedules one matching generation-one ghost copy `0.12 s` after the generation-zero volley at `35%` damage. A missed window performs the normal reload and grants neither benefit. The HUD gives loaded echo cartridges a generated gold overlay. Signature synergies: Grave Echo, Last Bell, Tesla Bullets.

#### 3. Last Bell

When ammo-before-trigger is one, the lowest stable-ID launched generation-zero projectile becomes a bell projectile at `45%` speed, `160%` radius, and `150%` direct damage. Other projectiles created by that same cartridge remain ordinary. Every `0.25 s` while alive, up to three times, the bell emits a `44 px` damage ring for `25%` of its current damage. Rings are secondary area damage and cannot proc impacts. Signature synergies: Halo Chamber, Ghost Sight, Hollow Point.

#### 4. Grave Echo

Every root trigger schedules one copy of each generation-zero projectile after `0.28 s`. Copies begin from Ralphy's original trigger position and heading, deal `40%` damage, inherit compatible motion/status rules, and carry no emission rules. Deadeye's faster echo is a separate effect and both may occur. A pale muzzle flash and transparent projectile distinguish the copy. Signature synergies: Tesla Bullets, Halo Chamber, Shotgun.

#### 5. Fan the Phantom

One cartridge schedules three generation-zero volleys at `0`, `0.09`, and `0.18 s` using the trigger's original aim. Their centers use `−8°`, `0°`, and `+8°`; each projectile deals `45%` current damage. Twin Chamber shapes each volley after the burst offset. Later volleys do not consume cartridges. Signature synergies: Coldcaster, Ghost Sight, Tesla Bullets.

#### 6. Dealer's Cut

Every third root trigger adds two generation-zero side shots at `−35°` and `+35°`, each at `55%` current damage. The counter persists across reloads and resets with the laboratory. A generated card-suit cylinder marker exposes progress `1/3`, `2/3`, `3/3`. Signature synergies: Tesla Bullets, Shotgun, Pinball.

### Row 2 — Motion controllers

#### 7. Halo Chamber

Preserve the accepted fixed-origin outward spiral: `24 px` initial radius, `48 px/s` radial growth, `3π rad/s` angular speed, and `4 s` maximum lifetime. Multishot phases remain evenly spaced. Signature synergies: Tesla Bullets, Shotgun, Ghost Sight.

#### 8. Ghost Sight

Preserve swept-segment acquisition inside `96 px`, stable closest-target tie-breaking, retained lock, reacquisition after target removal, and maximum steering of `3π rad/s`. Signature synergies: Shotgun, Undertaker's Return, Wanted Brand.

#### 9. Pinball

Preserve one bounce and `90%` damage retention. On the first wall or prop bounce, the projectile multiplies speed by `1.35`, displays a generated relay spark, and acquires the nearest live target within `160 px`; it then steers at Ghost Sight's `3π rad/s` until that target disappears. Additional bounce providers may add bounce count, but the relay acceleration/acquisition occurs once per lineage. Signature synergies: Bootleg Mint, Tesla Bullets, Ghost Sight.

#### 10. Wailing Lead

A generation-zero projectile follows a sine offset perpendicular to its base path with `22 px` amplitude and `144 px` wavelength measured by travelled distance. Swept collision follows the visible curve rather than only the unmodified heading. Generation-one children inherit the same wave with phase derived from stable child index. Signature synergies: Tesla Bullets, Spectral Bullets, Ectoplasmic Wake.

#### 11. Undertaker's Return

After `240 px` travelled distance, a projectile reverses its base direction once, displays a lasso-loop flash, multiplies remaining direct damage by `0.65`, and receives another `240 px` path budget. Per-target hit history is separated into outbound and return legs, allowing one hit per target per leg. Signature synergies: Spectral Bullets, Coldcaster, Ectoplasmic Wake.

#### 12. Comet Spur

Across the first `1 s` of projectile age, speed and radius interpolate from `1.0×` to `1.5×`, while direct damage interpolates to `1.35×`. The projectile uses its current physical size for collision and its actual travelled path for Shotgun and distance events. A generated comet tail grows with progress. Signature synergies: Big Iron, Ghost Sight, Hollow Point.

### Row 3 — Impact and transformation

#### 13. Shotgun

Preserve the accepted directional split: after `160 px`, replace the parent with eight generation-one pellets across a `48°` forward cone. Pellets travel another `320 px`, deal `25%` parent damage, use `55%` parent radius, inherit compatible effects, and cannot execute their own emission rules. Shotgun has two explicit all-artifact compositions so it never suppresses later distance/expiry items: Grave Bloom treats the parent transformation as its natural bloom point and emits its six spirits there; Dustline Duel schedules one parent afterimage at the split point and gives each pellet `32 px` of remaining travel before it becomes spectral. These emissions remain generation one and are attributed to the generation-zero parent's pending tokens, not to pellet emitters. Signature synergies: Tesla Bullets, Ghost Sight, Halo Chamber.

#### 14. Hollow Point

The first direct hit on an uncharged target embeds one charge containing `60%` of that projectile's current direct damage for `2 s`. The next direct projectile hit consumes the charge and creates a `64 px` explosion for the stored damage; the second projectile still applies its normal direct hit. A target holds one Hollow Point charge, and secondary damage cannot plant or detonate it. Signature synergies: Twin Chamber, Fan the Phantom, Comet Spur.

#### 15. Bone Orchard

The first direct hit per root lineage queues three generation-one shards centered on the impact heading at `−18°`, `0°`, and `+18°`. Shards deal `20%` current damage, use `55%` radius, and travel `160 px`. A generated bone fan marks the emission. Signature synergies: Tesla Bullets, Coldcaster, Spectral Bullets.

#### 16. Grave Bloom

When a generation-zero projectile expires naturally by range or lifetime rather than collision, it queues six evenly spaced radial spirits. Each deals `18%` current damage, uses `45%` radius, travels `128 px`, and inherits compatible motion/status rules without emissions. A Shotgun transformation explicitly counts as the parent's Grave Bloom point, so the same six spirits appear at the split position alongside the forward pellets. Signature synergies: Halo Chamber, Tesla Bullets, Ghost Sight.

#### 17. Soul Harvester

The first target killed by any damage carrying a root trigger queues two generation-one spirits from the death position. They deal `35%` of the kill context's `originPower`, acquire the two nearest distinct targets within `240 px`, and steer at `3π rad/s`. Direct damage uses the projectile's pre-impact damage as `originPower`; link, status, area, and reactive damage retain the direct source power from which they were derived. A root trigger activates Soul Harvester once, and kills caused by its spirits cannot activate kill reactions. Signature synergies: Wanted Brand, Tesla Bullets, Bonanza Clip.

#### 18. Bootleg Mint

The first wall or prop bounce in a projectile lineage queues one generation-one tangent copy. Stable projectile-ID parity selects `+90°` or `−90°`; the copy deals `30%` current damage, uses `55%` radius, and travels `160 px`. It cannot mint another copy. A silver coin-print VFX appears at the bounce. Signature synergies: Pinball, Tesla Bullets, Ghost Sight.

### Row 4 — Target state and statuses

#### 19. Coldcaster

Each direct hit adds one chill stack, capped at three, and refreshes the shared stack deadline to `now + 2 s`. Three stacks are consumed to freeze the target for `1.05 s`. The first generation-zero direct hit on a frozen target consumes the freeze and queues four cardinal generation-one ice shards at `15%` of the triggering damage, `45%` radius, and `128 px` range. Generation-one hits may add chill and complete a freeze, but they neither consume a frozen state nor emit shatter shards. Freeze halts chasers as today. Signature synergies: Shotgun, Fan the Phantom, Undertaker's Return.

#### 20. Cinder Gospel

A direct hit applies burn with four remaining ticks at `0.4 s` intervals. Each tick deals `10%` of the applying projectile's current damage as status damage and retains that direct damage as `originPower`. Reapplication keeps the higher potency, resets remaining ticks to four, and preserves an already scheduled earlier next tick; a newly applied burn schedules its first tick at `now + 0.4 s`. The first burning target killed by a root trigger emits one `64 px` ember ring for `20%` of the stored origin power. The ring is a depth-one kill reaction and kills caused by it cannot produce more kill reactions. Signature synergies: Shotgun, Hex Bell, Ectoplasm Snare.

#### 21. Wanted Brand

When no live brand exists, the first directly hit live target becomes the single branded target for `3 s`; later hits do not replace it. While branded, generation-zero projectiles steer toward it at `2π/3 rad/s` regardless of initial acquisition distance. On branded-target death, the brand moves to the nearest live target within `240 px` with the remaining duration; otherwise it expires. A generated sheriff-star mark remains visible. Signature synergies: Ghost Sight, Soul Harvester, Widow's Ledger.

#### 22. Widow's Ledger

Direct hits on a target add a ledger notch lasting `2 s`. The fifth notch is consumed and fires one secondary line shot from Ralphy's current position to that target for `120%` of the fifth projectile's direct damage. The line is area damage, cannot miss its living marked target, and cannot proc impacts or emissions. Signature synergies: Twin Chamber, Fan the Phantom, Shotgun.

#### 23. Ectoplasm Snare

The first direct hit per root trigger creates one root-scoped `40 px` pool for `1.5 s`. It ticks at `10 Hz`, deals `4%` of the applying projectile's direct damage per tick as area damage, and applies a `0.50` chaser speed multiplier while inside. Pools do not affect Ralphy. Signature synergies: Hollow Point, Cinder Gospel, Halo Chamber.

#### 24. Hex Bell

Every fourth direct hit globally emits an `80 px` pulse at the impacted target; the counter persists across reloads and resets with the laboratory. The pulse applies a `0.60` chaser speed multiplier for `1 s` and copies the source target's current chill count/deadline and burn potency/remaining-tick count to other targets. Copied burn schedules its next tick at `now + 0.4 s`; copied chill keeps the source's remaining deadline. It does not copy Wanted Brand, Hollow Point charges, Ledger notches, or freeze itself. Multiple slows coexist by taking the smallest active speed multiplier, never by multiplying them. Signature synergies: Coldcaster, Cinder Gospel, Shotgun.

### Row 5 — Relations and fields

#### 25. Spectral Bullets

Preserve obstacle traversal and per-target-once penetration. Room walls remain solid, and returning projectiles may hit each target once on each leg. Signature synergies: Undertaker's Return, Wailing Lead, Grave Bloom.

#### 26. Tesla Bullets

Preserve `+0.33` probabilistic multishot, `8°` generic spread, canonical two-neighbor links inside `96 px`, `25%` lower-endpoint secondary damage, and `0.15 s` arc-target cooldown. Signature synergies: Twin Chamber, Shotgun, Crossfire Covenant.

#### 27. Big Iron

Each generation-zero projectile becomes a heavy main shot at `125%` radius, `120%` direct damage, and `80%` speed, plus one generation-one iron moonlet orbiting it at `14 px`, `6π rad/s`, `50%` radius, and `35%` damage. If both hit the same target within `0.25 s`, the second hit creates one `56 px` kinetic explosion for `50%` main-shot damage and applies a `60 px` knockback impulse. If the main shot disappears first, the moonlet releases tangentially with its remaining lifetime. Signature synergies: Twin Chamber, Comet Spur, Hollow Point.

#### 28. Ghost Posse

At the end of trigger expansion, each root trigger creates one player satellite. A satellite orbits Ralphy at `40 px` for `3 s`; at most six exist. On the next root trigger, every older satellite fires one generation-one copy toward current aim for `20%` current weapon damage and then expires. New satellites do not fire on their creation trigger, and delayed Grave/Deadeye copies do not delay satellite creation. Signature synergies: Tesla Bullets, Coldcaster, Deadeye.

#### 29. Ectoplasmic Wake

Generation-zero projectiles leave one continuous `8 px`-wide trail area along their swept path. Trail segments live `0.8 s`, tick at `10 Hz`, and deal `5%` current projectile damage per tick to each target with a `0.2 s` target cooldown. Rendering uses bounded segment batching rather than one entity per pixel. Signature synergies: Wailing Lead, Halo Chamber, Undertaker's Return.

#### 30. Crossfire Covenant

When two generation-zero friendly swept paths cross, their canonical projectile pair may create one X-shaped area pulse at the intersection. Each projectile participates in at most one Covenant pulse. The two `48 px` diagonals deal `25%` of the lower projectile damage as secondary area damage. The shared spatial graph used for Tesla supplies bounded intersection candidates. Signature synergies: Twin Chamber, Halo Chamber, Tesla Bullets.

### Row 6 — Ralphy, risk, and positioning

#### 31. Recoil Boots

Each root trigger adds a `55 px/s` player impulse opposite current aim without replacing normal input acceleration and creates its own root-scoped recoil window for `0.35 s`. Impulses add to current player velocity. Windows may overlap: when room clamping removes displacement into a boundary, every unrefunded live window whose stored recoil vector points into that boundary returns one ordinary cartridge once under the shared cylinder rules, then closes and plays one generated skid VFX. Windows whose vectors do not point into the blocked boundary remain active until their own timeout. Signature synergies: Last Bell, Bonanza Clip, Deadeye.

#### 32. Stillwater

Maintaining player speed below `1 px/s` for `0.6 s` charges the next trigger. Every generation-zero projectile from that trigger receives `160%` direct damage, `200%` radius, and target/obstacle penetration; the charge is then consumed. Moving or taking damage before firing clears the charge. A growing hat-and-muzzle ward shows progress. Signature synergies: Twin Chamber, Hollow Point, Shotgun.

#### 33. Dustline Duel

At exactly `192 px` travelled distance, a generation-zero projectile gains target and obstacle penetration for the remainder of its life and leaves one stationary afterimage. After `0.12 s`, the afterimage queues one generation-one copy forward for `35%` current damage and `192 px` range. If Shotgun replaces the parent at `160 px`, its pending Dustline token schedules the afterimage at the split point, and each pellet becomes spectral after travelling the remaining `32 px`; pellets do not create additional afterimages. Signature synergies: Halo Chamber, Undertaker's Return, Shotgun.

#### 34. Bonanza Clip

The first kill caused by each root trigger sends a generated gold-soul pickup directly to the HUD cylinder and restores one ordinary cartridge under the shared cylinder rules. The ammo changes when the soul reaches the HUD after `0.25 s`; additional kills from the same trigger do not refund more, and arrival at full capacity has no state effect. Signature synergies: Soul Harvester, Cinder Gospel, Last Bell.

#### 35. Last Gasp Locket

At `40 HP` or lower, every third root trigger converts the highest stable-ID non-bell generation-zero projectile into a protective orbital instead of launching it. If a due trigger contains only Last Bell, the cadence remains armed for the next trigger. The orbital circles Ralphy at `40 px` for `2.5 s`, deals that projectile's direct damage to the first chaser it touches, and is consumed. At most three Locket orbitals exist. The cadence resets when health rises above `40`. Signature synergies: Big Iron, Tesla Bullets, Ghost Posse.

#### 36. Undertaker's Coat

Accepted contact damage leaves a decoy at Ralphy's pre-hit position for `1 s`, extends player invulnerability to `1 s`, and makes chasers target the decoy while it exists. The decoy has no collision health and disappears on timeout; Ralphy keeps normal movement and weapon control. A generated shed-coat silhouette distinguishes it from Ralphy. Existing death still takes precedence and never creates a post-death decoy. Signature synergies: Ectoplasm Snare, Recoil Boots, Last Gasp Locket.

## Runtime State

The minimal new state is explicit and serializable:

- root trigger sequence, six ordered `{ loaded, echo }` cylinder slots, stable `nextSlot`, reload state, and most-recently-emptied slot order;
- scheduled trigger volleys and delayed projectile emissions;
- projectile `generation`, `rootTriggerId`, stable `lineageId`, and activated `effectIds`;
- target chill, burn, Hollow Point charge, Ledger notches, movement slow, and Wanted Brand ownership;
- active areas, decoy, player satellites, protective orbitals, stationary charge, bounded root-scoped recoil windows, and pending Bonanza HUD deliveries;
- pair histories for Tesla and Crossfire Covenant;
- artifact provenance on every direct, status, area, link, and reactive event.

State does not contain a generic event log or arbitrary component map. Closed records are used for the target and player effects declared here.

## Damage, Metrics, and Accuracy

Damage sources expand from `direct | tesla | status` to distinguish `direct | link | status | area | reactive`. Every event records `artifactId`, `effectId`, root trigger, projectile/lineage where present, target, time, position, and first-direct-hit status.

- All valid sources contribute to total, rolling, peak, and per-target DPS.
- Only direct projectile contact changes projectile accuracy.
- Areas, echoes classified as generation-one projectiles, status ticks, rings, X pulses, and Ledger lines never retroactively make an unrelated projectile accurate.
- Every generated projectile increments projectile-created telemetry but not root triggers or cartridges consumed.
- The detail panel and live stats expose active projectile, area, satellite, and descendant counts for stress debugging.

## ImageGen Asset Plan

Use built-in ImageGen with the accepted Ralphy noir pixel-art style anchor. Generate coherent families rather than unrelated single icons:

1. Six trigger/cylinder icons.
2. Six motion icons.
3. Six impact/transformation icons.
4. Six status icons.
5. Six relation/field icons.
6. Six reactive/Ralphy icons.
7. Shared VFX sheets for echo/burst/emission, status/impact, field/link, and reactive cues.

Existing accepted icons may remain only if they still match the enhanced mechanic and the new family visually. Otherwise regenerate them within their row family. Every source family uses flat removable chroma, clean gutters, no text/numbers/logos/watermarks, and no Ralphy body unless the icon specifically represents Ralphy interaction. Runtime icons use one fixed logical square size and transparent padding. VFX are separate from icons.

A local packer slices complete fixed cells, removes chroma, validates alpha and grid occupancy, and builds contact sheets. Accepted runtime PNGs are committed under `public/assets/generated/`; full ImageGen sheets remain ignored under `tmp/imagegen/`.

## Rendering and Reduced Motion

Every artifact has one readable cue, but shared mechanics reuse VFX systems:

- emissions reuse cone/ring/side/delayed-copy flashes;
- motion uses trail textures and fixed anchor markers;
- target state uses generated marks, not text over enemies;
- fields use generated tiled textures stretched or repeated through Canvas geometry;
- links use generated electric/tether texture and canonical endpoints;
- Ralphy reactions use generated sprite/VFX overlays without replacing the current body atlas.

Reduced-motion mode preserves all collision geometry and essential state feedback. It freezes texture phase, removes nonessential flicker, reduces trail persistence, and uses one stable frame for pulses and wards. It never disables an artifact mechanically.

## Error Handling and Validation

Catalog/build validation rejects:

- any catalog length other than `36`, duplicate ID, duplicate grid position, missing family row, missing icon, or absent synergy reference;
- an artifact with no behavioral rule or whose only effect is numeric modification;
- unknown or duplicate exclusive geometric motion kinds;
- non-finite or out-of-range timing, damage, radius, angle, chance, range, count, cooldown, or status potency;
- emission definitions that exceed generation one or worst-case `384` descendants per root trigger;
- areas lasting over `3 s` or ticking over `10 Hz`;
- missing `artifactId/effectId` provenance;
- recursive inheritance of emission or kill-reactive rules;
- runtime non-finite positions, velocities, damage, size, clocks, ammo, counters, or status deadlines.

Unknown targets, removed anchors, expired projectile parents, and dead branded targets detach safely through stable fallback behavior. A missing required ImageGen asset fails preflight rather than rendering homemade production art.

## Performance Contract

The target is correctness and responsiveness, not a synthetic benchmark score. Automated deterministic stress runs must prove:

- all thirty-six owned simultaneously;
- continuous firing and automatic reload for `10 simulated seconds` against five dummies and five chasers;
- no more descendants than the statically validated bound;
- no unbounded growth in projectiles, scheduled emissions, areas, links, pair histories, hit histories, VFX commands, or damage events;
- all finite state and stable cleanup after firing stops;
- identical final state for identical RNG/input sequences.

The Tesla/Crossfire shared spatial candidate pass must not enumerate every pair twice. Trail rendering batches segments. Damage-history pruning remains bounded by the rolling metrics window.

## Carry-Forward Cleanup

Before expanding the catalog, close the three accepted minor findings from the previous branch review:

- a death pose never mirrors when aim changes after death;
- atlas validation explicitly requires death to be the sole held, nonlooping clip;
- the post-death browser regression depletes ammo before death, moves the pointer onto the canvas, and proves dead fire/reload input cannot change that ammo.

## Testing Strategy

### Catalog and compilation

- Exact `36` IDs, positions, rows, icons, quality-bar rules, and valid synergy references.
- Compilation is invariant under permutation of the same owned artifact set.
- All current and temporary build values remain finite.
- Invalid rules, recursive emissions, exclusive-motion conflicts, missing provenance, and descendant overflow fail with useful messages.

### Focused mechanics

- One deterministic signature test per artifact.
- Exact boundary tests for cartridge index, every-third counters, perfect reload, stationary charge, low-health cadence, travel thresholds, status stacks, expiry, cooldowns, and return legs.
- Cylinder tests cover full and partial reload, circular slot order, Last Bell after refunds, Deadeye echo consumption, ordinary-round refunds, full-capacity no-op, refund-during-manual-or-automatic-reload cancellation, same-step automatic-reload/refund ordering, and simultaneous Recoil/Bonanza refunds.
- Recoil tests cover additive impulses, overlapping per-root windows, boundary-direction filtering, one refund per window, timeout pruning, and multiple eligible windows resolving in stable root/effect order.
- Direct tests for each shared trigger, motion, impact, emission, and area primitive.
- Status refresh/maximum-potency behavior and exclusion lists for Hex Bell.
- Generation-one inheritance and explicit non-inheritance of emissions/reactive rules.

### Composition

At minimum cover:

- Twin Chamber + Tesla + Crossfire;
- Deadeye + Grave Echo + Fan the Phantom;
- Halo + Shotgun + Wailing Lead + Ghost Sight;
- Pinball + Bootleg Mint + Undertaker's Return;
- Hollow Point + Bone Orchard + Comet Spur;
- Coldcaster + Cinder Gospel + Hex Bell + Ectoplasm Snare;
- Big Iron + Ghost Posse + Tesla;
- Stillwater + Shotgun + Dustline Duel;
- Soul Harvester + Wanted Brand + Bonanza Clip;
- all thirty-six under the performance contract.

### Browser and visual

- The grid contains exactly 36 keyboard-accessible toggles in six rows and six columns.
- Detail projection, toggle state, Take all, Clear artifacts, and independent scrolling work at both viewports.
- Every required ImageGen icon and shared VFX pack loads; no repeated placeholder or SVG/CSS icon ships.
- Deterministic browser probes observe representative trigger, motion, emission, status, field, and reactive VFX.
- Take all can fire, reload, damage targets, die, reset, and clean up without page errors or non-finite telemetry.
- Fresh `1440 × 900` and `1024 × 768` screenshots pass grid readability, combat-field visibility, HUD clearance, pixel crispness, and detail-panel layout.

## Acceptance Criteria

- The laboratory presents exactly 36 unique artifact tiles as a usable `6 × 6` grid.
- No artifact is merely a numeric stat modifier.
- Every artifact produces its declared mechanic and visible cue alone.
- Familiar Tesla, Shotgun, Spectral, Halo, Ghost, reload, movement, HUD, room, and Ralphy animation contracts remain intact unless explicitly enhanced here.
- Big Iron, Hollow Point, Coldcaster, Twin Chamber, Pinball, and Deadeye match their enhanced behaviors.
- Rule composition is independent of catalog order and deterministic under injected RNG.
- Generation depth is one, no emission recursively retriggers, and Take all satisfies the descendant and cleanup contracts without silent truncation.
- Damage provenance, DPS, accuracy, ammo, status, and kill metrics remain correct across direct and secondary effects.
- All icons and required VFX are accepted ImageGen PNG assets with clean alpha and no temporary production substitutes.
- Unit, simulation, asset, build, full browser, stress, reduced-motion, screenshot, repository-hygiene, and independent review gates pass.
