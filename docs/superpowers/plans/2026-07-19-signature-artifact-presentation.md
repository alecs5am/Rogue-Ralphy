# Signature Artifact Grid, ImageGen, and Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the thirty-six artifacts as a readable keyboard-accessible `6 × 6` lab grid with coherent ImageGen pixel-art icons/VFX, generated HUD cues, Canvas presentation, and full browser verification.

**Architecture:** Treat catalog metadata as the single UI source of truth. Generate six coherent icon families and four shared VFX families with built-in ImageGen, normalize them through one tested Pillow packer, keep simulation VFX semantic, and let a focused `render-effects.ts` translate bounded commands/state into Canvas layers.

**Tech Stack:** Built-in ImageGen, Python via `uv`, Pillow 12.2.0, TypeScript 5.7, DOM/CSS, Canvas 2D, Bun, Vite 6, Playwright 1.61.

## Global Constraints

- Complete the catalog/compiler task from the engine plan before binding UI IDs.
- Runtime presents exactly `36` unique icons in six rows and six columns at both `1440 × 900` and `1024 × 768`.
- Production icons, HUD cues, and artifact VFX are accepted ImageGen PNG assets; no SVG, emoji, Unicode pictograms, CSS-drawn production art, repeated placeholder, or handwritten bitmap substitute may ship.
- All source sheets have flat removable chroma, complete fixed cells, clean gutters, no text/numbers/logos/watermarks, and no Ralphy body unless the cue represents a Ralphy interaction.
- Commit accepted runtime PNGs under `public/assets/generated/`; keep full ImageGen source sheets and contact sheets under ignored `tmp/imagegen/`.
- Every artifact tile is a direct keyboard-operable button with `aria-pressed`; state never depends on color alone.
- Arrow keys move within the grid; Enter/Space toggle; focus remains visible; detail persists for the last focused tile.
- Reduced motion preserves collision/state information and freezes only decorative texture phase/flicker/trail persistence.
- The laboratory scrolls independently and never hides combat HUD or field.

## File Structure

- Create `scripts/build_artifact_pack.py`: slice icon/VFX family sheets, remove chroma, normalize fixed cells, validate, and build ignored contact sheets.
- Create `scripts/test_build_artifact_pack.py`: deterministic packer/alpha/grid/uniqueness tests.
- Create accepted icons under `public/assets/generated/artifacts/`.
- Create accepted shared VFX under `public/assets/generated/effects/artifacts/`.
- Create `public/assets/generated/ui/ammo-echo.png` for Deadeye-loaded slots.
- Modify `src/assets.ts` and `src/assets.test.ts`: register and preflight exact icon/VFX keys.
- Modify `src/lab.ts` and `src/styles.css`: six-by-six buttons, detail panel, controls, and expanded telemetry.
- Create `tests/artifact-grid.spec.ts`: grid, keyboard, detail, responsive, icon, and Take-all/Clear browser tests.
- Create `src/render-effects.ts` and `src/render-effects.test.ts`: semantic VFX projection and draw-layer helpers.
- Modify `src/render.ts`: integrate field/link/target/emission/reactive layers.
- Modify `src/hud.ts` and `src/hud.test.ts`: echo-cylinder overlay and ordered slot projection.
- Modify `tests/lab.spec.ts`: all-artifact runtime, representative VFX, reduced motion, death/reset, assets, and screenshots.

---

### Task 1: Generate and Validate the Six Icon Families

**Files:**

- Create: `scripts/build_artifact_pack.py`
- Create: `scripts/test_build_artifact_pack.py`
- Create: `public/assets/generated/artifacts/*.png` (36 files)
- Create ignored sources: `tmp/imagegen/artifacts/row-1.png` through `row-6.png`
- Create ignored evidence: `tmp/imagegen/artifacts/contact-sheet.png`

**Interfaces:**

- Produces: thirty-six fixed `128 × 128` RGBA icon files named from catalog IDs.
- Consumes: six ImageGen family sheets and `ARTIFACT_CATALOG` row-major ID order.

- [ ] **Step 1: Write failing packer tests before generating**

