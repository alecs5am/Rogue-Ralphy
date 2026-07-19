import { expect, test } from "@playwright/test";

const ARTIFACTS = [
	["Twin Chamber", "2 projectiles · 8° spread"],
	["Big Iron", "+25% radius"],
	["Hollow Point", "+35% damage"],
	["Coldcaster", "25% freeze · 1.05s"],
	["Pinball", "1 bounce · 90% damage"],
	["Deadeye", "12% window · +20% rate · 2.25s"],
	["Halo Chamber", "outward spiral · 4s"],
	["Ghost Sight", "540°/s turn · acquire radius 96"],
	["Tesla Bullets", "+0.33 multishot · chain arcs"],
	["Shotgun", "split after 160 px"],
	["Spectral Bullets", "pierce cover and targets"],
] as const;

const SIGNATURE_ARTIFACTS = [
	["teslaBullets", "Tesla Bullets"],
	["shotgun", "Shotgun"],
	["spectralBullets", "Spectral Bullets"],
	["haloChamber", "Halo Chamber"],
	["ghostSight", "Ghost Sight"],
] as const;
type RenderProbe = {
	teslaOffsets: number[];
	impactDraws: number;
	atlasCells: { col: number; row: number }[];
	soulDraws: number;
};
type AnimationDraw = {
	path: string;
	col?: number;
	row?: number;
	a: number;
	b: number;
	c: number;
	d: number;
};
type AnimationProbe = { draws: AnimationDraw[] };

async function installAnimationProbe(
	page: import("@playwright/test").Page,
): Promise<void> {
	await page.addInitScript(() => {
		const probe: AnimationProbe = { draws: [] };
		(window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe = probe;
		const original = CanvasRenderingContext2D.prototype.drawImage;
		CanvasRenderingContext2D.prototype.drawImage = function (
			this: CanvasRenderingContext2D,
			...args: Parameters<typeof original>
		) {
			const source = args[0];
			if (source instanceof HTMLImageElement && probe.draws.length < 20_000) {
				const path = new URL(source.currentSrc || source.src).pathname;
				const transform = this.getTransform();
				const draw: AnimationDraw = {
					path,
					a: transform.a,
					b: transform.b,
					c: transform.c,
					d: transform.d,
				};
				if (path.endsWith("/ralphy/ralphy-atlas.png") && args.length === 9) {
					draw.col = Number(args[1]) / 128;
					draw.row = Number(args[2]) / 128;
				}
				probe.draws.push(draw);
			}
			return Reflect.apply(original, this, args);
		} as typeof original;
	});
}

test("catalog telemetry", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("[data-artifact]")).toHaveCount(11);
	await page.getByRole("button", { name: "Take Tesla Bullets" }).click();
	await expect(page.locator('[data-stat="multishot"]')).toContainText("1.33×");
	await expect(page.locator('[data-stat="spread"]')).toHaveText("8°");
	await expect(page.locator('[data-stat="tesla"]')).toHaveText(
		"96 px radius · max 2 links · 25% damage · 0.15s cooldown",
	);
	await page.getByRole("button", { name: "Take Shotgun" }).click();
	await expect(page.locator('[data-stat="split"]')).toHaveText(
		"160 px distance · 8 pellets · 320 px child range · 48° cone · 25% damage · 55% size",
	);
	await page.getByRole("button", { name: "Take Spectral Bullets" }).click();
	await expect(page.locator('[data-stat="penetration"]')).toContainText("COVER + TARGETS");
	await page.getByRole("button", { name: "Take Halo Chamber" }).click();
	await expect(page.locator('[data-stat="spiral"]')).toHaveText("4s duration · 48 px/s growth");
	await expect(page.locator('[data-stat="orbit"]')).toHaveCount(0);
});

