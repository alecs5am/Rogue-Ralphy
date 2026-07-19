import { expect, test } from "bun:test";
import { ASSET_PATHS, REQUIRED_ASSET_KEYS } from "./assets";

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
