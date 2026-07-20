import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
	ARTIFACT_HUD_ASSETS,
	ARTIFACT_PRESENTATION_ASSETS,
	ASSET_PATHS,
	NEW_ARTIFACT_VFX,
	RETAINED_ARTIFACT_VFX,
} from "../src/assets";
import { ARTIFACT_EFFECT_CONTRACT } from "../src/render-effects";

const EXPECTED_ARTIFACTS = [
	["twinChamber", "Twin Chamber", "/assets/generated/artifacts/twin-chamber.png"],
	["deadeye", "Deadeye", "/assets/generated/artifacts/deadeye.png"],
	["lastBell", "Last Bell", "/assets/generated/artifacts/last-bell.png"],
	["graveEcho", "Grave Echo", "/assets/generated/artifacts/grave-echo.png"],
	["fanThePhantom", "Fan the Phantom", "/assets/generated/artifacts/fan-the-phantom.png"],
	["dealersCut", "Dealer's Cut", "/assets/generated/artifacts/dealers-cut.png"],
	["haloChamber", "Halo Chamber", "/assets/generated/artifacts/halo-chamber.png"],
	["ghostSight", "Ghost Sight", "/assets/generated/artifacts/ghost-sight.png"],
	["pinball", "Pinball", "/assets/generated/artifacts/pinball.png"],
	["wailingLead", "Wailing Lead", "/assets/generated/artifacts/wailing-lead.png"],
	["undertakersReturn", "Undertaker's Return", "/assets/generated/artifacts/undertakers-return.png"],
	["cometSpur", "Comet Spur", "/assets/generated/artifacts/comet-spur.png"],
	["shotgun", "Shotgun", "/assets/generated/artifacts/shotgun.png"],
	["hollowPoint", "Hollow Point", "/assets/generated/artifacts/hollow-point.png"],
	["boneOrchard", "Bone Orchard", "/assets/generated/artifacts/bone-orchard.png"],
	["graveBloom", "Grave Bloom", "/assets/generated/artifacts/grave-bloom.png"],
	["soulHarvester", "Soul Harvester", "/assets/generated/artifacts/soul-harvester.png"],
	["bootlegMint", "Bootleg Mint", "/assets/generated/artifacts/bootleg-mint.png"],
	["coldcaster", "Coldcaster", "/assets/generated/artifacts/coldcaster.png"],
	["cinderGospel", "Cinder Gospel", "/assets/generated/artifacts/cinder-gospel.png"],
	["wantedBrand", "Wanted Brand", "/assets/generated/artifacts/wanted-brand.png"],
	["widowsLedger", "Widow's Ledger", "/assets/generated/artifacts/widows-ledger.png"],
	["ectoplasmSnare", "Ectoplasm Snare", "/assets/generated/artifacts/ectoplasm-snare.png"],
	["hexBell", "Hex Bell", "/assets/generated/artifacts/hex-bell.png"],
	["spectralBullets", "Spectral Bullets", "/assets/generated/artifacts/spectral-bullets.png"],
	["teslaBullets", "Tesla Bullets", "/assets/generated/artifacts/tesla-bullets.png"],
	["bigIron", "Big Iron", "/assets/generated/artifacts/big-iron.png"],
	["ghostPosse", "Ghost Posse", "/assets/generated/artifacts/ghost-posse.png"],
	["ectoplasmicWake", "Ectoplasmic Wake", "/assets/generated/artifacts/ectoplasmic-wake.png"],
	["crossfireCovenant", "Crossfire Covenant", "/assets/generated/artifacts/crossfire-covenant.png"],
	["recoilBoots", "Recoil Boots", "/assets/generated/artifacts/recoil-boots.png"],
	["stillwater", "Stillwater", "/assets/generated/artifacts/stillwater.png"],
	["dustlineDuel", "Dustline Duel", "/assets/generated/artifacts/dustline-duel.png"],
	["bonanzaClip", "Bonanza Clip", "/assets/generated/artifacts/bonanza-clip.png"],
	["lastGaspLocket", "Last Gasp Locket", "/assets/generated/artifacts/last-gasp-locket.png"],
	["undertakersCoat", "Undertaker's Coat", "/assets/generated/artifacts/undertakers-coat.png"],
] as const;