```py
EXPECTED = [
    "twin-chamber", "deadeye", "last-bell", "grave-echo", "fan-the-phantom", "dealers-cut",
    "halo-chamber", "ghost-sight", "pinball", "wailing-lead", "undertakers-return", "comet-spur",
    "shotgun", "hollow-point", "bone-orchard", "grave-bloom", "soul-harvester", "bootleg-mint",
    "coldcaster", "cinder-gospel", "wanted-brand", "widows-ledger", "ectoplasm-snare", "hex-bell",
    "spectral-bullets", "tesla-bullets", "big-iron", "ghost-posse", "ectoplasmic-wake", "crossfire-covenant",
    "recoil-boots", "stillwater", "dustline-duel", "bonanza-clip", "last-gasp-locket", "undertakers-coat",
]

def test_runtime_pack_is_complete_rgba_and_unique(tmp_path):
    outputs = build_pack(FIXTURE_SHEETS, tmp_path)
    assert [path.stem for path in outputs] == EXPECTED
    assert all(Image.open(path).mode == "RGBA" and Image.open(path).size == (128, 128) for path in outputs)
    assert len({sha256(path.read_bytes()).hexdigest() for path in outputs}) == 36
```

Also assert nonempty alpha, transparent corners, no green/magenta chroma spill, fixed padding, complete cells, and contact-sheet row labels generated by the script rather than embedded in production art.

- [ ] **Step 2: Run the packer test and confirm failure**

Run: `uv run --with Pillow==12.2.0 scripts/test_build_artifact_pack.py`

Expected: FAIL because the packer and fixture sheets do not exist.

- [ ] **Step 3: Implement the minimal family packer**

Reuse `remove_chroma`, `fit_square`, and `split_atlas` from `scripts/split_atlas.py`. Accept six explicit input paths, six explicit row ID arrays, and an explicit output root; do not discover production files through broad globs.

```py
def build_family(sheet: Path, names: list[str], output: Path) -> list[Path]:
    if len(names) != 6:
        raise ValueError("artifact family must contain exactly six names")
    cells = split_cells(Image.open(sheet).convert("RGBA"), columns=6, rows=1)
    if len(cells) != 6:
        raise ValueError("artifact family sheet must contain six complete cells")
    return [save_normalized(remove_chroma(cell), output / f"{name}.png") for name, cell in zip(names, cells, strict=True)]
```

- [ ] **Step 4: Generate six coherent ImageGen sheets**

Use built-in ImageGen with the accepted Ralphy noir-western chibi pixel-art anchor and one prompt per row. Each prompt requests a horizontal six-cell sprite sheet, front-facing item icons, identical scale/palette/light, flat chroma background, thick pixel silhouette, clean gutters, and no text/numbers/logos/watermarks.

The cell subjects are exactly:

1. Twin Chamber, Deadeye, Last Bell, Grave Echo, Fan the Phantom, Dealer's Cut.
2. Halo Chamber, Ghost Sight, Pinball, Wailing Lead, Undertaker's Return, Comet Spur.
3. Shotgun, Hollow Point, Bone Orchard, Grave Bloom, Soul Harvester, Bootleg Mint.
4. Coldcaster, Cinder Gospel, Wanted Brand, Widow's Ledger, Ectoplasm Snare, Hex Bell.
5. Spectral Bullets, Tesla Bullets, Big Iron, Ghost Posse, Ectoplasmic Wake, Crossfire Covenant.
6. Recoil Boots, Stillwater, Dustline Duel, Bonanza Clip, Last Gasp Locket, Undertaker's Coat.

Inspect every returned sheet visually before packing. Regenerate a family when any cell is cropped, mislabeled by composition, duplicated, stylistically inconsistent, or contains embedded text.

- [ ] **Step 5: Pack, validate, and inspect contact sheet**

Run:

```bash
uv run --with Pillow==12.2.0 scripts/build_artifact_pack.py
uv run --with Pillow==12.2.0 scripts/test_build_artifact_pack.py
```

Expected: 36 unique accepted PNGs and all tests PASS. Inspect `tmp/imagegen/artifacts/contact-sheet.png` at original pixel detail.

- [ ] **Step 6: Commit**

```bash
git add scripts/build_artifact_pack.py scripts/test_build_artifact_pack.py public/assets/generated/artifacts
git commit -m "art: add ImageGen signature artifact icons"
```

---

### Task 2: Generate Shared VFX and Deadeye HUD Art

**Files:**

- Create ignored sources: `tmp/imagegen/effects/*.png`
- Create: `public/assets/generated/effects/artifacts/*.png`
- Create: `public/assets/generated/ui/ammo-echo.png`
- Modify: `scripts/build_artifact_pack.py`
- Modify: `scripts/test_build_artifact_pack.py`

**Interfaces:**

- Produces: fixed shared VFX keys and one Deadeye slot overlay.
- Consumes: the semantic `VfxCommand.kind` vocabulary frozen by the mechanics plan.

