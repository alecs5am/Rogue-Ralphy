# Ralphy Combat Lab Design

**Date:** 2026-07-18

**Status:** Approved for implementation

## Summary

Build a desktop browser combat sandbox for **Ralphy the Ghost**, the white ghost in a cowboy hat from the canonical Ralphy website assets. The first deliverable is not a full roguelike run. It is a polished test room where the player can move, aim, fire a six-round revolver, grant any number and combination of weapon artifacts, spawn targets or enemies, and inspect live combat telemetry.

The game uses original pixel-art assets generated for this project. The supplied *Binding of Isaac* screenshot is a composition, readability, texture-density, and mood reference only; characters, UI ornament, room dressing, and icons remain original to Ralphy.

## Goals

- Make the core act of moving, aiming, shooting, and reloading feel responsive.
- Make every requested artifact work alone, stack without an inventory cap, and combine predictably with every other artifact.
- Make interactions visually obvious through projectile shape, motion, color, trails, impacts, status indicators, and damage numbers.
- Let a designer build or clear a loadout quickly and spawn useful test targets without restarting the page.
- Expose enough derived stats and damage telemetry to understand what a build is doing.
- Establish a cohesive reusable pixel-art asset pack for later rooms and roguelike progression.

## Non-goals

- Procedural floors, room graphs, bosses, shops, pickups, currencies, run saves, meta-progression, or a win condition.
- Mobile or controller controls in the first prototype.
- Network play, accounts, backend storage, or analytics.
- Audio production beyond optional browser-generated placeholder sounds.
- Exact visual imitation of another game's characters, UI, or room art.

## Visual Direction

The selected direction is **Ralphy Noir Lab in pixel art**:

- Canonical palette: near-black `#0A0A0B`, off-white `#F5F5F4`, and Ralphy orange `#FFA630`.
- Warm, hand-painted pixel textures, imperfect edges, floor wear, wall grime, and readable pools of light.
- A fixed top-down room with shallow three-quarter readability: the floor is seen from above while walls, doors, Ralphy, and props retain a visible front face.
- Gameplay sprites and effects are pixel art. HUD frames and icons are also pixel-textured, while all labels and numbers are real HTML text in a pixel font so telemetry stays crisp and correct.
- Pixels remain sharp under resizing through a fixed logical canvas and nearest-neighbor scaling.
- Flashing and screen shake remain restrained, with reduced-motion support.

## Asset Pipeline

Use the built-in Imagegen path. The canonical Ralphy mascot is the identity reference, and the supplied room screenshot is a style/composition reference rather than an edit target.

1. Generate one landscape master frame that locks palette, texture density, camera angle, lighting, proportions, and silhouette language.
2. Generate the reusable room background and prop textures using that master frame as the style anchor.
3. Generate Ralphy, the revolver, targets, projectiles, effects, and UI pieces in dedicated calls so every output can be cropped and used independently.
4. Request opaque sprite assets on a perfectly flat chroma-key background, remove the key locally, validate alpha, and downscale with nearest-neighbor resampling.
5. Keep generated text out of bitmap assets. Frames, plates, symbols, and icons are images; labels and values are HTML.

The first asset pack contains:

- One empty 16:9 test-room background with a floor, walls, four door recesses, and no characters or UI.
- Reusable obstacle sprites: rock, crate, and lab marker.
- Ralphy directional idle/movement frames that preserve the white ghost body, black oval eyes, and cowboy hat.
- A separate side-view revolver sprite suitable for rotation toward the cursor.
- Bullet, cartridge, muzzle flash, impact, ricochet spark, freeze burst, homing marker, and orbit trail sprites.
- A training dummy and a simple hostile ghost/chaser silhouette.
- HUD plates, a six-round cylinder, stat panels, artifact slots, buttons, and an active-reload bar without embedded text.
- Eight original artifact icons matching the mechanics below.

Final project assets live under `public/assets/generated/`; temporary chroma-key sources and rejected variants do not become runtime dependencies.

## Screen Layout

The viewport is desktop-first and has two functional areas:

- The room occupies the available center/left area and preserves a 16:9 gameplay canvas.
- A fixed laboratory dock on the right contains artifacts, target spawning, room controls, and detailed stats. It may scroll independently on shorter screens.

The in-game HUD overlays only essential combat information:

- Health and current six-round cylinder near the upper edge.
- A centered reload bar along the bottom edge while reloading.
- Temporary damage numbers, status marks, active-reload feedback, and short buff timers inside the room.

The laboratory dock contains:

- Artifact cards with `−`, count, and `+` controls.
- `Give all ×1`, `Clear artifacts`, and `Reset lab` actions.
- Spawn actions for one dummy, one chaser, and a five-enemy wave, plus `Clear targets`.
- A live derived-stat table and combat telemetry.

## Controls

- `WASD`: move Ralphy.
- Mouse position: aim.
- Left mouse button: fire while held, limited by fire rate and ammunition.
- `R`: begin a manual reload when the cylinder is not full; during a Deadeye reload window, press again to attempt an active reload.
- `Escape`: pause/resume the simulation and release pointer interaction.