const ICON_PATHS = EXPECTED_ARTIFACTS.map(([, , path]) => path);
const NEW_VFX_PATHS = [
	"/assets/generated/effects/artifacts/echo-flash.png",
	"/assets/generated/effects/artifacts/burst-flash.png",
	"/assets/generated/effects/artifacts/side-shot-flash.png",
	"/assets/generated/effects/artifacts/bell-ring.png",
	"/assets/generated/effects/artifacts/bone-fan.png",
	"/assets/generated/effects/artifacts/grave-bloom.png",
	"/assets/generated/effects/artifacts/soul-spirit.png",
	"/assets/generated/effects/artifacts/coin-mint.png",
	"/assets/generated/effects/artifacts/chill-mark.png",
	"/assets/generated/effects/artifacts/ice-shatter.png",
	"/assets/generated/effects/artifacts/burn-mark.png",
	"/assets/generated/effects/artifacts/ember-ring.png",
	"/assets/generated/effects/artifacts/wanted-mark.png",
	"/assets/generated/effects/artifacts/ledger-mark.png",
	"/assets/generated/effects/artifacts/hex-pulse.png",
	"/assets/generated/effects/artifacts/hollow-explosion.png",
	"/assets/generated/effects/artifacts/wave-trail.png",
	"/assets/generated/effects/artifacts/comet-tail.png",
	"/assets/generated/effects/artifacts/return-loop.png",
	"/assets/generated/effects/artifacts/pinball-relay.png",
	"/assets/generated/effects/artifacts/ectoplasm-pool.png",
	"/assets/generated/effects/artifacts/ectoplasm-trail.png",
	"/assets/generated/effects/artifacts/crossfire-pulse.png",
	"/assets/generated/effects/artifacts/kinetic-explosion.png",
	"/assets/generated/effects/artifacts/iron-moonlet.png",
	"/assets/generated/effects/artifacts/ghost-satellite.png",
	"/assets/generated/effects/artifacts/recoil-skid.png",
	"/assets/generated/effects/artifacts/stillwater-ward.png",
	"/assets/generated/effects/artifacts/dustline-afterimage.png",
	"/assets/generated/effects/artifacts/gold-soul.png",
	"/assets/generated/effects/artifacts/locket-orbital.png",
	"/assets/generated/effects/artifacts/coat-decoy.png",
	"/assets/generated/effects/artifacts/twin-weave.png",
] as const;
const RETAINED_VFX_PATHS = [
	"/assets/generated/effects/orbit-trail.png",
	"/assets/generated/effects/homing-marker.png",
	"/assets/generated/effects/shotgun-split.png",
	"/assets/generated/effects/spectral-trail.png",
	"/assets/generated/effects/tesla-arc.png",
] as const;
const HUD_PATHS = [
	"/assets/generated/ui/ammo-echo.png",
	"/assets/generated/ui/dealer-cut-1.png",
	"/assets/generated/ui/dealer-cut-2.png",
	"/assets/generated/ui/dealer-cut-3.png",
] as const;
const PRESENTATION_PATHS = [...NEW_VFX_PATHS, ...RETAINED_VFX_PATHS];
const WORLD_PRESENTATION_PATHS = PRESENTATION_PATHS.filter(
	(path) => path !== "/assets/generated/effects/artifacts/gold-soul.png",
);
const EXPECTED_PRESENTATION_PATHS = [
	...ICON_PATHS,
	...PRESENTATION_PATHS,
	...HUD_PATHS,
];

type DrawRecord = {
	path: string;
	decoded: boolean;
	naturalWidth: number;
	naturalHeight: number;
	args: number[];
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
	col?: number;
	row?: number;
};
type DrawProbe = { byPath: Record<string, DrawRecord[]> };

function monitorErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(`console: ${message.text()}`);
	});
	page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
	page.on("requestfailed", (request) =>
		errors.push(`request: ${request.failure()?.errorText ?? "failed"} ${request.url()}`),
	);
	page.on("response", (response) => {
		const path = new URL(response.url()).pathname;
		if (path.startsWith("/assets/generated/") && response.status() >= 400)
			errors.push(`response: ${response.status()} ${path}`);
	});
	return errors;
}

async function installDrawProbe(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const probe: DrawProbe = { byPath: {} };
		(window as typeof window & { __drawProbe: DrawProbe }).__drawProbe = probe;
		const original = CanvasRenderingContext2D.prototype.drawImage;
		CanvasRenderingContext2D.prototype.drawImage = function (
			this: CanvasRenderingContext2D,
			...args: Parameters<typeof original>
		) {
			const source = args[0];
			if (source instanceof HTMLImageElement) {
				const path = new URL(
					source.currentSrc || source.src,
					location.href,
				).pathname;
				const records = probe.byPath[path] ?? [];
				if (records.length < 512) {
					const transform = this.getTransform();
					const record: DrawRecord = {
						path,
						decoded: source.complete && source.naturalWidth > 0,
						naturalWidth: source.naturalWidth,
						naturalHeight: source.naturalHeight,
						args: Array.from(args.slice(1), Number),
						a: transform.a,
						b: transform.b,
						c: transform.c,
						d: transform.d,
						e: transform.e,
						f: transform.f,
					};
					if (path.endsWith("/ralphy/ralphy-atlas.png") && args.length === 9) {
						record.col = Number(args[1]) / 128;
						record.row = Number(args[2]) / 128;
					}
					records.push(record);
					probe.byPath[path] = records;
				}
			}
			return Reflect.apply(original, this, args);
		} as typeof original;
	});
}

async function probe(page: Page): Promise<DrawProbe> {
	return page.evaluate(() =>
		(window as typeof window & { __drawProbe: DrawProbe }).__drawProbe,
	);
}

async function clearProbe(page: Page): Promise<void> {
	await page.evaluate(() => {
		(window as typeof window & { __drawProbe: DrawProbe }).__drawProbe.byPath = {};
	});
}

async function waitTwoFrames(page: Page): Promise<void> {
	await page.evaluate(
		() => new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		),
	);
}

async function waitForReady(page: Page): Promise<void> {
	await expect(page.locator("#asset-diagnostics")).toContainText(
		"All generated assets loaded",
	);
	await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
	await page.waitForFunction(async () => {
		const images = Array.from(document.images);
		await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
		return images.every(
			(image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
		);
	});
}

async function gotoReady(page: Page, url = "/"): Promise<void> {
	await page.goto(url);
	await waitForReady(page);
}

async function aimAtDummy(page: Page): Promise<void> {
	const canvas = page.locator("#game");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("game canvas is not visible");
	await page.mouse.move(
		box.x + box.width * 736 / 960,
		box.y + box.height * 288 / 576,
	);
}

async function statNumber(page: Page, key: string): Promise<number> {
	const text = (await page.locator(`[data-stat="${key}"]`).textContent()) ?? "";
	const value = Number.parseFloat(text);
	expect(Number.isFinite(value), `${key} must be finite, received ${text}`).toBe(true);
	return value;
}

async function triggerOnce(page: Page): Promise<number> {
	const before = await statNumber(page, "triggers");
	await page.locator("#game").evaluate(async (canvas, expected) => {
		const bounds = canvas.getBoundingClientRect();
		const stat = document.querySelector<HTMLElement>('[data-stat="triggers"]');
		if (!stat) throw new Error("trigger telemetry is missing");
		await new Promise<void>((resolve, reject) => {
			let timeout = 0;
			const release = () =>
				window.dispatchEvent(new PointerEvent("pointerup", { button: 0 }));
			const observer = new MutationObserver(() => {
				const current = Number.parseFloat(stat.textContent ?? "");
				if (current === expected) finish();
				else if (current > expected)
					finish(new Error(`trigger pulse overshot ${expected}: ${current}`));
			});
			const finish = (error?: Error) => {
				window.clearTimeout(timeout);
				observer.disconnect();
				release();
				if (error) reject(error);
				else resolve();
			};
			observer.observe(stat, { childList: true, characterData: true, subtree: true });
			timeout = window.setTimeout(
				() => finish(new Error(`trigger pulse timed out at ${stat.textContent}`)),
				4_000,
			);
			canvas.dispatchEvent(new PointerEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: bounds.left + bounds.width * 736 / 960,
				clientY: bounds.top + bounds.height * 288 / 576,
			}));
		});
	}, before + 1);
	const after = await statNumber(page, "triggers");
	expect(after).toBe(before + 1);
	return after;
}

