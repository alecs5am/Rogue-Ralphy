# Ralphy Arsenal and Animation Redesign

**Date:** 2026-07-19

**Status:** Design approved; written specification pending final review

## Summary

Replace the visually overlapping Tesla multishot, omnidirectional short-range Shotgun bloom, oversized conventional bullet, generic revolver, and static Ralphy poses with one coherent combat presentation. Ralphy remains a cowboy ghost and keeps a revolver, but the weapon is redesigned for his chibi proportions and fires round luminous “musket soul” projectiles. Tesla procs become spatially visible, Shotgun pellets form a longer forward cone and become physically smaller, and Ralphy receives deterministic idle, movement, firing, reload, hurt, and death animation states generated as consistent pixel-art sheets with ImageGen.

This slice changes existing mechanics and presentation. It does not add more artifacts, procedural rooms, progression, enemy families, or a general animation framework.

## Relationship to Earlier Specifications

This document preserves the scalable artifact engine, unique ownership, six-round automatic reload, Deadeye timing, fixed-step simulation, room dimensions, HUD, and source-aware metrics from the earlier specifications.

It supersedes these approved details from `2026-07-19-scalable-artifact-effects-design.md`:

- Tesla’s additional projectile may no longer share the exact primary trajectory.
- Shotgun child range changes from `128 px` to `320 px`.
- Shotgun damage changes from `35%` to `25%` per child.
- Shotgun child radius becomes `55%` of the parent radius.
- Shotgun changes from a `360°` bloom to a `48°` forward cone.
- Halo plus Shotgun no longer forms an omnidirectional rosette; its cone launches around the parent projectile’s instantaneous direction before resuming its fixed-origin spiral.
- The current eight static Ralphy images, generic revolver image, and conventional elongated bullet cease to be runtime presentation assets.

Tesla’s multishot remains a chance-based scalar exactly as previously approved: base `1.00`, Tesla `+0.33`, no accumulator or pity system.

## Goals

- Make every successful Tesla extra-projectile roll readable as two distinct projectiles and a non-zero arc.
- Let Shotgun reach normal combat distances while behaving like a forward shotgun cone.
- Make Shotgun children visibly and physically smaller than their parent.
- Preserve composition with Halo, Ghost, Spectral, Tesla, Pinball, Coldcaster, Big Iron, and Hollow Point.
- Make Ralphy read as a detailed original chibi cowboy ghost at the existing one-tile scale.
- Give firing, reloading, taking damage, and death clear authored animation feedback.
- Keep animation state deterministic and directly testable from simulation timestamps.
- Generate all new character, weapon, and projectile artwork with ImageGen; do not substitute SVG or CSS-drawn production art.

## Non-goals

- The deferred expansion to approximately 50 passive artifacts.
- Replacing Canvas 2D, Vite, TypeScript, the fixed-step loop, or the current laboratory layout.
- Bone animation, skeletal rigs, interpolation trees, animation blending, or a general-purpose animation engine.
- Eight independently authored aim directions. Three views are authored and one side is mirrored.
- Weapon pickups, alternate guns, ammo types, or resource economy.
- A respawn flow, results screen, or run-over screen. The laboratory reset remains the recovery action after death.

## Combat Mechanics

### Tesla Bullets: visible probabilistic multishot

Tesla Bullets retains two effects:

1. Add `+0.33` to the multishot scalar.
2. Attach the existing Tesla-link behavior.

It additionally contributes the existing generic `spread` effect with a total width of `8°`. On a successful base-revolver roll, two projectiles are distributed at `aim − 4°` and `aim + 4°`. They begin at the same muzzle but immediately diverge, so they are visually distinct and their Tesla link has non-zero length after movement.

The chance rule does not change:

- A roll below `0.33` creates two projectiles.
- A roll at or above `0.33` creates one projectile.
- Every trigger rolls independently and consumes exactly one cartridge.
- No fractional remainder is accumulated.

Spread effects remain additive. Twin Chamber plus Tesla therefore derives `2.33` multishot and `16°` total spread: two guaranteed projectiles, a `33%` chance of a third, and even headings across the full derived spread. Halo still assigns full-circle primary phases because its fixed-origin orbital launch owns primary phase placement; those projectiles are already spatially distinct.

### Shotgun: longer directional cone

The `SplitBehavior` descriptor adds two generic fields:

```ts
type SplitBehavior = Readonly<{
  distance: number;
  count: number;
  childRange: number;
  damageScale: number;
  fanAngle: number;
  radiusScale: number;
}>;
```

