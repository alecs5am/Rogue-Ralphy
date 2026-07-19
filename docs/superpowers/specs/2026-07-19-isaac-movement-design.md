# Isaac-Style Movement Design

## Goal

Give Ralphy the weighted movement feel described for *The Binding of Isaac*: strict keyboard directions, equal cardinal and diagonal top speed, and a short linear acceleration/deceleration period.

## Existing Behavior to Preserve

- WASD produces only the eight cardinal/diagonal directions plus idle.
- The fixed simulation step remains `1 / 120` seconds.
- Maximum player speed remains `240 px/s`.
- The player remains clamped inside the `13 × 7` walkable field using the existing collision radius.
- Pausing leaves simulation state unchanged; resetting the lab creates a fresh player.

## Movement State

`PlayerState` gains `vx` and `vy`, both initialized to `0`. They are simulation state rather than render-only state so movement stays deterministic and testable.

The telemetry value labelled `Move speed` continues to show the configured maximum speed (`240 px/s`), not instantaneous velocity.

## Input and Target Velocity

The existing integer WASD intent remains unchanged:

- each axis is `-1`, `0`, or `1`;
- simultaneous axes represent the four diagonals;
- opposite keys on one axis cancel to `0`.

Before calculating target velocity, normalize any input vector whose magnitude exceeds `1`. The target velocity is the normalized direction multiplied by `240 px/s`. Therefore cardinal and diagonal movement have the same top speed.

The input target is restricted to eight directions. While turning or reversing, inertia may temporarily carry the actual velocity through an intermediate heading; this is the intended hybrid of digital input and slippery motion.

## Acceleration and Deceleration

Velocity moves linearly toward target velocity with a vector `moveToward` operation. Both acceleration and friction are `800 px/s²`, because `240 / 0.3 = 800`.

- From rest, held input reaches `240 px/s` in exactly `0.3 s`.
- Releasing all movement keys reaches rest from full speed in exactly `0.3 s`.
- Reversing from full speed to the opposite full speed takes `0.6 s`: `0.3 s` to stop and `0.3 s` to accelerate the other way.
- The velocity change per simulation step is capped at `800 × dt`, so it cannot overshoot the target.

This is linear vector convergence, not exponential interpolation. It reaches exact rest and exact top speed and behaves identically across normalized directions.

## Position and Walls

Each simulation step integrates position using the newly calculated velocity, then applies the existing radius-aware room clamp.

If clamping blocks movement on an axis, set that velocity component to `0`. Preserve the unblocked component so Ralphy slides along a wall without storing invisible velocity into it.

No obstacle collision, knockback, dash, animation blend tree, or movement-stat artifact is added in this scope.

## Rendering

The renderer's `moving` flag is derived from actual velocity rather than currently pressed keys. Ralphy therefore keeps the moving animation while coasting and returns to idle only after velocity reaches zero. Reduced-motion behavior remains unchanged.

## Verification

Unit tests cover:

- zero initial velocity;
- linear acceleration to half speed after `0.15 s` and full speed after `0.3 s`;
- equal cardinal and diagonal speed;
- linear deceleration to half speed and then rest;
- reversal timing;
- radius-aware clamping on all walls with only the blocked velocity component cleared;
- pause preserving velocity and reset restoring zero velocity.

The existing browser suite must continue to pass. A manual browser check holds and releases a movement key and confirms that Ralphy continues briefly after release, then settles, without leaving the room.