function geometrySignature(records: readonly DrawRecord[]): string[] {
	return [...new Set(records.map(({ args, a, b, c, d, e, f }) =>
		JSON.stringify({ args, a, b, c, d, e, f })))]
		.sort();
}

test("catalog telemetry uses the direct thirty-six-artifact grid", async ({ page }) => {
	await gotoReady(page);
	const tiles = page.locator(".artifact-tile");
	await expect(tiles).toHaveCount(36);
	expect(await tiles.evaluateAll((nodes) => nodes.map((node) => [
		(node as HTMLElement).dataset.artifact,
		node.getAttribute("aria-label"),
	]))).toEqual(EXPECTED_ARTIFACTS.map(([id, name]) => [id, name]));

	const twin = page.getByRole("button", { name: "Twin Chamber", exact: true });
	await twin.click();
	await expect(twin).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator(".artifact-detail h3")).toHaveText("Twin Chamber");
	await twin.click();
	await expect(twin).toHaveAttribute("aria-pressed", "false");
	await expect(page.locator(".stepper, [data-count]")).toHaveCount(0);

	await page.getByRole("button", { name: "Tesla Bullets", exact: true }).click();
	await expect(page.locator('[data-stat="multishot"]')).toContainText("1.33×");
	await expect(page.locator('[data-stat="spread"]')).toHaveText("8°");
	await expect(page.locator('[data-stat="tesla"]')).toHaveText(
		"96 px radius · max 2 links · 25% damage · 0.15s cooldown",
	);
	await page.getByRole("button", { name: "Shotgun", exact: true }).click();
	await expect(page.locator('[data-stat="split"]')).toHaveText(
		"160 px distance · 8 pellets · 320 px child range · 48° cone · 25% damage · 55% size",
	);
	await page.getByRole("button", { name: "Spectral Bullets", exact: true }).click();
	await expect(page.locator('[data-stat="penetration"]')).toContainText("COVER + TARGETS");
	await page.getByRole("button", { name: "Halo Chamber", exact: true }).click();
	await expect(page.locator('[data-stat="spiral"]')).toHaveText(
		"4s duration · 48 px/s growth",
	);
});