test("imagegen combat hud", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("#hud .heart img")).toHaveCount(5);
	await expect(page.locator("#hud .ammo-tile img")).toHaveCount(6);
	const hearts = await page.locator("#hud .hearts").boundingBox();
	const ammo = await page.locator("#hud .ammo").boundingBox();
	if (!hearts || !ammo) throw new Error("HUD rows are not visible");
	expect(ammo.y).toBeGreaterThanOrEqual(hearts.y + hearts.height - 1);
	await expect(page.locator('[data-resource="coins"]')).toHaveText("00");
	await expect(page.locator('[data-resource="bombs"]')).toHaveText("00");
	await expect(page.locator('[data-resource="keys"]')).toHaveText("00");
	await expect(page.locator("#asset-diagnostics")).toContainText(
		"All generated assets loaded",
	);
	await expect(page.locator('[data-stat="secondary-hits"]')).toHaveText("0");
	await expect(page.locator("#hud svg, #hud [data-css-art]")).toHaveCount(0);
	expect(await page.evaluate(async () => {
		const hud = document.querySelector("#hud");
		if (!hud) return -1;
		let writes = 0;
		const observer = new MutationObserver((records) => { writes += records.length; });
		observer.observe(hud, { attributes: true, childList: true, characterData: true, subtree: true });
		await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		observer.disconnect();
		return writes;
	})).toBe(0);
});

test("loads only the animated Ralphy combat pack", async ({ page }) => {
	const requests: string[] = [];
	page.on("request", (request) => {
		const path = new URL(request.url()).pathname;
		if (path.startsWith("/assets/generated/")) requests.push(path);
	});

	await page.goto("/");
	await expect(page.locator("#asset-diagnostics")).toContainText("All generated assets loaded");
	expect(requests).toEqual(expect.arrayContaining([
		"/assets/generated/ralphy/ralphy-atlas.png",
		"/assets/generated/ralphy/ghost-revolver.png",
		"/assets/generated/effects/soul-projectile.png",
		"/assets/generated/effects/muzzle-flash.png",
	]));
	expect(requests.some((path) =>
		/\/ralphy\/(down|up|left|right)-(idle|move)\.png$/.test(path)
			|| path.endsWith("/revolver.png")
			|| path.endsWith("/effects/bullet.png"))).toBe(false);
});