- [ ] **Step 1: Lock and test the VFX output list**

```py
VFX = [
    "echo-flash", "burst-flash", "side-shot-flash", "bell-ring", "bone-fan", "grave-bloom", "soul-spirit", "coin-mint",
    "chill-mark", "ice-shatter", "burn-mark", "ember-ring", "wanted-mark", "ledger-mark", "hex-pulse", "hollow-explosion",
    "wave-trail", "comet-tail", "return-loop", "pinball-relay", "ectoplasm-pool", "ectoplasm-trail", "crossfire-pulse", "kinetic-explosion",
    "iron-moonlet", "ghost-satellite", "recoil-skid", "stillwater-ward", "dustline-afterimage", "gold-soul", "locket-orbital", "coat-decoy",
]
```

Extend the packer test to require each VFX output, unique hashes within a sheet, `128 × 128` RGBA, transparent corners, and no chroma spill. Require `ammo-echo.png` at `64 × 64` RGBA.

- [ ] **Step 2: Generate four coherent ImageGen VFX sheets**

Generate exactly four eight-cell sheets:

1. Echo/burst/emission cues.
2. Impact/status/target marks.
3. Trails/fields/links.
4. Ralphy/reactive overlays.

Use the same pixel palette and chroma requirements as Task 1. Effects must read on dark reddish room art at `24–80 px`, have centered complete silhouettes, and contain no UI text.

- [ ] **Step 3: Generate the Deadeye echo slot overlay**

Use ImageGen for one transparent golden ghost-cartridge halo compatible with the existing `ammo-loaded.png`; do not draw it with CSS or SVG.

- [ ] **Step 4: Pack, validate, inspect, and commit**

```bash
uv run --with Pillow==12.2.0 scripts/build_artifact_pack.py --effects
uv run --with Pillow==12.2.0 scripts/test_build_artifact_pack.py
git add scripts/build_artifact_pack.py scripts/test_build_artifact_pack.py public/assets/generated/effects/artifacts public/assets/generated/ui/ammo-echo.png
git commit -m "art: add ImageGen artifact effects pack"
```

Expected: tests PASS and the original-detail contact sheet shows distinct readable effects.

---

### Task 3: Register and Preflight Every Production Asset

**Files:**

- Modify: `src/assets.ts`
- Modify: `src/assets.test.ts`

**Interfaces:**

- Produces: exact icon/VFX `AssetKey` entries, `REQUIRED_ARTIFACT_VFX`, and paths used by catalog, lab, HUD, and renderer.
- Consumes: accepted PNG paths from Tasks 1–2.

- [ ] **Step 1: Write failing manifest tests**

```ts
test("all artifact icons are unique required PNG assets", () => {
  const paths = ARTIFACT_CATALOG.map(({ icon }) => ASSET_PATHS[icon]);
  expect(paths).toHaveLength(36);
  expect(new Set(paths).size).toBe(36);
  expect(paths.every((path) => path.startsWith("/assets/generated/artifacts/") && path.endsWith(".png"))).toBe(true);
  expect(ARTIFACT_CATALOG.every(({ icon }) => REQUIRED_ASSET_KEYS.includes(icon))).toBe(true);
});

test("shared VFX and echo ammo are required PNGs", () => {
  expect(ASSET_PATHS.ammoEcho).toBe("/assets/generated/ui/ammo-echo.png");
  for (const key of REQUIRED_ARTIFACT_VFX) expect(REQUIRED_ASSET_KEYS).toContain(key);
  expect(Object.values(ASSET_PATHS).every((path) => !path.endsWith(".svg"))).toBe(true);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test src/assets.test.ts src/game/artifacts.test.ts`

Expected: FAIL because new keys are not registered.

- [ ] **Step 3: Add literal manifest entries**

Register all thirty-six icon paths, thirty-two shared VFX paths, and `ammoEcho`. Export `REQUIRED_ARTIFACT_VFX` as the exact tuple of the thirty-two VFX asset keys. Keep `REQUIRED_ASSET_KEYS = Object.keys(ASSET_PATHS)` so missing generated art fails startup preflight.

- [ ] **Step 4: Run tests/build and commit**

```bash
bun test src/assets.test.ts src/game/artifacts.test.ts
bun run build
git add src/assets.ts src/assets.test.ts
git commit -m "feat: preflight signature artifact assets"
```

---

### Task 4: Build the Accessible Six-by-Six Laboratory Grid

**Files:**