test("all presentation PNGs respond and all icon images decode uniquely", async ({ page }) => {
	const responses = new Map<string, { ok: boolean; status: number }>();
	const requests: string[] = [];
	page.on("request", (request) => {
		const path = new URL(request.url()).pathname;
		if (path.startsWith("/assets/generated/")) requests.push(path);
	});
	page.on("response", (response) => {
		const path = new URL(response.url()).pathname;
		if (path.startsWith("/assets/generated/"))
			responses.set(path, { ok: response.ok(), status: response.status() });
	});

	await gotoReady(page);
	expect(EXPECTED_PRESENTATION_PATHS).toHaveLength(78);
	expect(new Set(EXPECTED_PRESENTATION_PATHS).size).toBe(78);
	expect(EXPECTED_PRESENTATION_PATHS.every((path) => path.endsWith(".png"))).toBe(true);
	expect(NEW_ARTIFACT_VFX).toHaveLength(33);
	expect(RETAINED_ARTIFACT_VFX).toHaveLength(5);
	expect(ARTIFACT_HUD_ASSETS).toHaveLength(4);
	expect(NEW_ARTIFACT_VFX.map((asset) => ASSET_PATHS[asset])).toEqual(NEW_VFX_PATHS);
	expect(RETAINED_ARTIFACT_VFX.map((asset) => ASSET_PATHS[asset])).toEqual(RETAINED_VFX_PATHS);
	expect(ARTIFACT_HUD_ASSETS.map((asset) => ASSET_PATHS[asset])).toEqual(HUD_PATHS);
	expect(ARTIFACT_PRESENTATION_ASSETS.map((asset) => ASSET_PATHS[asset]))
		.toEqual(PRESENTATION_PATHS);
	expect(requests.some((path) => path.endsWith(".svg"))).toBe(false);
	for (const path of EXPECTED_PRESENTATION_PATHS)
		expect(responses.get(path), path).toEqual({ ok: true, status: 200 });

	const icons = await page.locator(".artifact-tile img").evaluateAll((nodes) =>
		nodes.map((node) => {
			const image = node as HTMLImageElement;
			return {
				path: new URL(image.currentSrc || image.src).pathname,
				width: image.naturalWidth,
				height: image.naturalHeight,
			};
		}),
	);
	expect(icons.map(({ path }) => path)).toEqual(ICON_PATHS);
	expect(new Set(icons.map(({ path }) => path))).toHaveProperty("size", 36);
	expect(icons.every(({ width, height }) => width > 0 && height > 0)).toBe(true);
	await expect(page.locator('[role="alert"], #asset-diagnostics .missing')).toHaveCount(0);
});

test("ImageGen combat HUD remains stable without state changes", async ({ page }) => {
	await gotoReady(page);
	await expect(page.locator("#hud .heart img")).toHaveCount(5);
	await expect(page.locator("#hud .ammo-base")).toHaveCount(6);
	await expect(page.locator("#hud .ammo-echo")).toHaveCount(0);
	await expect(page.locator("#hud .dealer-cut")).toBeHidden();
	const hearts = await page.locator("#hud .hearts").boundingBox();
	const ammo = await page.locator("#hud .ammo").boundingBox();
	if (!hearts || !ammo) throw new Error("HUD rows are not visible");
	expect(ammo.y).toBeGreaterThanOrEqual(hearts.y + hearts.height - 1);
	for (const resource of ["coins", "bombs", "keys"])
		await expect(page.locator(`[data-resource="${resource}"]`)).toHaveText("00");
	await expect(page.locator("#hud svg, #hud [data-css-art]")).toHaveCount(0);
	expect(await page.evaluate(async () => {
		const hud = document.querySelector("#hud");
		if (!hud) return -1;
		let writes = 0;
		const observer = new MutationObserver((records) => { writes += records.length; });
		observer.observe(hud, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true,
		});
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);
		observer.disconnect();
		return writes;
	})).toBe(0);
});

test("draws right-facing fire reload and movement animation frames", async ({ page }) => {
	await installDrawProbe(page);
	await gotoReady(page);
	const atlasPath = ASSET_PATHS.ralphyAtlas;
	await clearProbe(page);

	await page.keyboard.down("d");
	try {
		await expect.poll(async () =>
			(await probe(page)).byPath[atlasPath]?.some(({ row }) => row === 1) ?? false,
		).toBe(true);
	} finally {
		await page.keyboard.up("d");
	}

	await clearProbe(page);
	await aimAtDummy(page);
	await triggerOnce(page);
	await expect.poll(async () => {
		const draws = (await probe(page)).byPath;
		return Boolean(draws[ASSET_PATHS.muzzleFlash]?.length)
			&& Boolean(draws[ASSET_PATHS.soulProjectile]?.length)
			&& Boolean(draws[atlasPath]?.some(({ row }) => row === 2));
	}).toBe(true);
	const fireDraws = (await probe(page)).byPath;

	await clearProbe(page);
	await page.keyboard.press("r");
	await expect(page.locator("#reload")).toBeVisible();
	await expect.poll(async () => [...new Set(
		((await probe(page)).byPath[atlasPath] ?? [])
			.filter(({ row }) => row === 3)
			.map(({ col }) => col),
	)].sort((left, right) => (left ?? 0) - (right ?? 0))).toEqual([8, 9, 10]);
	expect(fireDraws[atlasPath]?.some(({ row, col, a }) =>
		row === 2 && (col === 8 || col === 9) && a < 0)).toBe(true);
	expect(fireDraws[ASSET_PATHS.soulProjectile]?.every(({ b, c }) =>
		Math.abs(b) < 1e-10 && Math.abs(c) < 1e-10)).toBe(true);
});

