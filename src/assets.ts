export const ASSET_PATHS = {
	room: "/assets/generated/room.png",
	ralphyAtlas: "/assets/generated/ralphy/ralphy-atlas.png",
	ghostRevolver: "/assets/generated/ralphy/ghost-revolver.png",
	soulProjectile: "/assets/generated/effects/soul-projectile.png",
	muzzleFlash: "/assets/generated/effects/muzzle-flash.png",
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
	lastBell: "/assets/generated/artifacts/last-bell.png",
	graveEcho: "/assets/generated/artifacts/grave-echo.png",
	fanThePhantom: "/assets/generated/artifacts/fan-the-phantom.png",
	dealersCut: "/assets/generated/artifacts/dealers-cut.png",
	bigIron: "/assets/generated/artifacts/big-iron.png",
	hollowPoint: "/assets/generated/artifacts/hollow-point.png",
	coldcaster: "/assets/generated/artifacts/coldcaster.png",
	cinderGospel: "/assets/generated/artifacts/cinder-gospel.png",
	wantedBrand: "/assets/generated/artifacts/wanted-brand.png",
	widowsLedger: "/assets/generated/artifacts/widows-ledger.png",
	ectoplasmSnare: "/assets/generated/artifacts/ectoplasm-snare.png",
	hexBell: "/assets/generated/artifacts/hex-bell.png",
	pinball: "/assets/generated/artifacts/pinball.png",
	deadeye: "/assets/generated/artifacts/deadeye.png",
	haloChamber: "/assets/generated/artifacts/halo-chamber.png",
	ghostSight: "/assets/generated/artifacts/ghost-sight.png",
	wailingLead: "/assets/generated/artifacts/wailing-lead.png",
	undertakersReturn: "/assets/generated/artifacts/undertakers-return.png",
	cometSpur: "/assets/generated/artifacts/comet-spur.png",
	teslaBullets: "/assets/generated/artifacts/tesla-bullets.png",
	shotgun: "/assets/generated/artifacts/shotgun.png",
	spectralBullets: "/assets/generated/artifacts/spectral-bullets.png",
	boneOrchard: "/assets/generated/artifacts/bone-orchard.png",
	graveBloom: "/assets/generated/artifacts/grave-bloom.png",
	soulHarvester: "/assets/generated/artifacts/soul-harvester.png",
	bootlegMint: "/assets/generated/artifacts/bootleg-mint.png",
	ghostPosse: "/assets/generated/artifacts/ghost-posse.png",
	ectoplasmicWake: "/assets/generated/artifacts/ectoplasmic-wake.png",
	crossfireCovenant: "/assets/generated/artifacts/crossfire-covenant.png",
	recoilBoots: "/assets/generated/artifacts/recoil-boots.png",
	stillwater: "/assets/generated/artifacts/stillwater.png",
	dustlineDuel: "/assets/generated/artifacts/dustline-duel.png",
	bonanzaClip: "/assets/generated/artifacts/bonanza-clip.png",
	lastGaspLocket: "/assets/generated/artifacts/last-gasp-locket.png",
	undertakersCoat: "/assets/generated/artifacts/undertakers-coat.png",
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
