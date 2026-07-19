export const ASSET_PATHS = {
	room: "/assets/generated/room.png",
	revolver: "/assets/generated/revolver.png",
	ralphyDown: "/assets/generated/ralphy/down-idle.png",
	ralphyUp: "/assets/generated/ralphy/up-idle.png",
	ralphyLeft: "/assets/generated/ralphy/left-idle.png",
	ralphyRight: "/assets/generated/ralphy/right-idle.png",
	ralphyDownMove: "/assets/generated/ralphy/down-move.png",
	ralphyUpMove: "/assets/generated/ralphy/up-move.png",
	ralphyLeftMove: "/assets/generated/ralphy/left-move.png",
	ralphyRightMove: "/assets/generated/ralphy/right-move.png",
	bullet: "/assets/generated/effects/bullet.png",
	impact: "/assets/generated/effects/impact.png",
	orbitTrail: "/assets/generated/effects/orbit-trail.png",
	teslaArc: "/assets/generated/effects/tesla-arc.png",
	shotgunSplit: "/assets/generated/effects/shotgun-split.png",
	spectralTrail: "/assets/generated/effects/spectral-trail.png",
	homingMarker: "/assets/generated/effects/homing-marker.png",
	freezeBurst: "/assets/generated/effects/freeze-burst.png",
	dummy: "/assets/generated/targets/dummy.png",
	chaser: "/assets/generated/targets/chaser.png",
	rock: "/assets/generated/targets/rock.png",
	crate: "/assets/generated/targets/crate.png",
	labMarker: "/assets/generated/targets/lab-marker.png",
	heartFull: "/assets/generated/ui/heart-full.png",
	heartHalf: "/assets/generated/ui/heart-half.png",
	heartEmpty: "/assets/generated/ui/heart-empty.png",
	ammoLoaded: "/assets/generated/ui/ammo-loaded.png",
	ammoEmpty: "/assets/generated/ui/ammo-empty.png",
	coin: "/assets/generated/ui/coin.png",
	bomb: "/assets/generated/ui/bomb.png",
	key: "/assets/generated/ui/key.png",
	reloadFrame: "/assets/generated/ui/reload-frame.png",
	reloadFill: "/assets/generated/ui/reload-fill.png",
	reloadZone: "/assets/generated/ui/reload-zone.png",
	reloadSuccess: "/assets/generated/ui/reload-success.png",
	twinChamber: "/assets/generated/artifacts/twin-chamber.png",
	bigIron: "/assets/generated/artifacts/big-iron.png",
	hollowPoint: "/assets/generated/artifacts/hollow-point.png",
	coldcaster: "/assets/generated/artifacts/coldcaster.png",
	pinball: "/assets/generated/artifacts/pinball.png",
	deadeye: "/assets/generated/artifacts/deadeye.png",
	haloChamber: "/assets/generated/artifacts/halo-chamber.png",
	ghostSight: "/assets/generated/artifacts/ghost-sight.png",
	teslaBullets: "/assets/generated/artifacts/tesla-bullets.png",
	shotgun: "/assets/generated/artifacts/shotgun.png",
	spectralBullets: "/assets/generated/artifacts/spectral-bullets.png",
} as const;

export type AssetKey = keyof typeof ASSET_PATHS;
export const REQUIRED_ASSET_KEYS = Object.keys(ASSET_PATHS) as AssetKey[];
export type Assets = {
	images: Partial<Record<AssetKey, HTMLImageElement>>;
	missing: AssetKey[];
};

export async function loadAssets(): Promise<Assets> {
	const images: Partial<Record<AssetKey, HTMLImageElement>> = {};
	const missing: AssetKey[] = [];
	await Promise.all(
		Object.entries(ASSET_PATHS).map(
			([rawKey, path]) =>
				new Promise<void>((resolve) => {
					const key = rawKey as AssetKey;
					const image = new Image();
					image.onload = () => {
						images[key] = image;
						resolve();
					};
					image.onerror = () => {
						missing.push(key);
						resolve();
					};
					image.src = path;
				}),
		),
	);
	return { images, missing };
}