test("paused presentation fixture draws every semantic ImageGen cue in both motion modes", async ({ page }) => {
	const errors = monitorErrors(page);
	await installDrawProbe(page);
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await gotoReady(page, "/?fixture=presentation-all");
	await waitTwoFrames(page);

	expect(ARTIFACT_EFFECT_CONTRACT.map(({ artifactId }) => artifactId)).toEqual(
		EXPECTED_ARTIFACTS.map(([id]) => id),
	);
	await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(36);
	await expect(page.locator("#pause-label")).toBeVisible();
	await expect(page.locator(`#hud .ammo-base[src="${ASSET_PATHS.ammoLoaded}"]`)).toHaveCount(6);
	await expect(page.locator(`#hud .ammo-echo[src="${ASSET_PATHS.ammoEcho}"]`)).toHaveCount(6);
	await expect(page.locator("#hud .dealer-cut strong")).toHaveText("3/3");
	await expect(page.locator(`#hud .dealer-cut img[src="${ASSET_PATHS.dealerCut3}"]`)).toHaveCount(1);
	await expect(page.locator(`#hud .hud-delivery[src="${ASSET_PATHS.goldSoul}"]`)).toHaveCount(1);

	const regular = await probe(page);
	for (const path of WORLD_PRESENTATION_PATHS) {
		const records = regular.byPath[path] ?? [];
		expect(records.length, `${path} must draw`).toBeGreaterThan(0);
		expect(records.every(({ decoded, naturalWidth, naturalHeight }) =>
			decoded && naturalWidth > 0 && naturalHeight > 0), `${path} must be decoded`).toBe(true);
	}
	const regularWake = geometrySignature(
		regular.byPath[ASSET_PATHS.ectoplasmTrail] ?? [],
	);
	expect(regularWake.length).toBeGreaterThan(0);

	await page.emulateMedia({ reducedMotion: "reduce" });
	await gotoReady(page, "/?fixture=presentation-all");
	await waitTwoFrames(page);
	const reduced = await probe(page);
	const essentialWorldPaths = new Set(
		ARTIFACT_EFFECT_CONTRACT
			.filter(({ essential }) => essential)
			.flatMap(({ assets }) => assets)
			.filter((asset) => ARTIFACT_PRESENTATION_ASSETS.includes(
				asset as (typeof ARTIFACT_PRESENTATION_ASSETS)[number],
			) && asset !== "goldSoul")
			.map((asset) => ASSET_PATHS[asset]),
	);
	for (const path of essentialWorldPaths)
		expect(reduced.byPath[path]?.length ?? 0, `${path} must survive reduced motion`).toBeGreaterThan(0);
	expect(geometrySignature(reduced.byPath[ASSET_PATHS.ectoplasmTrail] ?? []))
		.toEqual(regularWake);
	expect(errors).toEqual([]);
});