Movement remains available during reload. Ralphy cannot fire until the cylinder is refilled, although bullets already orbiting or in flight continue to simulate.

## Base Player and Revolver

- Health: `100`.
- Move speed: `240 logical pixels/second`.
- Contact invulnerability: `0.5 seconds` after taking damage.
- Cylinder capacity: `6` rounds.
- Damage: `20` per projectile before modifiers.
- Fire rate: `3 shots/second`.
- Projectile speed: `620 logical pixels/second`.
- Projectile radius: `5 logical pixels`.
- Reload duration: `1.5 seconds`.
- Base shot: one projectile, no spread, bounce, freeze, homing, or orbit.

One trigger event consumes one round regardless of how many projectiles or orbital copies artifacts create.

## Reload and Active Reload

Reload begins automatically as soon as the sixth shot empties the cylinder. The player may also press `R` to reload early. A bottom progress bar is visible for the full `1.5-second` reload. At completion the cylinder returns to six rounds.

Without the Deadeye artifact, pressing `R` again during reload has no effect. With at least one Deadeye stack, an orange timing zone appears inside the progress bar:

- Pressing `R` inside the zone immediately completes the reload and grants a temporary fire-rate buff.
- Pressing outside the zone does not cancel or restart reload and applies no punishment; the normal reload continues.
- The first stack gives a `12%`-wide timing zone. Further stacks widen it by `3 percentage points` up to `45%`.
- Every stack continues to matter after the width reaches its usability ceiling: the buff grants `+20%` fire rate per stack and lasts `2 + 0.25 × stacks` seconds.

Successful active reload feedback includes a short orange bar flash, a compact `QUICKDRAW` label, and the remaining buff duration.

## Artifact Model

Artifact counts are non-negative integers with no inventory cap. The laboratory permits any artifact combination and any practical stack count. Counts are never silently normalized to a design maximum. Derived numeric values must remain finite; an invalid edited value is rejected rather than corrupting the simulation.

| Artifact | One-stack behavior | Stacking behavior |
| --- | --- | --- |
| **Twin Chamber** | Adds a second projectile to each trigger | Projectile count is `1 + stacks`; projectiles are distributed evenly across a spread arc that grows by `8°` per stack up to `110°` |
| **Big Iron** | Enlarges every projectile | Radius multiplier is `1 + 0.25 × stacks`; collision and visuals use the same derived radius |
| **Hollow Point** | Increases projectile damage | Damage multiplier is `1 + 0.35 × stacks` |
| **Coldcaster** | Adds a freeze roll and icy impact | Freeze chance is `min(100%, 25% × stacks)`; duration is `0.8 + 0.25 × stacks` seconds, so stacks remain useful after chance reaches 100% |
| **Pinball** | Grants one wall/enemy ricochet | Remaining bounces equal stacks; each bounce retains `90%` of the projectile's current damage and reflects from the collision normal |
| **Deadeye** | Enables the active-reload timing zone and buff | Uses the window and buff formulas in the reload section |
| **Halo Chamber** | Holds fired projectiles in an orbit for `0.9 seconds`, then launches them toward the current aim direction | Each extra stack adds one orbital copy per trigger and `10 logical pixels` to ring radius; copies are distributed evenly |
| **Ghost Sight** | Makes projectiles steer toward a nearby target | Adds `180°/second` turn rate and `40 logical pixels` acquisition radius per stack; target loss returns the projectile to its current heading |

## Modifier Order and Combinations

Every trigger is built in a fixed order so combinations remain explainable:

1. Read base weapon values and temporary buffs.
2. Twin Chamber determines the primary projectile count and spread headings.
3. Halo Chamber converts those projectiles into an even ring and adds its extra orbital copies.
4. Big Iron, Hollow Point, and Coldcaster attach geometry, damage, and status values to every resulting projectile.
5. Ghost Sight updates steering every simulation step after a projectile launches.
6. Pinball resolves collisions, reduces damage, reflects velocity, and allows Ghost Sight to acquire a new target.

Expected signature combinations include:

- Twin Chamber + Halo Chamber: a dense, evenly spaced ring whose bullets launch together.
- Halo Chamber + Ghost Sight: launched orbiters curve into separate nearby targets.
- Pinball + Ghost Sight: every bounce can bend toward a new target instead of continuing as a blind reflection.
- Big Iron + Pinball: large pinball-like projectiles with visibly larger collision footprints.
- Coldcaster + Pinball: one shot can freeze several targets over successive impacts.
- Hollow Point + Deadeye: accurate active reloads create a short high-DPS burst without changing damage accounting.
- All artifacts: a large freezing homing ring launches after orbit, ricochets, and can be sustained faster by successful active reloads.

## Targets and Enemies

### Training dummy

- Stationary, does not attack, and can be spawned repeatedly.
- Has effectively unlimited test health until cleared.
- Shows damage numbers, status state, damage taken, and its own rolling DPS.

