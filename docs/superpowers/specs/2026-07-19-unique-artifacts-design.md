# Unique Artifact Loadout

## Goal

Make artifacts behave like unique Isaac items: each artifact is either owned or absent, and a loadout may contain all eight different artifacts but never multiple copies of one artifact.

This specification supersedes every stacking and multi-copy requirement in `2026-07-18-ralphy-combat-lab-design.md`.

## State Model

- Replace numeric artifact counts with boolean ownership.
- `ArtifactLoadout` is a partial record whose only stored value is `true`.
- `setArtifact(state, id, enabled)` adds or removes one unique artifact.
- Runtime input that supplies a non-boolean artifact value is rejected rather than interpreted as a count.
- All eight different artifact identifiers may be enabled together.

## Fixed Artifact Effects

| Artifact | Effect while owned |
|---|---|
| Twin Chamber | Two projectiles per trigger over an `8°` spread |
| Big Iron | Projectile radius multiplier `1.25` |
| Hollow Point | Damage multiplier `1.35` |
| Coldcaster | `25%` freeze chance for `1.05` seconds |
| Pinball | One ricochet retaining `90%` current damage |
| Deadeye | Active window `12%`; successful reload grants `+20%` fire rate for `2.25` seconds |
| Halo Chamber | Orbit for `0.9` seconds at radius `30`, then launch toward current aim |
| Ghost Sight | Turn rate `180°/second` and acquisition radius `40` |

One trigger still consumes one round. Different artifacts continue to compose in the established modifier order. Halo Chamber no longer creates stack-derived orbital copies, so `orbitExtraCopies` and the impractical-shot allocation guard are removed.

## Laboratory UI

- Each artifact card has one real button.
- The button reads `Take <name>` while absent and `Remove <name>` while owned.
- Numeric counters, `+`/`−` controls, and Shift-click behavior are removed.
- `Give all ×1` becomes `Take all`; it grants every absent artifact exactly once.
- `Clear artifacts` removes all artifacts.
- Active cards retain their orange selected treatment.
- Artifact descriptions state their fixed effects and do not mention stacks.

Removing items is a laboratory-only convenience. A future run/pickup system may make collected items permanent without changing weapon derivation.

## Testing

- Unit tests cover absent and owned states for every fixed effect.
- Invalid non-boolean ownership values are rejected at runtime.
- Pair and all-artifact tests prove composition without duplicate copies.
- Simulation tests use boolean `setArtifact` calls and prove re-taking an owned artifact cannot strengthen it.
- Browser tests take, remove, take all, and clear artifacts; no stack counter or stepper remains.
- Existing reload, projectile, metrics, responsive, and asset-loading contracts remain green.

## Out of Scope

- Item pools, random drops, pedestals, rerolls, or pickup animations.
- Run persistence and permanent/non-removable pickups outside the laboratory.
- Adding replacement mechanics for removed multi-stack bonuses.
