const ROOT_ASSET_PATHS = {
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
	echoFlash: "/assets/generated/effects/artifacts/echo-flash.png",
	burstFlash: "/assets/generated/effects/artifacts/burst-flash.png",
	sideShotFlash: "/assets/generated/effects/artifacts/side-shot-flash.png",
	bellRing: "/assets/generated/effects/artifacts/bell-ring.png",
	boneFan: "/assets/generated/effects/artifacts/bone-fan.png",
	graveBloomVfx: "/assets/generated/effects/artifacts/grave-bloom.png",
	soulSpirit: "/assets/generated/effects/artifacts/soul-spirit.png",
	coinMint: "/assets/generated/effects/artifacts/coin-mint.png",
	chillMark: "/assets/generated/effects/artifacts/chill-mark.png",
	iceShatter: "/assets/generated/effects/artifacts/ice-shatter.png",
	burnMark: "/assets/generated/effects/artifacts/burn-mark.png",
	emberRing: "/assets/generated/effects/artifacts/ember-ring.png",
	wantedMark: "/assets/generated/effects/artifacts/wanted-mark.png",
	ledgerMark: "/assets/generated/effects/artifacts/ledger-mark.png",
	hexPulse: "/assets/generated/effects/artifacts/hex-pulse.png",
	hollowExplosion: "/assets/generated/effects/artifacts/hollow-explosion.png",
	waveTrail: "/assets/generated/effects/artifacts/wave-trail.png",
	cometTail: "/assets/generated/effects/artifacts/comet-tail.png",
	returnLoop: "/assets/generated/effects/artifacts/return-loop.png",
	pinballRelay: "/assets/generated/effects/artifacts/pinball-relay.png",
	ectoplasmPool: "/assets/generated/effects/artifacts/ectoplasm-pool.png",
	ectoplasmTrail: "/assets/generated/effects/artifacts/ectoplasm-trail.png",
	crossfirePulse: "/assets/generated/effects/artifacts/crossfire-pulse.png",
	kineticExplosion: "/assets/generated/effects/artifacts/kinetic-explosion.png",
	ironMoonlet: "/assets/generated/effects/artifacts/iron-moonlet.png",
	ghostSatellite: "/assets/generated/effects/artifacts/ghost-satellite.png",
	recoilSkid: "/assets/generated/effects/artifacts/recoil-skid.png",
	stillwaterWard: "/assets/generated/effects/artifacts/stillwater-ward.png",
	dustlineAfterimage:
		"/assets/generated/effects/artifacts/dustline-afterimage.png",
	goldSoul: "/assets/generated/effects/artifacts/gold-soul.png",
	locketOrbital: "/assets/generated/effects/artifacts/locket-orbital.png",
	coatDecoy: "/assets/generated/effects/artifacts/coat-decoy.png",
	twinWeave: "/assets/generated/effects/artifacts/twin-weave.png",
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
	ammoEcho: "/assets/generated/ui/ammo-echo.png",
	dealerCut1: "/assets/generated/ui/dealer-cut-1.png",
	dealerCut2: "/assets/generated/ui/dealer-cut-2.png",
	dealerCut3: "/assets/generated/ui/dealer-cut-3.png",
	coin: "/assets/generated/ui/coin.png",
	bomb: "/assets/generated/ui/bomb.png",
	key: "/assets/generated/ui/key.png",
	reloadFrame: "/assets/generated/ui/reload-frame.png",
	reloadFill: "/assets/generated/ui/reload-fill.png",
	reloadZone: "/assets/generated/ui/reload-zone.png",
	reloadSuccess: "/assets/generated/ui/reload-success.png",
	arenaSprites: "/assets/generated/demo/arena-sprites.png",
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

export function resolveAssetPath(
	path: string,
	base = import.meta.env?.BASE_URL ?? "/",
): string {
	return base === "/" ? path : `${base}${path.slice(1)}`;
}

export const ASSET_PATHS = Object.fromEntries(
	Object.entries(ROOT_ASSET_PATHS).map(([key, path]) => [
		key,
		resolveAssetPath(path),
	]),
) as { readonly [K in keyof typeof ROOT_ASSET_PATHS]: string };

export type AssetKey = keyof typeof ASSET_PATHS;
export const NEW_ARTIFACT_VFX = [
	"echoFlash",
	"burstFlash",
	"sideShotFlash",
	"bellRing",
	"boneFan",
	"graveBloomVfx",
	"soulSpirit",
	"coinMint",
	"chillMark",
	"iceShatter",
	"burnMark",
	"emberRing",
	"wantedMark",
	"ledgerMark",
	"hexPulse",
	"hollowExplosion",
	"waveTrail",
	"cometTail",
	"returnLoop",
	"pinballRelay",
	"ectoplasmPool",
	"ectoplasmTrail",
	"crossfirePulse",
	"kineticExplosion",
	"ironMoonlet",
	"ghostSatellite",
	"recoilSkid",
	"stillwaterWard",
	"dustlineAfterimage",
	"goldSoul",
	"locketOrbital",
	"coatDecoy",
	"twinWeave",
] as const satisfies readonly AssetKey[];
export const RETAINED_ARTIFACT_VFX = [
	"orbitTrail",
	"homingMarker",
	"shotgunSplit",
	"spectralTrail",
	"teslaArc",
] as const satisfies readonly AssetKey[];
export const ARTIFACT_PRESENTATION_ASSETS = [
	...NEW_ARTIFACT_VFX,
	...RETAINED_ARTIFACT_VFX,
] as const satisfies readonly AssetKey[];
export const ARTIFACT_HUD_ASSETS = [
	"ammoEcho",
	"dealerCut1",
	"dealerCut2",
	"dealerCut3",
] as const satisfies readonly AssetKey[];
export const REQUIRED_ASSET_KEYS = Object.keys(ASSET_PATHS) as AssetKey[];
export type LoadedAssets = Record<AssetKey, HTMLImageElement>;

export async function loadAssets(): Promise<LoadedAssets> {
	const entries = await Promise.all(
		REQUIRED_ASSET_KEYS.map(
			(key) =>
				new Promise<readonly [AssetKey, HTMLImageElement]>((resolve, reject) => {
					const path = ASSET_PATHS[key];
					const image = new Image();
					image.onload = () => resolve([key, image]);
					image.onerror = () =>
						reject(
							new Error(
								`Required generated asset failed to load: ${key} (${path})`,
							),
						);
					image.src = path;
				}),
		),
	);
	return Object.fromEntries(entries) as LoadedAssets;
}