Shotgun uses:

- Split distance: `160 px`.
- Child count: `8`.
- Child range after splitting: `320 px`.
- Total path budget before a wall: `480 px`.
- Cone width: `48°`.
- Child damage: `25%` of the parent’s current damage.
- Child radius: `55%` of the parent’s current radius.

At split time, `heading` is the parent projectile’s instantaneous velocity heading. Child `i` receives:

```ts
heading - fanAngle / 2 + fanAngle * i / (count - 1)
```

For eight children this produces angles from `−24°` to `+24°` relative to the parent in approximately `6.857°` increments. The children start at the exact parent collision/split position, keep the parent speed, and expire after travelling `320 px`.

The scale is applied to current parent values. With the base weapon, child radius is `5 × 0.55 = 2.75 px` and child damage is `20 × 0.25 = 5`. Big Iron yields `6.25 × 0.55 = 3.4375 px`; Hollow Point yields `27 × 0.25 = 6.75` damage.

Children inherit compatible Tesla, Ghost, Spectral, Halo, freeze, and remaining-bounce behavior. They remove the split descriptor and can never recursively split from the same Shotgun artifact.

### Signature combinations after the redesign

- **Tesla + Shotgun:** the forward pellet cone creates a bounded electrical web.
- **Shotgun + Ghost:** each smaller pellet acquires independently inside the existing Ghost radius.
- **Shotgun + Spectral:** the parent and forward cone pass through cover and different targets.
- **Shotgun + Halo:** the cone centers on the parent spiral’s instantaneous velocity. Children physically launch through the `48°` cone on their first step, synchronize to the same immutable shot origin, then resume the outward spiral with varied angular speeds. No child teleports and no `360°` rosette remains.
- **Shotgun + Big Iron:** parent and children grow compositionally, while the children remain `55%` of the modified parent.
- **Shotgun + Hollow Point:** child damage scales from the already modified parent damage.

## Character and Weapon Art Direction

### Ralphy

Ralphy remains an original white ghost in a cowboy hat. The redesign increases detail without changing identity:

- Chibi proportions with a large readable head and compact body.
- Two vertical black eyes with state-specific blink, squint, hurt, and death expression changes.
- Small mitten-like ghost hands for recoil and reload poses.
- A clearer hat brim, crown, and restrained orange hat-band accent.
- A readable scalloped ghost tail with secondary motion during movement.
- Near-black pixel outline, warm ivory body, restrained orange accent, and cyan only for supernatural effects.
- No mouth, legs, realistic anatomy, copied Isaac features, text, logo, or watermark.

Ralphy remains approximately one `64 px` room tile tall in gameplay and renders at the current `80 × 80` destination box so the collision radius and room scale do not change.

### Revolver

The new revolver is a compact supernatural six-shooter designed around Ralphy’s hand and silhouette:

- Short barrel and oversized readable cylinder.
- Ivory metal, dark iron, restrained orange chamber glow.
- Transparent padding around one right-facing weapon.
- A stable handle pivot used for continuous cursor rotation.
- No baked hand or character body in the weapon sprite.

Firing uses a separate ImageGen muzzle-flash sprite plus deterministic procedural recoil. Reload uses the authored Ralphy hand poses and a small procedural cylinder rotation rather than baking every gun angle into body frames.

### Round soul projectile

The conventional elongated bullet becomes one round “musket soul” sprite:

- Bright ivory core, dark readable rim, small restrained cyan spectral glow.
- Circular silhouette that remains recognizable without rotation.
- Base rendering continues to derive size from physical projectile radius.
- Shotgun children use the same sprite at their `55%` physical radius.
- Spectral projectiles retain the existing generated ghost trail behind the round solid core.

The six HUD ammo slots remain six-round cylinder indicators. Their current generated cartridge tiles do not need replacement in this slice because they communicate capacity rather than world-projectile shape.

## Animation Model

### Authored views and atlas

Author three views: `down`, `up`, and `side-left`. Runtime mirrors `side-left` for `right`. This minimizes ImageGen identity drift while preserving the current four-direction aim language.

The normalized runtime atlas uses `128 × 128` cells, twelve columns, and six rows (`1536 × 768`):