test("Take all survives combat reload reset and cleanup", async ({ page }) => {
	const errors = monitorErrors(page);
	await installDrawProbe(page);
	await gotoReady(page);
	await page.getByRole("button", { name: "Take all" }).click();
	await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(36);
	await expect(page.locator("#hud .dealer-cut strong")).toHaveText("1/3");
	await expect(page.locator(`#hud .dealer-cut img[src="${ASSET_PATHS.dealerCut1}"]`)).toHaveCount(1);

	await page.getByRole("button", { name: "Spawn dummy" }).click();
	await page.getByRole("button", { name: "Spawn wave ×5" }).click();
	await expect(page.locator(".dummy-stats p")).toHaveCount(1);
	await aimAtDummy(page);
	await triggerOnce(page);
	await expect(page.locator("#hud .dealer-cut strong")).toHaveText("2/3");
	await triggerOnce(page);
	await expect(page.locator("#hud .dealer-cut strong")).toHaveText("3/3");
	await triggerOnce(page);
	await expect(page.locator("#hud .dealer-cut strong")).toHaveText("1/3");

	await expect.poll(() => statNumber(page, "total-damage"), { timeout: 10_000 })
		.toBeGreaterThan(0);
	for (const key of ["rolling-dps", "peak-dps", "total-damage", "accuracy"])
		await statNumber(page, key);
	const accuracy = await statNumber(page, "accuracy");
	expect(accuracy).toBeGreaterThanOrEqual(0);
	expect(accuracy).toBeLessThanOrEqual(100);

	await page.keyboard.press("r");
	const reload = page.locator("#reload");
	await expect(reload).toBeVisible();
	const progress = async () => Number.parseFloat(
		(await page.locator("#reload .reload-fill").getAttribute("style"))?.match(/[\d.]+/)?.[0] ?? "0",
	);
	await expect.poll(progress).toBeGreaterThan(0);
	const firstProgress = await progress();
	await expect.poll(progress).toBeGreaterThan(firstProgress);

	await page.getByRole("button", { name: "Reset lab" }).click();
	await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(0);
	await expect(page.locator('[data-stat="health"]')).toHaveText("100/100");
	await expect(page.locator('[data-stat="ammo"]')).toHaveText("6/6");
	await expect(page.locator('[data-stat="active"]')).toHaveText("0");
	await expect(page.locator('[data-stat="total-damage"]')).toHaveText("0");
	await expect(page.locator('[data-stat="triggers"]')).toHaveText("0");
	await expect(page.locator(".dummy-stats p")).toHaveCount(0);
	await expect(reload).toBeHidden();
	await expect(page.locator("#hud .ammo-echo, #hud .hud-delivery")).toHaveCount(0);
	await expect(page.locator("#hud .dealer-cut")).toBeHidden();
	await clearProbe(page);
	await waitTwoFrames(page);
	const resetDraws = await probe(page);
	expect(WORLD_PRESENTATION_PATHS.some((path) => (resetDraws.byPath[path]?.length ?? 0) > 0)).toBe(false);
	expect(errors).toEqual([]);
});

test("reload fixture hits the active window and charges all six echo rounds", async ({ page }) => {
	const errors = monitorErrors(page);
	await gotoReady(page, "/?fixture=reload-ready");
	const reload = page.locator("#reload");
	await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(36);
	await expect(page.locator("#pause-label")).toBeVisible();
	await expect(reload).toBeVisible();
	await expect(reload).toHaveClass(/in-zone/);
	await page.evaluate(() => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		window.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape" }));
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
		window.dispatchEvent(new KeyboardEvent("keyup", { key: "r" }));
	});
	await expect(reload).toHaveClass(/success/);
	await expect(page.locator('[data-stat="ammo"]')).toHaveText("6/6");
	await expect(page.locator(`#hud .ammo-base[src="${ASSET_PATHS.ammoLoaded}"]`)).toHaveCount(6);
	await expect(page.locator(`#hud .ammo-echo[src="${ASSET_PATHS.ammoEcho}"]`)).toHaveCount(6);

	await page.getByRole("button", { name: "Reset lab" }).click();
	await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(0);
	await expect(page.locator("#hud .ammo-echo, #hud .hud-delivery")).toHaveCount(0);
	await expect(page.locator("#hud .dealer-cut")).toBeHidden();
	await expect(reload).toBeHidden();
	expect(errors).toEqual([]);
});

