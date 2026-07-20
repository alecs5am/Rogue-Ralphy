# Playable Demo Polish Design

## Goal

Turn the existing arena run into a short, readable demo that always fits the browser, has obvious navigation and rewards, and ends with a distinct boss fight.

## Screen and Navigation

- Keep the logical `960×576` camera and the larger `1600×960` arena.
- Fit the canvas inside the available browser area at every desktop aspect ratio; never crop the DOM canvas.
- Keep a visible `Menu` control during run and laboratory modes.
- Escape opens a pause panel with Resume, Restart, and Main menu actions.
- Death and run completion reuse the same panel with Retry/Play again and Main menu actions.

## Rewards

- Every wave starts with two fixed, valid crate positions before enemies are placed, so both crates are guaranteed to exist.
- Destructible crates use the dedicated crate sprite, a gold outline, a health bar, and a minimap marker distinct from stone blocks.
- Every destroyed crate drops one micro-upgrade. The marked bonus enemy also drops one.
- Bonus enemies have a gold ring and `BONUS` label.
- Pickups pulse with a gold halo and a short label. Collection shows a large temporary message describing the exact gain.

## Boss

- Wave 6 is labeled as the boss wave and shows a full-width boss health bar.
- The Dead Sheriff has `1,800` HP and three health-driven phases.
- Phase 1 fires aimed three-shot fans.
- Phase 2 alternates aimed five-shot fans with eight-shot radial bursts.
- Phase 3 attacks faster, alternates seven-shot fans with twelve-shot radial bursts, and moves more aggressively.
- A visible ring around the boss telegraphs an imminent volley. Boss projectiles are larger and visually distinct.
- The boss postpones a volley while outside the player camera, then waits through a visible `0.45`-second on-screen windup before firing.

## Verification

- Unit tests cover guaranteed crate rewards, pickup notices, and phase-specific boss volleys.
- Browser tests cover viewport fit at ultrawide and tall sizes, menu/pause/restart navigation, visible reward cues, and the boss HUD.
- Final verification runs unit tests, production build, Playwright, diff check, and a visual screenshot inspection.