- Modify: `src/lab.ts`
- Modify: `src/styles.css`
- Create: `tests/artifact-grid.spec.ts`

**Interfaces:**

- Produces: `.artifact-grid`, 36 `.artifact-tile` buttons, `.artifact-detail`, roving focus, Take all, Clear artifacts, and expanded live counts.
- Consumes: exact catalog metadata and `setArtifact`/batch loadout state.

- [ ] **Step 1: Write failing browser tests**

```ts
test("artifact grid is six by six and projects details", async ({ page }) => {
  await page.goto("/");
  const tiles = page.locator(".artifact-tile");
  await expect(tiles).toHaveCount(36);
  expect(await tiles.evaluateAll((nodes) => new Set(nodes.map((node) => (node as HTMLImageElement).querySelector("img")?.src)).size)).toBe(36);
  await tiles.nth(0).focus();
  await expect(page.locator(".artifact-detail h3")).toHaveText("Twin Chamber");
  await page.keyboard.press("ArrowRight");
  await expect(tiles.nth(1)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(tiles.nth(1)).toHaveAttribute("aria-pressed", "true");
});
```

At both viewports assert six computed columns, six distinct row positions, no horizontal overflow, independent lab scrolling, visible focus, Arrow navigation, Enter/Space toggle, detail persistence, Take all activates 36, and Clear activates zero.

- [ ] **Step 2: Run focused E2E and confirm failure**

Run: `bun run test:e2e --grep "artifact grid|artifact detail|artifact keyboard"`

Expected: FAIL because the current lab uses eleven nested two-column cards.

- [ ] **Step 3: Implement direct buttons and one detail panel**

Build this DOM shape from catalog metadata:

```html
<div class="artifact-grid" aria-labelledby="artifacts-title">
  <button class="artifact-tile" data-artifact="twinChamber" data-row="1" data-column="1" aria-pressed="false">
    <img src="/assets/generated/artifacts/twin-chamber.png" alt="">
  </button>
</div>
<article class="artifact-detail" aria-live="polite"></article>
<div class="action-row artifact-actions">
  <button type="button">Take all</button>
  <button type="button">Clear artifacts</button>
</div>
```

Use one roving `tabIndex = 0`; arrow movement clamps/wraps within the `6 × 6` coordinates and calls `focus()`. Focus, pointer enter, and click call one `projectDetail(artifact)` function. Use one batch loadout setter for Take all/Clear so the combat build compiles once.

- [ ] **Step 4: Lock the six-column CSS**

```css
.artifact-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 4px;
}
.artifact-tile {
  min-width: 0;
  aspect-ratio: 1;
  padding: 3px;
}
.artifact-tile img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}
```

Remove the four/two-column artifact overrides. At narrow sidebar widths reduce gaps/padding/icon size but retain six columns.

- [ ] **Step 5: Run tests and commit**

```bash
bun run test:e2e --grep "artifact grid|artifact detail|artifact keyboard"
bun run build
git add src/lab.ts src/styles.css tests/artifact-grid.spec.ts
git commit -m "feat: add six-by-six artifact laboratory"
```

---

### Task 5: Render Semantic Artifact VFX and HUD Echo Slots

**Files:**

- Create: `src/render-effects.ts`
- Create: `src/render-effects.test.ts`
- Modify: `src/render.ts`
- Modify: `src/hud.ts`
- Modify: `src/hud.test.ts`

**Interfaces:**

- Produces: `projectEffectDraws(state, reducedMotion)`, ordered render layers, and echo-cylinder projection.
- Consumes: bounded `VfxCommand[]`, areas, target effects, links, satellites, orbitals, decoy, and generated asset keys.

- [ ] **Step 1: Write failing pure projection tests**

```ts
test("projects one semantic cue from every artifact row", () => {
  const draws = projectEffectDraws(stateWithRepresentativeEffects(), false);
  expect(new Set(draws.map(({ family }) => family))).toEqual(new Set(["trigger", "motion", "impact", "status", "relation", "reactive"]));
  expect(draws.every(({ asset }) => REQUIRED_ARTIFACT_VFX.includes(asset))).toBe(true);
});

test("reduced motion freezes decoration without removing essential cues", () => {
  const normal = projectEffectDraws(stateWithRepresentativeEffects(), false);
  const reduced = projectEffectDraws(stateWithRepresentativeEffects(), true);
  expect(reduced.map(({ id }) => id)).toEqual(normal.map(({ id }) => id));
  expect(reduced.every(({ phase }) => phase === 0)).toBe(true);
});
```

- [ ] **Step 2: Write failing HUD tests**

