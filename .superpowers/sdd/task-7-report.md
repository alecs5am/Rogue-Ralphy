# Task 7 Report — Exact Compositions and All-Artifact Stress

## Base and scope

- Base: `6c7d4b1bbd6b5ca3ba2334c552325a6c2d626f07` (`fix: close row-six expiry and timing review`).
- Added exact executable oracles for the nine required signature compositions.
- Added a deterministic all-36 stress fixture with 1,200 firing ticks at 120 Hz, bounded cleanup, two complete identical seeded runs, raw-state validation, provenance/accuracy reconciliation, and real cumulative-descendant boundary emission.
- Production changes are limited to defects exposed by the new composition/stress tests.

## RED evidence

- The first cumulative-boundary test expected a named overflow but received a generic `Error`. `DescendantOverflowError` now identifies all three generation-one overflow paths.
- The all-artifact run rejected valid Snare and three-second area/VFX lifetimes because direct floating-point comparisons could classify `bornAt + duration` as over the exact contract. Runtime validation now uses the existing scale-aware tolerance.
- At `t=3.408333...`, an expired Hollow Point status removed the last ordinary source for `trigger-3` before incoming Snare history was validated. The simulation now carries pre-transition status roots as validation-only roots for that update, while final cleanup still removes them; the public combat runtime continues rejecting truly invalid ledgers.
- The drain reached empty gameplay state while old `metrics.hitEvents` remained because rolling history pruned only when another damage event arrived. Every update now prunes the strict three-second history without changing cumulative totals.
- The strict raw walker rejected own `undefined` optional fields (`decoy`, then `wantedBrand`). Returned gameplay state now omits absent optional fields. Two legacy assertions were changed from own-key matching to the equivalent semantic `toBeUndefined()` check.
- Strengthened fixture REDs also exposed test-fixture issues: a pre-split Halo target could steer the parent, injected Stillwater charge did not prove 72 fixed ticks, simultaneous Cold/Cinder hits did not prove earliest-burn retention, and vacuous Tesla-degree checks allowed an empty graph. Each oracle now exercises the real transition.

## GREEN implementation

- `composition.test.ts` covers all nine required loadouts with exact timings, damage, radii, ranges, phases, inheritance, once-only histories, status stages, reaction ordering, and non-vacuous Tesla graphs.
- Twin/Crossfire proves both stored convergence descriptors are exactly `192`, brackets the first committed-path step crossing that threshold, and ties both converged roots to the one canonical pulse.
- Deadeye and Grave copies prove exact artifact/effect provenance and zero retained compiled emission eligibility; Posse proves the root-two shot comes from `satellite-trigger-1` before the exact root-two replacement is installed.
- Halo adds its target only after the exact 160 px split and proves child homing plus a real polyline hit.
- Pinball performs an actual same-target outbound and return contact, recording one hit per leg at `18` and `11.7`.
- Cold/Cinder uses four distinct hit times and proves chill 1, chill 2, freeze without shards, freeze consumption with four shards, one Snare, earliest burn tick, and fourth-hit Hex copying.
- Stillwater fires on the 72nd integer 120 Hz tick after proving tick 71 is not charged.
- The boundary fixture earns one real Bootleg Mint child from ledger count `293` to `294`, then the identical emission from `294` throws `DescendantOverflowError` for child `295`.
- Stress batch-owns all 36 artifacts exactly once, spawns five nonoverlapping dummies and five chasers, continuously fires for ten seconds, presses the first real automatic Deadeye sweet-window tick, and keeps Ralphy alive through the premise.
- The tape/seed RNG contains Tesla successes and failures; the known Tesla-success/Dealer root launches exactly 11 generation-zero projectiles.
- Every bounded collection is sampled on every tick and every sampled maximum has an explicit derived upper-bound assertion. Drain moves above one px/s, finishes before stop `+8 s`, and asserts exact empty/neutral transient state and target statuses.
- A recursion-stack raw walker rejects non-finite values, cycles, accessors, unsupported prototypes/collections, symbols, bigint, undefined, and every function except the exact `state.rng` closure before any serialization occurs.
- Every observed damage event proves closed source family and complete finite provenance. Each successful direct projectile has exactly one `firstProjectileHit === true`; cumulative metrics and accuracy reconcile exactly after drain.
- Both complete seeded snapshots survive `structuredClone`, JSON round-trip, and equality comparison including hidden ledgers and observed event order.

## Verification

- Required focused gate: `bun test src/game/composition.test.ts src/game/stress.test.ts` — 11 passed, 0 failed, 4,563 assertions; 54.00 seconds.
- Full unit gate: `bun test` — 316 passed, 0 failed, 6,084 assertions across 20 files; 53.76 seconds.
- `bun run build` — TypeScript and Vite production build passed.
- `git diff --check` — passed with no output.

## Changed tracked files

- `.superpowers/sdd/task-7-report.md`
- `src/game/composition.test.ts`
- `src/game/stress.test.ts`
- `src/game/combat-effects.ts`
- `src/game/simulation.ts`
- `src/game/simulation.test.ts`

## Independent review

- The first read-only mechanics review found six Important false-positive test gaps; after the first fixes, the follow-up found three remaining/narrower exact-oracle gaps. Every reported window was closed with an executable assertion.
- Final spot check reported no remaining Critical or Important findings and no production lifecycle regression.

## Concerns

- The stress test intentionally performs two full 2,160-tick upper-bound runs and takes about 53–54 seconds locally; its explicit 90-second timeout is above repeated measured runtime while remaining finite.
