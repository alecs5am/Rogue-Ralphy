import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
	ARTIFACT_HUD_ASSETS,
	ARTIFACT_PRESENTATION_ASSETS,
	ASSET_PATHS,
	loadAssets,
	NEW_ARTIFACT_VFX,
	REQUIRED_ASSET_KEYS,
	RETAINED_ARTIFACT_VFX,
} from "./assets";
import { ARTIFACT_CATALOG } from "./game/artifacts";

test("requires the animated Ralphy combat pack and no static predecessors", async () => {
	expect(ASSET_PATHS).toMatchObject({
		ralphyAtlas: "/assets/generated/ralphy/ralphy-atlas.png",
		ghostRevolver: "/assets/generated/ralphy/ghost-revolver.png",
		soulProjectile: "/assets/generated/effects/soul-projectile.png",
		muzzleFlash: "/assets/generated/effects/muzzle-flash.png",
	});
	expect(REQUIRED_ASSET_KEYS).toEqual(
		Object.keys(ASSET_PATHS) as typeof REQUIRED_ASSET_KEYS,
	);

	const obsolete = [
		"revolver",
		"ralphyDown",
		"ralphyUp",
		"ralphyLeft",
		"ralphyRight",
		"ralphyDownMove",
		"ralphyUpMove",
		"ralphyLeftMove",
		"ralphyRightMove",
		"bullet",
	];
	expect(obsolete.every((key) => !Object.hasOwn(ASSET_PATHS, key))).toBe(true);

	for (const path of Object.values(ASSET_PATHS).filter(
		(path) =>
			path.includes("ralphy-atlas") ||
			path.includes("ghost-revolver") ||
			path.includes("soul-projectile") ||
			path.includes("muzzle-flash"),
	)) {
		expect(await Bun.file(`public${path}`).exists()).toBe(true);
	}
});

test("all artifact icons are unique required PNG assets", () => {
	const paths = ARTIFACT_CATALOG.map(({ icon }) => ASSET_PATHS[icon]);
	expect(paths).toHaveLength(36);
	expect(new Set(paths).size).toBe(36);
	expect(
		paths.every(
			(path) =>
				path.startsWith("/assets/generated/artifacts/") &&
				path.endsWith(".png"),
		),
	).toBe(true);
	expect(
		ARTIFACT_CATALOG.every(({ icon }) =>
			REQUIRED_ASSET_KEYS.includes(icon),
		),
	).toBe(true);
});

test("shared VFX and HUD overlays are required existing PNGs", () => {
	expect(ASSET_PATHS.ammoEcho).toBe("/assets/generated/ui/ammo-echo.png");
	expect(ASSET_PATHS.dealerCut1).toBe(
		"/assets/generated/ui/dealer-cut-1.png",
	);
	expect(ASSET_PATHS.dealerCut2).toBe(
		"/assets/generated/ui/dealer-cut-2.png",
	);
	expect(ASSET_PATHS.dealerCut3).toBe(
		"/assets/generated/ui/dealer-cut-3.png",
	);
	for (const key of NEW_ARTIFACT_VFX)
		expect(REQUIRED_ASSET_KEYS).toContain(key);
	for (const key of ARTIFACT_PRESENTATION_ASSETS)
		expect(REQUIRED_ASSET_KEYS).toContain(key);
	expect(NEW_ARTIFACT_VFX).toHaveLength(33);
	expect(RETAINED_ARTIFACT_VFX).toHaveLength(5);
	expect(ARTIFACT_PRESENTATION_ASSETS).toHaveLength(38);
	expect(
		new Set([...NEW_ARTIFACT_VFX, ...RETAINED_ARTIFACT_VFX]).size,
	).toBe(38);
	expect(ARTIFACT_HUD_ASSETS).toHaveLength(4);
	expect(
		Object.values(ASSET_PATHS).every((path) => existsSync(`public${path}`)),
	).toBe(true);
	expect(Object.values(ASSET_PATHS).every((path) => path.endsWith(".png"))).toBe(
		true,
	);
	expect(Object.values(ASSET_PATHS).every((path) => !path.endsWith(".svg"))).toBe(
		true,
	);
});

test("asset preflight rejects with the missing key and PNG path", async () => {
	const previous = Object.getOwnPropertyDescriptor(globalThis, "Image");
	class FakeImage {
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;

		set src(path: string) {
			queueMicrotask(() =>
				path.endsWith("/twin-weave.png")
					? this.onerror?.()
					: this.onload?.(),
			);
		}
	}
	Object.defineProperty(globalThis, "Image", {
		configurable: true,
		value: FakeImage,
	});
	try {
		await expect(loadAssets()).rejects.toThrow(/twinWeave.*twin-weave\.png/);
	} finally {
		if (previous) Object.defineProperty(globalThis, "Image", previous);
		else Reflect.deleteProperty(globalThis, "Image");
	}
});