test("draws right-facing fire reload and round soul frames", async ({ page }) => {
	await installAnimationProbe(page);
	await page.goto("/");
	const canvas = page.locator("#game");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("game canvas is not visible");

	await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
	await page.mouse.down();
	try {
		await expect.poll(async () => page.evaluate(() => {
			const probe = (window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe;
			return probe.draws.some(({ path }) => path.endsWith("/muzzle-flash.png"));
		}), { timeout: 1_000 }).toBe(true);
	} finally {
		await page.mouse.up();
	}

	await expect.poll(async () => page.evaluate(() => {
		const probe = (window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe;
		return probe.draws.some(({ row }) => row === 2);
	})).toBe(true);

	await page.keyboard.press("r");
	await page.waitForTimeout(1_150);
	const draws = await page.evaluate(() =>
		(window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe.draws);
	const atlas = draws.filter(({ path }) => path.endsWith("/ralphy/ralphy-atlas.png"));
	expect(atlas.some(({ row, col, a }) => row === 2 && (col === 8 || col === 9) && a < 0)).toBe(true);
	expect(new Set(atlas.filter(({ row }) => row === 3).map(({ col }) => col))).toEqual(new Set([8, 9, 10]));
	expect(draws.some(({ path }) => path.endsWith("/muzzle-flash.png"))).toBe(true);
	expect(draws.some(({ path }) => path.endsWith("/soul-projectile.png"))).toBe(true);
	expect(draws.filter(({ path }) => path.endsWith("/soul-projectile.png"))
		.every(({ b, c }) => Math.abs(b) < 1e-10 && Math.abs(c) < 1e-10)).toBe(true);
});

test("shows hurt then holds death until the laboratory resets", async ({ page }) => {
	await page.addInitScript(() => { Math.random = () => 0; });
	await installAnimationProbe(page);
	await page.goto("/");
	const canvas = page.locator("#game");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("game canvas is not visible");
	await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
	await page.mouse.down();
	await page.waitForTimeout(40);
	await page.mouse.up();
	await expect(page.locator('[data-stat="ammo"]')).toHaveText("5/6");
	await page.getByRole("button", { name: "Spawn chaser" }).click();

	await page.keyboard.down("w");
	await page.keyboard.down("a");
	await expect(page.locator('[data-stat="health"]')).not.toHaveText("100/100", { timeout: 10_000 });
	await page.keyboard.up("w");
	await page.keyboard.up("a");
	await expect(page.locator('[data-stat="health"]')).toHaveText("0/100", { timeout: 10_000 });

	await page.waitForTimeout(500);
	let atlas = await page.evaluate(() =>
		(window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe.draws
			.filter(({ path }) => path.endsWith("/ralphy/ralphy-atlas.png")));
	expect(atlas.some(({ row }) => row === 4)).toBe(true);
	expect(new Set(atlas.filter(({ row }) => row === 5).map(({ col }) => col))).toEqual(new Set([0, 1, 2, 3]));
	expect(atlas.at(-1)).toMatchObject({ row: 5, col: 3 });

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.keyboard.press("r");
	await page.waitForTimeout(300);
	await page.mouse.up();
	await expect(page.locator('[data-stat="health"]')).toHaveText("0/100");
	await expect(page.locator('[data-stat="ammo"]')).toHaveText("5/6");

	atlas = await page.evaluate(() =>
		(window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe.draws
			.filter(({ path }) => path.endsWith("/ralphy/ralphy-atlas.png")));
	expect(atlas.at(-1)).toMatchObject({ row: 5, col: 3 });

	await page.getByRole("button", { name: "Reset lab" }).click();
	await expect(page.locator('[data-stat="health"]')).toHaveText("100/100");
	await expect.poll(async () => page.evaluate(() => {
		const atlasDraws = (window as typeof window & { __animationProbe: AnimationProbe }).__animationProbe.draws
			.filter(({ path }) => path.endsWith("/ralphy/ralphy-atlas.png"));
		return atlasDraws.at(-1)?.row;
	})).toBe(0);
});

for (const reducedMotion of [false, true]) {
	test(`combines all five signature effects${reducedMotion ? " with reduced motion" : ""}`, async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (message) => {
			if (message.type() === "error") errors.push(message.text());
		});
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("response", (response) => {
			if (new URL(response.url()).pathname.startsWith("/assets/generated/") && !response.ok()) {
				errors.push(`${response.status()} ${response.url()}`);
			}
		});
		page.on("requestfailed", (request) => {
			if (new URL(request.url()).pathname.startsWith("/assets/generated/")) {
				errors.push(`${request.failure()?.errorText ?? "request failed"} ${request.url()}`);
			}
		});
		await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
		await page.addInitScript(() => {
			Math.random = () => 0;
			const probe: RenderProbe = {
				teslaOffsets: [],
				impactDraws: 0,
				atlasCells: [],
				soulDraws: 0,
			};
			(window as typeof window & { __renderProbe: RenderProbe }).__renderProbe = probe;
			const original = CanvasRenderingContext2D.prototype.drawImage;
			CanvasRenderingContext2D.prototype.drawImage = function (
				this: CanvasRenderingContext2D,
				...args: Parameters<typeof original>
			) {
				const source = args[0];
				if (source instanceof HTMLImageElement) {
					const path = new URL(source.currentSrc || source.src).pathname;
					if (path.endsWith("/tesla-arc.png") && probe.teslaOffsets.length < 2_000) {
						probe.teslaOffsets.push(Number(args[1]));
					}
					if (path.endsWith("/impact.png")) probe.impactDraws += 1;
					if (path.endsWith("/ralphy/ralphy-atlas.png") && args.length === 9) {
						probe.atlasCells.push({ col: Number(args[1]) / 128, row: Number(args[2]) / 128 });
					}
					if (path.endsWith("/soul-projectile.png")) probe.soulDraws += 1;
				}
				return Reflect.apply(original, this, args);
			} as typeof original;
		});
		await page.goto("/");
		await expect(page.locator("#asset-diagnostics")).toContainText("All generated assets loaded");
		expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(reducedMotion);

		for (const [id, name] of SIGNATURE_ARTIFACTS) {
			const card = page.locator(`[data-artifact="${id}"]`);
			await expect(card).toHaveCount(1);
			await card.getByRole("button", { name: `Take ${name}` }).click();
			await expect(card).toHaveClass(/active/);
		}
		for (let index = 0; index < 3; index += 1) {
			await page.getByRole("button", { name: "Spawn dummy" }).click();
		}
		await expect(page.locator(".dummy-stats p")).toHaveCount(3);

		const canvas = page.locator("#game");
		const box = await canvas.boundingBox();
		if (!box) throw new Error("game canvas is not visible");
		await page.mouse.move(box.x + box.width * 736 / 960, box.y + box.height / 2);
		await page.keyboard.down("d");
		await page.mouse.down();
		await expect(page.locator('[data-stat="ammo"]')).toHaveText("0/6", { timeout: 5_000 });
		await page.mouse.up();
		await page.keyboard.up("d");

		await expect(page.locator('#hud .ammo-tile img[alt="Loaded cartridge"]')).toHaveCount(0);
		await expect(page.locator('#hud .ammo-tile img[alt="Empty cartridge slot"]')).toHaveCount(6);
		await expect(page.locator("#reload")).toBeVisible();
		for (const stat of ["projectiles", "secondary-hits", "total-damage"] as const) {
			await expect.poll(async () => Number(await page.locator(`[data-stat="${stat}"]`).textContent())).toBeGreaterThan(0);
		}
		await expect(page.locator('[data-stat="ammo"]')).toHaveText("6/6", { timeout: 3_000 });
		await expect(page.locator('#hud .ammo-tile img[alt="Loaded cartridge"]')).toHaveCount(6);
		await expect(page.locator("#reload")).toBeHidden();

		await expect(page.locator("[data-artifact].active")).toHaveCount(5);
		expect(await page.locator("[data-artifact].active").evaluateAll((cards) =>
			cards.map((card) => card.getAttribute("data-artifact")).sort()
		)).toEqual(SIGNATURE_ARTIFACTS.map(([id]) => id).sort());
		if (reducedMotion) {
			const probe = await page.evaluate(() =>
				(window as typeof window & { __renderProbe: RenderProbe }).__renderProbe
			);
			expect(probe.teslaOffsets.length).toBeGreaterThan(0);
			expect(probe.teslaOffsets.every((offset) => offset % 24 === 0)).toBe(true);
			expect(probe.impactDraws).toBe(0);
			expect(probe.atlasCells.filter(({ row }) => row === 0 || row === 1)
				.every(({ col }) => col % 4 === 0)).toBe(true);
			expect(probe.atlasCells.some(({ row }) => row === 2)).toBe(true);
			expect(probe.soulDraws).toBeGreaterThan(0);
		}
		expect(errors).toEqual([]);
	});
}

test("builds a loadout, damages a dummy, and auto-reloads", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Test range 01" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Take Twin Chamber" }).click();
	await expect(
		page.getByRole("button", { name: "Remove Twin Chamber" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Remove Twin Chamber" }).click();
	await expect(
		page.getByRole("button", { name: "Take Twin Chamber" }),
	).toBeVisible();
	await expect(page.locator(".stepper, [data-count]")).toHaveCount(0);
	await page.getByRole("button", { name: "Spawn dummy" }).click();
	const canvas = page.locator("#game");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("game canvas is not visible");
	await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
	for (let shot = 0; shot < 6; shot += 1) {
		await page.mouse.down();
		await page.waitForTimeout(50);
		await page.mouse.up();
		await expect(page.locator("[data-stat=ammo]")).toHaveText(`${5 - shot}/6`);
		if (shot < 5) await page.waitForTimeout(360);
	}
	await expect(page.locator("#reload")).toBeVisible();
	await expect
		.poll(async () =>
			Number(await page.getByTestId("total-damage").textContent()),
		)
		.toBeGreaterThan(0);
	await expect
		.poll(async () =>
			Number(await page.locator('[data-stat="rolling-dps"]').textContent()),
		)
		.toBeGreaterThan(0);
	await expect
		.poll(async () =>
			Number(await page.locator('[data-stat="peak-dps"]').textContent()),
		)
		.toBeGreaterThan(0);
	expect(errors).toEqual([]);
});

test("misses then lands the Deadeye active reload", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("/");
	await page.getByRole("button", { name: "Take Deadeye" }).click();

	const canvas = page.locator("#game");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("game canvas is not visible");
	await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
	await page.mouse.down();
	await page.waitForTimeout(40);
	await page.mouse.up();
	await expect(page.locator("[data-stat=ammo]")).toHaveText("5/6");

	await page.keyboard.press("r");
	const reload = page.locator("#reload");
	await expect(reload).toBeVisible();
	await page.waitForTimeout(100);
	await page.keyboard.press("r");
	await expect(reload).not.toHaveClass(/success/);
	await page.waitForFunction(
		() => document.querySelector("#reload")?.classList.contains("in-zone"),
		undefined,
		{ polling: "raf", timeout: 2_000 },
	);

	await page.keyboard.press("r");
	await expect(reload).toHaveClass(/success/);
	await expect(reload).toContainText("QUICKDRAW");
	await expect(page.locator("[data-stat=ammo]")).toHaveText("6/6");
	await expect(page.locator("[data-stat=deadeye]")).toContainText("+20%");
	expect(errors).toEqual([]);
});

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 1024, height: 768 },
]) {
	test(`renders the complete lab at ${viewport.width} × ${viewport.height}`, async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (message) => {
			if (message.type() === "error") errors.push(message.text());
		});
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setViewportSize(viewport);
		await page.goto("/");
		const diagnostics = page.locator("#asset-diagnostics");
		await expect(diagnostics).toContainText("All generated assets loaded");
		await expect(page.locator("[data-stat=ammo]")).toHaveText("6/6");
		for (const [name, note] of ARTIFACTS) {
			await expect(page.getByRole("button", { name: `Take ${name}` })).toBeVisible();
			await expect(page.getByText(note, { exact: true })).toBeVisible();
		}
		if (viewport.width === 1024) {
			const names = page.locator(".artifact-copy h3");
			expect(await names.evaluateAll((elements) => elements.every((element) =>
				getComputedStyle(element).whiteSpace !== "nowrap" && element.scrollWidth <= element.clientWidth
			))).toBe(true);
			const spectralName = page.locator('[data-artifact="spectralBullets"] h3');
			await expect(spectralName).toHaveText("Spectral Bullets");
			expect(await spectralName.evaluate((element) =>
				element.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(element).lineHeight)
			)).toBe(true);
		}
		await page.getByRole("button", { name: "Take all" }).click();
		await expect(page.locator(".artifact-card.active")).toHaveCount(11);
		for (const [name] of ARTIFACTS)
			await expect(page.getByRole("button", { name: `Remove ${name}` })).toBeVisible();
		await page.getByRole("button", { name: "Spawn dummy" }).click();

		const canvas = page.locator("#game");
		const box = await canvas.boundingBox();
		if (!box) throw new Error("game canvas is not visible");
		expect(box.width / box.height).toBeCloseTo(5 / 3, 2);
		await expect(canvas).toHaveAttribute("width", "960");
		await expect(canvas).toHaveAttribute("height", "576");
		expect(
			await canvas.evaluate((element) => getComputedStyle(element).imageRendering),
		).toBe("pixelated");
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);

		await diagnostics.scrollIntoViewIfNeeded();
		await expect(diagnostics).toBeVisible();
		await page.locator("#lab").evaluate((element) => {
			element.scrollTop = 0;
		});

		await page.mouse.move(
			box.x + box.width * 0.75,
			box.y + box.height * 0.5,
		);
		await page.mouse.down();
		await page.waitForTimeout(80);
		await page.mouse.up();
		await expect(page.locator("[data-stat=ammo]")).toHaveText("5/6");
		await page.keyboard.press("r");
		const reload = page.locator("#reload");
		await expect(reload).toBeVisible();
		await page.waitForFunction(
			() => document.querySelector("#reload")?.classList.contains("in-zone"),
			undefined,
			{ polling: "raf", timeout: 2_000 },
		);
		await expect(reload).toHaveClass(/in-zone/);
		await page.screenshot({
			path: `test-results/screenshots/ralphy-${viewport.width}x${viewport.height}.png`,
		});
		await page.getByRole("button", { name: "Clear artifacts" }).click();
		await expect(page.locator(".artifact-card.active")).toHaveCount(0);
		expect(errors).toEqual([]);
	});
}
