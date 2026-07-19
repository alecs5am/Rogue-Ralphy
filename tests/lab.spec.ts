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
type RenderProbe = { teslaOffsets: number[]; impactDraws: number };

test("catalog telemetry", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("[data-artifact]")).toHaveCount(11);
	await page.getByRole("button", { name: "Take Tesla Bullets" }).click();
	await expect(page.locator('[data-stat="multishot"]')).toContainText("1.33×");
	await expect(page.locator('[data-stat="tesla"]')).toHaveText(
		"96 px radius · max 2 links · 25% damage · 0.15s cooldown",
	);
	await page.getByRole("button", { name: "Take Shotgun" }).click();
	await expect(page.locator('[data-stat="split"]')).toHaveText(
		"160 px distance · 8 pellets · 128 px child range",
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
			const probe: RenderProbe = { teslaOffsets: [], impactDraws: 0 };
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
