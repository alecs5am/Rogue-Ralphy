# Playable Demo Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current Ralphy arena run fit every desktop viewport, expose clear navigation and rewards, and end with a multi-phase boss fight.

**Architecture:** Preserve the existing TypeScript state machine and Canvas renderer. Add only the state needed for reward feedback and multi-projectile enemy volleys, and keep page flow in the existing `main.ts` mode controller.

**Tech Stack:** TypeScript, Canvas 2D, DOM/CSS, Bun tests, Playwright.

## Global Constraints

- No new dependencies or router.
- Preserve the logical `960×576` camera and `1600×960` arena.
- Preserve all 36 artifact behavior and the test-room workflow.
- Write a failing regression before each production behavior change.

---

### Task 1: Viewport fit and navigation

**Files:** `index.html`, `src/styles.css`, `src/main.ts`, `tests/lab.spec.ts`

- [ ] Add failing Playwright coverage for ultrawide/tall canvas bounds and game → menu → run/lab navigation.
- [ ] Verify the focused browser test fails on the current overflow/missing controls.
- [ ] Constrain `.game-shell` by both available width and `100dvh`; add one reusable overlay for pause, death, completion, restart, and main-menu actions.
- [ ] Verify the focused browser test passes.

### Task 2: Guaranteed and readable rewards

**Files:** `src/game/simulation.ts`, `src/game/simulation.test.ts`, `src/render.ts`, `tests/lab.spec.ts`

- [ ] Add failing unit tests proving two crates spawn, destroyed crates drop upgrades, and collection records exact feedback.
- [ ] Verify the focused unit tests fail for the missing drop/feedback behavior.
- [ ] Spawn fixed crates before enemies, mark them as guaranteed reward carriers, and record a short pickup notice on collection.
- [ ] Render crate/bonus/pickup outlines, labels, minimap markers, and pickup notice.
- [ ] Add a browser draw/text probe for the reward cues and verify it passes.

### Task 3: Multi-phase boss

**Files:** `src/game/combat-effects.ts`, `src/game/simulation.ts`, `src/game/simulation.test.ts`, `src/render.ts`, `src/styles.css`, `tests/lab.spec.ts`

- [ ] Add failing unit tests for boss HP and 3/8/12-projectile phase volleys.
- [ ] Verify the focused unit tests fail on the current single projectile.
- [ ] Return an array of hazards per enemy attack; implement health-driven boss patterns and aggression with no new subsystem.
- [ ] Render boss name/health/phase and imminent-attack telegraph.
- [ ] Verify unit and browser boss tests pass.

### Task 4: Full playability gate

**Files:** all changed files

- [ ] Run focused tests, then `bun test`, `bun run build`, and `bun run test:e2e`.
- [ ] Run `git diff --check` and `gitleaks detect --source . --no-git --redact`.
- [ ] Capture and inspect fresh ultrawide, 1440×900, and 1024×768 run screenshots.
- [ ] Fix any Critical or Important review finding and repeat the full gate.