Given ordered slots `[echo loaded, normal loaded, empty, empty, empty, empty]`, assert the first ammo tile includes `ammo-loaded.png` plus `ammo-echo.png`, the second only loaded art, and the remaining four tiles use empty art.

- [ ] **Step 3: Run and confirm failure**

Run: `bun test src/render-effects.test.ts src/hud.test.ts`

Expected: FAIL because the projection module and echo overlay do not exist.

- [ ] **Step 4: Implement layered bitmap rendering**

Use these layers in order:

```ts
drawAreasAndTrails(context, effectDraws, assets);
drawTargets(context, state, assets);
drawTargetCues(context, effectDraws, assets);
drawLinks(context, effectDraws, assets);
drawProjectiles(context, state, assets, reducedMotion);
drawEmissionCues(context, effectDraws, assets);
drawSatellitesOrbitalsAndDecoy(context, effectDraws, assets);
drawPlayer(context, state, assets, options);
```

Do not infer all mechanics from unrelated projectile fields; project only semantic commands/state. Batch Wake segments, tile pools/trails, draw canonical link endpoints, and expire cues by their simulation timestamps.

- [ ] **Step 5: Run tests/build and commit**

```bash
bun test src/render-effects.test.ts src/hud.test.ts
bun run build
git add src/render-effects.ts src/render-effects.test.ts src/render.ts src/hud.ts src/hud.test.ts
git commit -m "feat: render signature artifact effects"
```

---

### Task 6: Full Browser, Visual, and Repository Verification

**Files:**

- Modify: `tests/lab.spec.ts`
- Update: `test-results/screenshots/ralphy-1440x900.png`
- Update: `test-results/screenshots/ralphy-1024x768.png`
- Modify production files only when a failing browser regression proves a defect.

**Interfaces:**

- Consumes: completed engine, mechanics, assets, grid, renderer, and HUD.
- Produces: final playable demo verification and screenshot evidence.

- [ ] **Step 1: Update hard-coded browser catalog expectations**

Replace the old eleven-item arrays/counts with the exact thirty-six IDs and names. Assert 36 unique PNG requests, no `.svg`, no missing asset diagnostics, and representative VFX requests from all six rows.

- [ ] **Step 2: Add the all-artifact browser flow**

```ts
test("Take all survives combat reload death reset and cleanup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take all" }).click();
  await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(36);
  await page.getByRole("button", { name: "Spawn dummy" }).click();
  await page.getByRole("button", { name: "Spawn wave ×5" }).click();
  await fireAtCanvas(page, 1500);
  await expect(page.getByTestId("total-damage")).not.toHaveText("0");
  await expect(page.locator("#asset-diagnostics")).toContainText("All generated assets loaded");
  await page.getByRole("button", { name: "Reset lab" }).click();
  await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(0);
});
```

Also assert reload progress, Deadeye echo slots, damage/accuracy finiteness, death input lock, reset, cleanup, and absence of console/page/request errors.

- [ ] **Step 3: Extend Canvas probes and reduced motion**

Observe one actual ImageGen bitmap draw from trigger, motion, impact, status, relation, and reactive families. In reduced motion, assert each essential cue still draws while texture phase remains constant.

- [ ] **Step 4: Capture and inspect both screenshots**

Run the browser suite at `1440 × 900` and `1024 × 768`. Inspect original screenshots for six-column readability, visible detail copy, combat-field visibility, HUD clearance, pixel crispness, no chroma spill, no clipped icons, and independent lab scrolling.

- [ ] **Step 5: Run the final verification gate**

```bash
bun test
uv run --with Pillow==12.2.0 scripts/test_build_ralphy_atlas.py
uv run --with Pillow==12.2.0 scripts/test_build_artifact_pack.py
bun run build
bun run test:e2e
bun run test:e2e --grep "draws right-facing fire reload" --repeat-each=3 --workers=3
git diff --check
gitleaks detect --source . --no-banner --redact
git status --short
```

Expected: all unit/asset/build/browser/repeat gates PASS, screenshots are accepted, no leaks, and the worktree contains only intentional changes.

- [ ] **Step 6: Request independent whole-branch review**

Review the implementation against the complete written specification. Correct Critical/Important findings with regression tests and rerun the full gate.

- [ ] **Step 7: Commit final integration evidence**

```bash
git add tests/lab.spec.ts test-results/screenshots/ralphy-1440x900.png test-results/screenshots/ralphy-1024x768.png
git commit -m "test: verify signature artifact demo"
```