### Chaser

- Moves directly toward Ralphy at a readable speed.
- Takes damage, can freeze, and deals contact damage.
- Dies normally and contributes to accuracy, kill, and damage metrics.

### Wave

- Spawns five chasers at valid room-edge points.
- Never places a target inside Ralphy, another target, or a wall.

## Statistics and Telemetry

The derived-stat panel shows current values after artifacts and temporary buffs:

- Health, movement speed, loaded rounds, and reload duration.
- Damage, fire rate, projectile count, spread, size, speed, lifetime, and orbit delay/radius.
- Bounce count and retained damage.
- Freeze chance and duration.
- Homing turn rate and acquisition radius.
- Active-reload window, buff magnitude, and remaining buff duration.

Combat telemetry shows:

- Rolling three-second DPS.
- Peak rolling DPS since the last metric reset.
- Total damage, trigger pulls, projectiles created, hits, misses, accuracy, kills, and active projectile count.
- Per-dummy total damage and rolling DPS.

Changing artifacts updates derived stats immediately but does not erase combat metrics. `Reset metrics` is a separate explicit action.

## Architecture

Use Vite, TypeScript, Bun, DOM/CSS, and the Canvas 2D API. Do not add a game engine or UI framework for this room.

The code is divided by responsibility:

- **State and simulation:** player, weapon, reload, projectiles, targets, collisions, status effects, and fixed-timestep updates.
- **Artifact derivation:** pure functions that turn base stats plus artifact counts into one immutable derived weapon snapshot.
- **Shot construction:** a pure builder that applies the documented modifier order and returns projectile specifications.
- **Rendering:** room background, sprites, effects, HUD overlays, and nearest-neighbor scaling.
- **Input:** keyboard and pointer state translated into movement, aim, fire, reload, and pause intents.
- **Metrics:** timestamped damage/hit events and rolling-window summaries.
- **Laboratory UI:** artifact controls, spawn/reset actions, and projection of state/metrics into HTML.
- **Assets:** a manifest with load status and named image references.

This is deliberately not an entity-component system. Plain typed objects and arrays are sufficient for one room and keep modifier behavior easy to inspect.

## Data Flow

1. Input and laboratory controls enqueue intents for the next simulation update.
2. Artifact changes recompute the derived weapon snapshot from base values and counts.
3. A fire intent consumes one round and asks the shot builder for projectile specifications.
4. The fixed-timestep simulation moves entities, advances reload/orbit/status timers, and resolves collisions.
5. Collision results mutate target health/status and append timestamped metric events.
6. Canvas rendering reads the latest simulation snapshot; the DOM dock reads derived stats and metric summaries.

The simulation owns gameplay truth. Canvas and DOM never independently calculate weapon behavior.

## Failure Handling

- A missing generated asset produces a visible diagnostic placeholder and lists the missing manifest key in the laboratory dock; it does not leave an invisible entity.
- Artifact controls accept only finite non-negative integers.
- Homing without a valid target preserves the projectile's current direction.
- Projectiles are removed when their lifetime expires or after leaving the extended room bounds.
- Spawns are rejected when no valid non-overlapping point exists.
- Resizing never changes simulation coordinates or collision geometry.
- Switching tabs pauses simulation time so reload and DPS windows do not jump forward unexpectedly.

## Testing

Use Bun's built-in TypeScript test runner for pure logic and Playwright for one browser smoke path.

Unit tests cover:

- Every artifact's one-stack and multi-stack formula.
- The fixed modifier order and representative pair/all-artifact combinations.
- One-round consumption for multi-projectile and orbital shots.
- Automatic empty-cylinder reload, early manual reload, timing-zone miss, timing-zone success, and temporary buff expiry.
- Reflection, bounce depletion, freeze duration, homing acquisition/loss, and orbit release.
- Rolling DPS window, peak DPS, accuracy, and reset behavior.
- Invalid artifact counts and projectile cleanup.

The browser smoke test loads the room, grants an artifact, spawns a dummy, fires, empties the cylinder, observes the reload bar, and confirms that damage and DPS appear without console errors.

Visual verification includes screenshots at desktop and reduced viewport sizes, checking sharp pixel scaling, room/UI separation, generated-asset transparency, and readable telemetry.

## Acceptance Criteria

- The page opens directly into the test room and is playable with keyboard and mouse.
- Ralphy is recognizable as the canonical white ghost in a cowboy hat.
- The revolver begins with six visible loaded rounds and automatically reloads in `1.5 seconds` after emptying.
- The reload bar is visible at the bottom, and Deadeye active reload works exactly as specified.
- All eight artifacts can be granted together and stacked without an inventory limit.
- The documented signature combinations are visibly and mechanically present.
- Dummy, chaser, and wave spawning work without a page reload.
- Derived stats and rolling/peak DPS update from the same simulation state used by combat.
- Generated room, character, weapon, effects, icons, and HUD pieces share one coherent pixel-art direction.
- Unit tests, production build, and the browser smoke test pass with no console errors.
