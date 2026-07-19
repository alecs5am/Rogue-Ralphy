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

test("catalog telemetry", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("[data-artifact]")).toHaveCount(11);
	await page.getByRole("button", { name: "Take Tesla Bullets" }).click();
	await expect(page.locator('[data-stat="multishot"]')).toContainText("1.33×");
	await expect(page.locator('[data-stat="tesla"]')).toHaveText(
		"96 px radius · max 2 links · 25% damage · 0.15s cooldown",
	);
	await page.getByRole("button", { name: "Take Shotgun" }).click();
	await expect(page.locator('[data-stat="split"]')).toContainText("8 × 128 px");
	await page.getByRole("button", { name: "Take Spectral Bullets" }).click();
	await expect(page.locator('[data-stat="penetration"]')).toContainText("COVER + TARGETS");
});

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
		await expect(diagnostics).toContainText("MISSING ASSETS:");
		const diagnosticsText = await diagnostics.textContent();
		expect(diagnosticsText?.startsWith("MISSING ASSETS: ")).toBe(true);
		expect(
			diagnosticsText
				?.slice("MISSING ASSETS: ".length)
				.split(", ")
				.sort(),
		).toEqual(["shotgun", "spectralBullets", "teslaBullets"]);
		await expect(page.locator("[data-stat=ammo]")).toHaveText("6/6");
		for (const [name, note] of ARTIFACTS) {
			await expect(page.getByRole("button", { name: `Take ${name}` })).toBeVisible();
			await expect(page.getByText(note, { exact: true })).toBeVisible();
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
		await page.waitForTimeout(700);
		await expect(reload).toHaveClass(/in-zone/);
		await page.screenshot({
			path: `test-results/screenshots/ralphy-${viewport.width}x${viewport.height}.png`,
		});
		await page.getByRole("button", { name: "Clear artifacts" }).click();
		await expect(page.locator(".artifact-card.active")).toHaveCount(0);
		expect(errors).toEqual([]);
	});
}
