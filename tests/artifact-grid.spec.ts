import { expect, test } from "@playwright/test";
import { ASSET_PATHS } from "../src/assets";
import { ARTIFACT_CATALOG } from "../src/game/artifacts";

const byId = new Map(ARTIFACT_CATALOG.map((artifact) => [artifact.id, artifact]));

async function openGrid(page: import("@playwright/test").Page): Promise<void> {
	await page.goto("/");
	await expect(page.locator(".artifact-tile")).toHaveCount(36);
}

test("artifact grid is a direct accessible catalog with unique loaded icons", async ({
	page,
}) => {
	await openGrid(page);
	const grid = page.getByRole("group", { name: "Artifacts" });
	await expect(grid).toHaveCount(1);
	const tiles = grid.locator(":scope > .artifact-tile");
	await expect(tiles).toHaveCount(36);
	expect(await grid.locator(":scope > :not(button)").count()).toBe(0);

	expect(
		await tiles.evaluateAll((nodes) =>
			nodes.map((node) => ({
				id: (node as HTMLElement).dataset.artifact,
				row: (node as HTMLElement).dataset.row,
				column: (node as HTMLElement).dataset.column,
				label: node.getAttribute("aria-label"),
				pressed: node.getAttribute("aria-pressed"),
				tabIndex: (node as HTMLButtonElement).tabIndex,
			})),
		),
	).toEqual(
		ARTIFACT_CATALOG.map((artifact, index) => ({
			id: artifact.id,
			row: String(artifact.grid.row),
			column: String(artifact.grid.column),
			label: artifact.name,
			pressed: "false",
			tabIndex: index === 0 ? 0 : -1,
		})),
	);

	for (const artifact of ARTIFACT_CATALOG) {
		await expect(
			page.getByRole("button", { name: artifact.name, exact: true }),
		).toHaveCount(1);
	}
	const images = await tiles.locator("img").evaluateAll((nodes) =>
		nodes.map((node) => {
			const image = node as HTMLImageElement;
			return {
				path: new URL(image.currentSrc || image.src).pathname,
				naturalWidth: image.naturalWidth,
				naturalHeight: image.naturalHeight,
				alt: image.alt,
			};
		}),
	);
	expect(images.map(({ path }) => path)).toEqual(
		ARTIFACT_CATALOG.map(({ icon }) => ASSET_PATHS[icon]),
	);
	expect(new Set(images.map(({ path }) => path)).size).toBe(36);
	expect(
		images.every(
			({ naturalWidth, naturalHeight, alt }) =>
				naturalWidth > 0 && naturalHeight > 0 && alt === "",
		),
	).toBe(true);
});

test("artifact detail persists focus and click while pointer hover only previews", async ({
	page,
}) => {
	await openGrid(page);
	const tiles = page.locator(".artifact-tile");
	const detail = page.locator(".artifact-detail");
	const assertDetail = async (index: number) => {
		const artifact = ARTIFACT_CATALOG[index]!;
		await expect(detail.locator("h3")).toHaveText(artifact.name);
		await expect(detail.locator(".artifact-description")).toHaveText(
			artifact.description,
		);
		await expect(detail.locator(".artifact-tag")).toHaveText([...artifact.tags]);
		await expect(detail.locator(".artifact-synergy")).toHaveText(
			artifact.synergies.map((id) => byId.get(id)!.name),
		);
		await expect(detail.locator(".artifact-synergy")).toHaveCount(3);
	};

	await assertDetail(0);
	await tiles.nth(1).focus();
	await assertDetail(1);
	await tiles.nth(2).hover();
	await assertDetail(2);
	await page.locator("#artifacts .section-heading").hover();
	await assertDetail(1);

	await tiles.nth(3).click();
	await expect(tiles.nth(3)).toHaveAttribute("aria-pressed", "true");
	await assertDetail(3);
	await tiles.nth(4).hover();
	await assertDetail(4);
	await page.locator("#artifacts .section-heading").hover();
	await assertDetail(3);
	expect(await tiles.evaluateAll((nodes) => nodes.filter((node) => (node as HTMLButtonElement).tabIndex === 0).length)).toBe(1);

	const selectedOutline = await tiles.nth(3).evaluate((tile) => {
		const style = getComputedStyle(tile);
		return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
	});
	expect(selectedOutline.style).toBe("double");
	expect(selectedOutline.width).toBeGreaterThanOrEqual(2);

	await page.getByRole("button", { name: "Take all" }).click();
	await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(36);
	await page.getByRole("button", { name: "Clear artifacts" }).click();
	await expect(page.locator('.artifact-tile[aria-pressed="true"]')).toHaveCount(0);
});