| Row | State | Down | Up | Side-left | Timing |
|---|---|---|---|---|---|
| 0 | Idle | columns `0–1` | `4–5` | `8–9` | `450 ms` each, loop |
| 1 | Move | `0–3` | `4–7` | `8–11` | `100 ms` each, loop |
| 2 | Fire | `0–1` | `4–5` | `8–9` | `60 ms` recoil, `100 ms` recover |
| 3 | Reload | `0–2` | `4–6` | `8–10` | sampled at `0%`, `33%`, `66%`; hold final |
| 4 | Hurt | `0` | `4` | `8` | `180 ms`; invulnerability flash may continue |
| 5 | Death | universal columns `0–3` | — | — | `100`, `100`, `140`, then hold final |

Unused cells are fully transparent. Every authored frame uses the same cell scale and body anchor at `(64, 74)` in cell coordinates. Frames are never independently alpha-cropped or recentered.

### Runtime state selection

```ts
type Facing = "down" | "up" | "left" | "right";
type AnimationState = "idle" | "move" | "fire" | "reload" | "hurt" | "death";
type AtlasFrame = { col: number; row: number; durationMs: number };
type RalphyPose = {
  state: AnimationState;
  facing: Facing;
  frame: AtlasFrame;
  flipX: boolean;
  bodyRecoil: number;
  gunRecoil: number;
  gunSpin: number;
};
```

State precedence is fixed:

```text
death > hurt > reload > fire > move > idle
```

Simulation exposes only presentation timestamps:

- `lastShotAt` updates when a trigger successfully spawns projectiles.
- `lastHurtAt` updates when Ralphy takes contact damage.
- `diedAt` is set once when health reaches zero.
- Existing `reload.startedAt` and `reload.completesAt` drive reload progress.

All timestamps use the simulation's existing seconds-based clock. Atlas durations are declared in milliseconds for readability and converted at the pure pose-selection boundary; rendering does not introduce a second clock.

A pure `selectRalphyPose(state, reducedMotion)` function selects the state and atlas cell. Facing continues to use the dominant aim axis. `right` selects the side cells with horizontal mirroring.

Reduced-motion mode keeps gameplay unchanged, uses the first idle/move frame instead of looping secondary motion, disables nonessential bobbing, and still shows one fire, reload, hurt, or death pose so essential feedback remains visible.

### Death behavior in the laboratory

Player health clamps at zero. Once dead:

- Movement, firing, and reload input are ignored.
- Existing world projectiles and targets may continue updating.
- Additional contact cannot reduce health below zero or restart the death animation.
- The final death frame remains until `Reset lab` creates a fresh state.

No results overlay, respawn timer, or persistence is added.

## ImageGen Asset Pipeline

Use the built-in ImageGen tool. The canonical website mascot is a subject reference; the current Ralphy sheet and room/style anchor are pixel-style and scale references.

Required references:

- `public/assets/generated/style-anchor.png`
- `public/assets/generated/room.png`
- `tmp/imagegen/ralphy-source.png`
- `/Users/maximovchinnikov/github/ralphy/ralphy-web/public/assets/ralphy-mascot.svg`, rendered locally to PNG before use

Generate four coherent source families:

1. Motion sheet: idle and movement frames for the three authored views.
2. Action sheet: fire, reload, and hurt frames for the same views.
3. Death strip: four universal frames.
4. Weapon/effect sheet: compatible revolver, round soul projectile, and muzzle flash.

Every prompt repeats these invariants:

- Same Ralphy identity, hat, body width, outline weight, palette, cell scale, and foot baseline.
- Original chunky noir pixel art readable at `80 px` gameplay scale.
- Exact flat `#00ff00` removable background, clean gutters, no shadows or green inside sprites.
- No text, letters, numbers, logo, watermark, scenery, or extra objects.
- Body sheets contain no gun; the weapon sheet contains no character body.

Later ImageGen calls use the accepted motion sheet as an additional reference to reduce drift. Do not generate forty unrelated images.

Extend the existing local atlas tooling only as much as necessary to preserve complete grid cells, common scale, and baseline while removing chroma and packing the normalized `12 × 6` runtime atlas. The processor must not independently crop or center animation silhouettes. Runtime outputs are committed under `public/assets/generated/`; full-resolution source sheets remain ignored under `tmp/imagegen/`.

The old static Ralphy and revolver files may remain on disk for history, but their manifest keys are removed and they are not runtime dependencies.

## Rendering and Data Flow