test("death fixture locks movement fire and reload until Reset lab", async ({ page }) => {
	const errors = monitorErrors(page);
	await installDrawProbe(page);
	await gotoReady(page, "/?fixture=death-ready");
	const atlasPath = ASSET_PATHS.ralphyAtlas;
	await expect.poll(async () => {
		const last = (await probe(page)).byPath[atlasPath]?.at(-1);
		return last ? { row: last.row, col: last.col } : null;
	}).toEqual({ row: 5, col: 3 });
	await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(36);
	await clearProbe(page);
	await waitTwoFrames(page);
	const before = {
		health: await page.locator('[data-stat="health"]').textContent(),
		ammo: await page.locator('[data-stat="ammo"]').textContent(),
		triggers: await page.locator('[data-stat="triggers"]').textContent(),
		active: await page.locator('[data-stat="active"]').textContent(),
		atlas: (await probe(page)).byPath[atlasPath]?.at(-1),
	};
	const beforeDrawCount = (await probe(page)).byPath[atlasPath]?.length ?? 0;
	const canvas = page.locator("#game");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("game canvas is not visible");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.keyboard.down("w");
	await page.keyboard.down("d");
	await page.mouse.down();
	await page.keyboard.press("r");
	try {
		await page.waitForFunction((count) => {
			const records = (window as typeof window & { __drawProbe: DrawProbe })
				.__drawProbe.byPath["/assets/generated/ralphy/ralphy-atlas.png"];
			return (records?.length ?? 0) >= count + 5;
		}, beforeDrawCount);
	} finally {
		await page.mouse.up();
		await page.keyboard.up("w");
		await page.keyboard.up("d");
	}
	const afterAtlas = (await probe(page)).byPath[atlasPath]?.at(-1);
	await expect(page.locator('[data-stat="health"]')).toHaveText(before.health ?? "");
	await expect(page.locator('[data-stat="ammo"]')).toHaveText(before.ammo ?? "");
	await expect(page.locator('[data-stat="triggers"]')).toHaveText(before.triggers ?? "");
	await expect(page.locator('[data-stat="active"]')).toHaveText(before.active ?? "");
	expect(afterAtlas).toMatchObject({
		row: 5,
		col: 3,
		e: before.atlas?.e,
		f: before.atlas?.f,
	});

	await page.getByRole("button", { name: "Reset lab" }).click();
	await expect(page.locator('[data-stat="health"]')).toHaveText("100/100");
	await expect(page.locator('[data-stat="ammo"]')).toHaveText("6/6");
	await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(0);
	await expect.poll(async () => (await probe(page)).byPath[atlasPath]?.at(-1)?.row).toBe(0);
	expect(errors).toEqual([]);
});

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 1024, height: 768 },
]) {
	test(`captures accepted presentation screenshot at ${viewport.width}x${viewport.height}`, async ({ page }) => {
		const errors = monitorErrors(page);
		await page.setViewportSize(viewport);
		await gotoReady(page, "/?fixture=presentation-all");
		await page.evaluate(async () => { await document.fonts.ready; });
		await waitTwoFrames(page);
		await page.locator("#lab").evaluate((element) => { element.scrollTop = 0; });
		const grid = page.locator(".artifact-grid");
		expect(await grid.evaluate((element) =>
			getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
		)).toBe(6);
		await expect(page.locator(".artifact-detail h3")).toBeVisible();
		await expect(page.locator(".artifact-detail .artifact-description")).toBeVisible();
		const canvas = page.locator("#game");
		const box = await canvas.boundingBox();
		if (!box) throw new Error("game canvas is not visible");
		expect(box.width / box.height).toBeCloseTo(5 / 3, 2);
		expect(await canvas.evaluate((element) => getComputedStyle(element).imageRendering))
			.toBe("pixelated");
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
			.toBe(true);
		expect(await page.locator(".artifact-tile img").evaluateAll((images) =>
			images.every((image) => {
				const tile = image.parentElement!.getBoundingClientRect();
				const bounds = image.getBoundingClientRect();
				return bounds.left >= tile.left && bounds.right <= tile.right
					&& bounds.top >= tile.top && bounds.bottom <= tile.bottom;
			}),
		)).toBe(true);

		mkdirSync("docs/screenshots", { recursive: true });
		await page.screenshot({
			path: `docs/screenshots/ralphy-${viewport.width}x${viewport.height}.png`,
		});
		expect(errors).toEqual([]);
	});
}
