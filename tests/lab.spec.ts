import { expect, test } from "@playwright/test";

test("builds a loadout, damages a dummy, and auto-reloads", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Test range 01" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Add Twin Chamber" }).click();
	await page.getByRole("button", { name: "Spawn dummy" }).click();
	const canvas = page.locator("#game");
	const box = await canvas.boundingBox();
	if (!box) throw new Error("game canvas is not visible");
	await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
	for (let shot = 0; shot < 6; shot += 1) {
		await page.mouse.down();
		await page.waitForTimeout(40);
		await page.mouse.up();
		await page.waitForTimeout(320);
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
		await page.setViewportSize(viewport);
		await page.goto("/");
		await expect(page.locator("#asset-diagnostics")).toHaveText(
			/ASSETS ONLINE/,
		);
		await expect(page.locator("[data-stat=ammo]")).toHaveText("6/6");
		await page.getByRole("button", { name: "Give all ×1" }).click();
		await expect(page.locator(".artifact-card.active")).toHaveCount(8);
		await page.getByRole("button", { name: "Spawn dummy" }).click();

		const canvas = page.locator("#game");
		const box = await canvas.boundingBox();
		if (!box) throw new Error("game canvas is not visible");
		expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
		expect(
			await canvas.evaluate((element) => getComputedStyle(element).imageRendering),
		).toBe("pixelated");
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);

		const diagnostics = page.locator("#asset-diagnostics");
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
		expect(errors).toEqual([]);
	});
}