1. Fixed-step simulation updates movement, firing, reload, damage, death, and the three presentation timestamps.
2. `selectRalphyPose` reads only deterministic state and current time.
3. Renderer draws one source cell from the Ralphy atlas into the existing `80 × 80` destination box.
4. Renderer applies horizontal mirroring only for the right-facing side pose.
5. The separate revolver rotates toward aim, then applies pose recoil/spin offsets.
6. The round soul sprite renders at the radius-derived destination size; it is not direction-rotated.
7. Existing artifact trails, arcs, markers, bursts, impacts, HUD, and metrics render around these new base sprites.

No DOM animation library, new dependency, skeletal transform system, or duplicate simulation clock is introduced.

## Error Handling and Validation

- New animation, revolver, soul-ball, and muzzle-flash keys are required assets and participate in startup preflight.
- Atlas validation rejects incorrect logical dimensions, nontransparent outer corners, surviving green spill, and cells outside the declared grid.
- Animation definitions validate cell bounds, positive durations, nonempty clips, and exactly one nonlooping held death clip.
- Split validation requires `0 < fanAngle ≤ 2π` and `0 < radiusScale ≤ 1`, in addition to existing distance/count/range/damage checks.
- Nonfinite timestamps or projectile sizes fail deterministic unit checks rather than silently reaching rendering.
- If ImageGen produces inconsistent scale, baseline, merged gutters, unreadable silhouettes, or identity drift, regenerate the affected source family before integration; do not repair it with handwritten replacement art.

## Testing Strategy

### Tesla regression

- Inject a roll below `0.33`; assert two headings at `aim ± 4°` for Tesla alone.
- Inject a roll at or above `0.33`; assert one projectile and no accumulator.
- Advance the successful pair; assert distinct positions and a Tesla link with `0 < distance ≤ 96`.
- Cover Twin Chamber plus Tesla additive spread and multishot boundaries.

### Shotgun regression

- Assert exact split distance `160`, child range `320`, damage scale `0.25`, and radius scale `0.55`.
- Assert eight evenly spaced headings inside the `48°` forward cone and none behind the parent.
- Assert base, Big Iron, and Hollow Point child radius/damage values.
- Assert children inherit Tesla/Ghost/Spectral/Halo/status/bounce behavior and cannot split recursively.
- Assert Halo children physically take the cone-shaped first step, preserve the immutable origin, and then continue expanding.

### Animation regression

- Unit-test every state boundary and precedence rule.
- Assert idle/move loops choose exact cells at deterministic timestamps.
- Assert fire lasts `160 ms`, hurt lasts `180 ms`, and reload uses existing progress.
- Assert death disables player intent, sets `diedAt` once, clamps health at zero, and holds the final cell until reset.
- Assert right-facing poses mirror side-left without a separate asset.
- Assert reduced motion selects stable frames without changing combat state.

### Browser and visual regression

- Required asset preflight loads the new atlas, revolver, soul ball, and muzzle flash with no old runtime keys missing.
- A deterministic browser shot shows the fire pose, round projectile, and recoil.
- Emptying the cylinder shows reload progression; a chaser impact shows hurt state.
- Tesla and Shotgun laboratory telemetry shows `1.33×`, `8°`, `160 px`, `8`, `320 px`, `48°`, and `55%` size.
- Existing all-five normal/reduced-motion flows remain mechanically green after updated expectations.
- Fresh `1440 × 900` and `1024 × 768` screenshots confirm one-tile Ralphy scale, crisp atlas rendering, readable soul projectiles, unobscured HUD, and independently scrolling laboratory.

## Acceptance Criteria

- Tesla retains chance-based `+0.33` multishot and every successful extra projectile visibly diverges from the primary.
- Shotgun creates eight smaller projectiles in a `48°` forward cone after `160 px`; they travel another `320 px` at `25%` damage and `55%` radius.
- No Shotgun child travels behind the parent solely because of the split pattern.
- Halo, Ghost, Spectral, Tesla, damage, size, freeze, and bounce combinations preserve their declared behavior.
- The generic elongated bullet and oversized revolver are no longer rendered.
- Ralphy has functioning idle, move, fire, reload, hurt, and death states with deterministic precedence.
- The new chibi Ralphy, compatible revolver, round soul projectile, and muzzle flash are accepted ImageGen PNG assets with stable scale and transparent backgrounds.
- No handwritten SVG, CSS character art, or independently cropped jittering animation frame ships as a substitute.
- Unit tests, TypeScript production build, asset preflight, full Playwright suite, screenshot inspection, and repository hygiene checks all pass.