test("artifact keyboard navigation clamps, roves, scrolls nearest, and toggles natively", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const calls: ScrollIntoViewOptions[] = [];
		const original = HTMLElement.prototype.scrollIntoView;
		HTMLElement.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
			if (typeof options === "object") calls.push(options);
			return original.call(this, options);
		};
		(window as typeof window & { __artifactScrollCalls: ScrollIntoViewOptions[] }).__artifactScrollCalls = calls;
	});
	await openGrid(page);
	await page.evaluate(() => {
		const events: { key: string; prevented: boolean }[] = [];
		(window as typeof window & { __artifactArrowEvents: typeof events }).__artifactArrowEvents = events;
		window.addEventListener("keydown", (event) => {
			if (event.key.startsWith("Arrow"))
				events.push({ key: event.key, prevented: event.defaultPrevented });
		});
	});
	const tiles = page.locator(".artifact-tile");
	await tiles.nth(0).focus();
	await page.keyboard.press("ArrowLeft");
	await expect(tiles.nth(0)).toBeFocused();
	await page.keyboard.press("ArrowRight");
	await expect(tiles.nth(1)).toBeFocused();
	await page.keyboard.press("ArrowUp");
	await expect(tiles.nth(1)).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(tiles.nth(7)).toBeFocused();

	await tiles.nth(5).focus();
	await page.keyboard.press("ArrowRight");
	await expect(tiles.nth(5)).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(tiles.nth(11)).toBeFocused();
	await tiles.nth(35).focus();
	await page.keyboard.press("ArrowDown");
	await expect(tiles.nth(35)).toBeFocused();

	expect(
		await page.evaluate(() =>
			(window as typeof window & { __artifactArrowEvents: { prevented: boolean }[] }).__artifactArrowEvents.every(({ prevented }) => prevented),
		),
	).toBe(true);
	expect(
		await page.evaluate(() =>
			(window as typeof window & { __artifactScrollCalls: ScrollIntoViewOptions[] }).__artifactScrollCalls.every(
				(options) => options.block === "nearest" && options.inline === "nearest",
			),
		),
	).toBe(true);
	expect(
		await page.evaluate(() =>
			(window as typeof window & { __artifactScrollCalls: ScrollIntoViewOptions[] }).__artifactScrollCalls.length,
		),
	).toBeGreaterThan(0);
	expect(await tiles.evaluateAll((nodes) => nodes.filter((node) => (node as HTMLButtonElement).tabIndex === 0).length)).toBe(1);

	await tiles.nth(1).focus();
	await expect(tiles.nth(1)).toHaveAttribute("aria-pressed", "false");
	await page.keyboard.press("Space");
	await expect(tiles.nth(1)).toHaveAttribute("aria-pressed", "true");
	await page.keyboard.press("Enter");
	await expect(tiles.nth(1)).toHaveAttribute("aria-pressed", "false");
	const focusStyle = await tiles.nth(1).evaluate((tile) => {
		const style = getComputedStyle(tile);
		return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
	});
	expect(focusStyle.style).toBe("solid");
	expect(focusStyle.width).toBeGreaterThanOrEqual(3);
});

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 1024, height: 768 },
]) {
	test(`artifact grid remains six columns in an independent lab scroller at ${viewport.width}x${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		await openGrid(page);
		const grid = page.locator(".artifact-grid");
		const tiles = page.locator(".artifact-tile");
		expect(
			await grid.evaluate((element) =>
				getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
			),
		).toBe(6);
		expect(
			await tiles.evaluateAll(
				(nodes) =>
					new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().top))).size,
			),
		).toBe(6);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
		expect(await grid.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

		const layout = await page.evaluate(() => {
			const lab = document.querySelector<HTMLElement>("#lab")!;
			const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
			const before = canvas.getBoundingClientRect();
			lab.scrollTop = lab.scrollHeight;
			const after = canvas.getBoundingClientRect();
			return {
				overflowY: getComputedStyle(lab).overflowY,
				labScrollTop: lab.scrollTop,
				windowScrollY: window.scrollY,
				canvasTopBefore: before.top,
				canvasTopAfter: after.top,
				canvasVisible: after.bottom > 0 && after.top < innerHeight,
				hudVisible: document.querySelector("#hud")!.getBoundingClientRect().bottom > 0,
			};
		});
		expect(layout.overflowY).toBe("auto");
		expect(layout.labScrollTop).toBeGreaterThan(0);
		expect(layout.windowScrollY).toBe(0);
		expect(layout.canvasTopAfter).toBe(layout.canvasTopBefore);
		expect(layout.canvasVisible).toBe(true);
		expect(layout.hudVisible).toBe(true);
	});
}
