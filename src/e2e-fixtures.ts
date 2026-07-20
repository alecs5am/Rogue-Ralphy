import { ARTIFACT_IDS, type ArtifactId } from "./game/artifacts";
import type { VfxCommand } from "./game/combat-effects";
import { createCylinder, startReload } from "./game/cylinder";
import type { ProjectileState } from "./game/projectiles";
import {
	chooseRunArtifact,
	createGame,
	createRunGame,
	setArtifactLoadout,
	type GameState,
} from "./game/simulation";
import { createTargetEffects } from "./game/statuses";

export const E2E_FIXTURE_MARKER = "__RALPHY_E2E_FIXTURE__" as const;

type ProjectileCue = Readonly<{
	id: string;
	x: number;
	y: number;
	activatedEffectIds?: readonly string[];
	emission?: Readonly<{ artifactId: ArtifactId; effectId: string }>;
	homingTargetId?: string;
	homingMarkerRemaining?: number;
	splitParentId?: string;
	bigIronMain?: Readonly<{
		moonletId: string;
		mainDamage: number;
		heading: number;
	}>;
}>;

const commands = [
	{
		id: "fixture-last-bell",
		artifactId: "lastBell",
		effectId: "lastBell.rings",
		rootTriggerId: "fixture-root:last-bell",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "lastBell.ring",
		geometry: { type: "radius", center: { x: 190, y: 150 }, radius: 44 },
	},
	{
		id: "fixture-pinball",
		artifactId: "pinball",
		effectId: "pinball.relay",
		rootTriggerId: "fixture-root:pinball",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "pinball.relay",
		targetId: "fixture-target",
		geometry: { type: "link", from: { x: 250, y: 160 }, to: { x: 560, y: 280 } },
	},
	{
		id: "fixture-shotgun",
		artifactId: "shotgun",
		effectId: "shotgun.split",
		rootTriggerId: "fixture-root:shotgun",
		lineageId: "fixture-lineage:shotgun",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "shotgun.split",
		geometry: { type: "heading", at: { x: 700, y: 180 }, heading: 0 },
	},
	{
		id: "fixture-hollow",
		artifactId: "hollowPoint",
		effectId: "hollowPoint.explosion",
		rootTriggerId: "fixture-root:hollow",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "hollowPoint.explosion",
		geometry: { type: "radius", center: { x: 760, y: 390 }, radius: 40 },
	},
	{
		id: "fixture-chill",
		artifactId: "coldcaster",
		effectId: "coldcaster.chill",
		rootTriggerId: "fixture-root:chill",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "coldcaster.chill",
		geometry: { type: "target", targetId: "fixture-target", at: { x: 560, y: 280 } },
	},
	{
		id: "fixture-freeze",
		artifactId: "coldcaster",
		effectId: "coldcaster.freeze",
		rootTriggerId: "fixture-root:freeze",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "coldcaster.freeze",
		geometry: { type: "target", targetId: "fixture-target", at: { x: 560, y: 280 } },
	},
	{
		id: "fixture-burn",
		artifactId: "cinderGospel",
		effectId: "cinderGospel.burn",
		rootTriggerId: "fixture-root:burn",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "cinderGospel.burn",
		geometry: { type: "target", targetId: "fixture-target", at: { x: 560, y: 280 } },
	},
	{
		id: "fixture-ember",
		artifactId: "cinderGospel",
		effectId: "cinderGospel.emberRing",
		rootTriggerId: "fixture-root:ember",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "cinderGospel.emberRing",
		geometry: { type: "radius", center: { x: 670, y: 400 }, radius: 48 },
	},
	{
		id: "fixture-ledger",
		artifactId: "widowsLedger",
		effectId: "widowsLedger.notches",
		rootTriggerId: "fixture-root:ledger",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "widowsLedger.notch",
		geometry: { type: "target", targetId: "fixture-target", at: { x: 560, y: 280 } },
	},
	{
		id: "fixture-hex",
		artifactId: "hexBell",
		effectId: "hexBell.pulse",
		rootTriggerId: "fixture-root:hex",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "hexBell.pulse",
		targetId: "fixture-target",
		geometry: { type: "radius", center: { x: 560, y: 280 }, radius: 64 },
	},
	{
		id: "fixture-iron",
		artifactId: "bigIron",
		effectId: "bigIron.kineticExplosion",
		rootTriggerId: "fixture-root:iron",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "bigIron.kineticExplosion",
		geometry: { type: "radius", center: { x: 790, y: 290 }, radius: 42 },
	},
	{
		id: "fixture-recoil",
		artifactId: "recoilBoots",
		effectId: "recoilBoots.recoil",
		rootTriggerId: "fixture-root:recoil",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "recoilBoots.skid",
		geometry: { type: "point", at: { x: 390, y: 430 } },
	},
	{
		id: "fixture-stillwater",
		artifactId: "stillwater",
		effectId: "stillwater.charge",
		rootTriggerId: "fixture-root:stillwater",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "stillwater.ward",
		geometry: { type: "point", at: { x: 480, y: 288 } },
	},
	{
		id: "fixture-dustline",
		artifactId: "dustlineDuel",
		effectId: "dustlineDuel.afterimage",
		rootTriggerId: "fixture-root:dustline",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "world",
		kind: "dustlineDuel.snapshot",
		geometry: { type: "heading", at: { x: 290, y: 390 }, heading: Math.PI / 8 },
	},
	{
		id: "fixture-bonanza",
		artifactId: "bonanzaClip",
		effectId: "bonanzaClip.refund",
		rootTriggerId: "fixture-root:bonanza",
		bornAt: 0.5,
		expiresAt: 1.5,
		destination: "hud",
		kind: "bonanza.delivery",
		geometry: { type: "hudDelivery", from: { x: 480, y: 288 }, slot: 2, arrivesAt: 1.25 },
	},
] as const satisfies readonly VfxCommand[];

const projectileCues = [
	{
		id: "fixture-core",
		x: 350,
		y: 230,
		activatedEffectIds: [
			"twinChamber.pair",
			"lastBell.round",
			"fanThePhantom.fan",
			"dealersCut.sidePair",
			"haloChamber.spiral",
			"ghostSight.homing",
			"wailingLead.wave",
			"undertakersReturn.return",
			"cometSpur.comet",
			"shotgun.split",
			"spectralBullets.penetration",
		],
		homingTargetId: "fixture-target",
		homingMarkerRemaining: 1,
		splitParentId: "fixture-parent",
		bigIronMain: { moonletId: "fixture-moonlet", mainDamage: 4, heading: 0 },
	},
	{ id: "fixture-tesla-peer", x: 430, y: 230 },
	{ id: "fixture-deadeye", x: 330, y: 330, emission: { artifactId: "deadeye", effectId: "deadeye.echo" } },
	{ id: "fixture-grave-echo", x: 370, y: 330, emission: { artifactId: "graveEcho", effectId: "graveEcho.echo" } },
	{ id: "fixture-bone", x: 410, y: 330, emission: { artifactId: "boneOrchard", effectId: "boneOrchard.shards" } },
	{ id: "fixture-bloom", x: 450, y: 330, emission: { artifactId: "graveBloom", effectId: "graveBloom.expiry" } },
	{ id: "fixture-soul", x: 490, y: 330, emission: { artifactId: "soulHarvester", effectId: "soulHarvester.spirits" } },
	{ id: "fixture-mint", x: 530, y: 330, emission: { artifactId: "bootlegMint", effectId: "bootlegMint.copy" } },
] as const satisfies readonly ProjectileCue[];

export const E2E_FIXTURE_DESCRIPTIONS = {
	"presentation-all": {
		kind: "presentation",
		time: 1,
		paused: true,
		artifacts: ARTIFACT_IDS,
		dealerCounter: 2,
		projectileCues,
		commands,
	},
	"death-ready": {
		kind: "death",
		time: 1,
		paused: false,
		artifacts: ARTIFACT_IDS,
		health: 0,
		diedAt: 1,
	},
	"reload-ready": {
		kind: "reload",
		time: 0.75,
		paused: true,
		artifacts: ARTIFACT_IDS,
		ammo: 3,
		reloadKind: "manual",
	},
	"demo-ready": {
		kind: "demo",
		time: 1,
		wave: 10,
		bossHealthRatio: 0.5,
		pickup: "damage",
	},
	"complete-ready": {
		kind: "complete",
		time: 1,
		wave: 10,
		artifactsTaken: 10,
	},
} as const;

type FixtureId = keyof typeof E2E_FIXTURE_DESCRIPTIONS;
const fixtureIds = new Set<string>(Object.keys(E2E_FIXTURE_DESCRIPTIONS));

function projectile(cue: ProjectileCue): ProjectileState {
	return {
		id: cue.id,
		triggerId: `fixture-trigger:${cue.id}`,
		x: cue.x,
		y: cue.y,
		vx: 360,
		vy: 0,
		speed: 360,
		radius: 7,
		damage: 4,
		lifetime: 2,
		bornAt: 0.5,
		rootTriggerId: `fixture-root:${cue.id}`,
		lineageId: `fixture-lineage:${cue.id}`,
		localOrdinal: 0,
		generation: 0,
		originPower: 4,
		activatedEffectIds: cue.activatedEffectIds ?? [],
		reactiveEffectIds: [],
		emittedEffectIds: [],
		...(cue.emission ? { emission: cue.emission } : {}),
		behaviors: {},
		remainingBounces: 0,
		bounceRetention: 1,
		freezeChance: 0,
		freezeDuration: 0,
		hitTargetIds: [],
		everHit: false,
		travelled: 80,
		maxTravel: 600,
		...(cue.homingTargetId ? { homingTargetId: cue.homingTargetId } : {}),
		...(cue.homingMarkerRemaining !== undefined
			? { homingMarkerRemaining: cue.homingMarkerRemaining }
			: {}),
		...(cue.splitParentId ? { splitParentId: cue.splitParentId } : {}),
		...(cue.bigIronMain ? { bigIronMain: cue.bigIronMain } : {}),
	};
}

function presentationFixture(): GameState {
	let state = setArtifactLoadout(
		createGame(() => 0.9),
		Object.fromEntries(ARTIFACT_IDS.map((id) => [id, true])),
	);
	const projectiles = projectileCues.map(projectile);
	const sourceProjectile = projectiles[0]!;
	const target = {
		id: "fixture-target",
		x: 560,
		y: 280,
		radius: 20,
		health: 80,
		maxHealth: 80,
		kind: "dummy" as const,
		immortal: true,
		speed: 0,
		frozenUntil: 0,
		effects: createTargetEffects(),
	};
	const echo = state.weapon.echo!;
	state = {
		...state,
		time: 1,
		paused: true,
		dealerCounter: 2,
		cylinder: {
			...state.cylinder,
			slots: state.cylinder.slots.map(() => ({ loaded: true, echo })) as unknown as GameState["cylinder"]["slots"],
		},
		projectiles,
		targets: [target],
		vfxCommands: [...commands],
		teslaLinks: [{
			id: "fixture-tesla-link",
			a: "fixture-core",
			b: "fixture-tesla-peer",
			distance: 80,
			damageScale: 0.25,
			cooldown: 0.15,
		}],
		areas: [{
			id: "fixture-snare",
			kind: "snare",
			effectId: "ectoplasmSnare.pool",
			artifactId: "ectoplasmSnare",
			rootTriggerId: "fixture-root:snare",
			lineageId: "fixture-lineage:snare",
			instanceKey: "root",
			bornAt: 0.5,
			expiresAt: 1.5,
			tickInterval: 0.1,
			nextTickAt: 1.1,
			x: 210,
			y: 400,
			radius: 36,
			damage: 1,
			slow: 0.5,
			originPower: 4,
			generation: 0,
			reactiveEligible: true,
			reactiveEffectIds: [],
		}],
		wakeTrails: {
			"fixture-wake": {
				lineageId: "fixture-wake",
				rootTriggerId: "fixture-root:wake",
				artifactId: "ectoplasmicWake",
				effectId: "ectoplasmicWake.trail",
				nextTickAt: 1.1,
				tickInterval: 0.1,
				cooldown: 0.2,
				width: 14,
				duration: 1.5,
				damageScale: 0.05,
				segments: [{
					id: "fixture-wake-segment",
					from: { x: 180, y: 470 },
					to: { x: 420, y: 470 },
					bornAt: 0.5,
					completeAt: 0.75,
					expiresAt: 1.5,
					duration: 1,
					width: 14,
					damage: 1,
					sourceProjectile,
				}],
			},
		},
		crossfirePulses: [{
			id: "fixture-crossfire",
			pairId: "fixture-pair",
			rootTriggerId: "fixture-root:crossfire",
			bornAt: 0.5,
			expiresAt: 1.5,
			x: 650,
			y: 470,
			ax: 1,
			ay: 0,
			bx: 0,
			by: 1,
			length: 48,
			damage: 1,
			projectileId: "fixture-core",
		}],
		satellites: [{
			id: "fixture-satellite",
			rootTriggerId: "fixture-root:satellite",
			bornAt: 0.5,
			expiresAt: 1.5,
			radius: 40,
			shotDamageScale: 0.2,
			phase: 0,
			x: 520,
			y: 420,
		}],
		wantedBrand: {
			targetId: target.id,
			markedAt: 0.5,
			expiresAt: 1.5,
			artifactId: "wantedBrand",
			effectId: "wantedBrand.brand",
			rootTriggerId: "fixture-root:wanted",
			lineageId: "fixture-lineage:wanted",
		},
		locketOrbitals: [{
			id: "fixture-locket",
			slot: 0,
			rootTriggerId: "fixture-root:locket",
			rootIndex: 1,
			lineageId: "fixture-lineage:locket",
			localOrdinal: 0,
			eligibleEffectIds: [],
			reactiveEffectIds: [],
			sourceSpec: { heading: 0, ...state.weapon.projectileBase },
			originPower: 4,
			damage: 4,
			radius: 40,
			hitRadius: 8,
			angle: Math.PI / 3,
			angularSpeed: Math.PI * 2,
			bornAt: 0.5,
			expiresAt: 1.5,
		}],
		decoy: { x: 720, y: 470, expiresAt: 1.5 },
	};
	return state;
}

function deathFixture(): GameState {
	const state = setArtifactLoadout(
		createGame(() => 0.9),
		Object.fromEntries(ARTIFACT_IDS.map((id) => [id, true])),
	);
	return {
		...state,
		time: 1,
		paused: false,
		player: { ...state.player, health: 0, vx: 0, vy: 0 },
		diedAt: 1,
	};
}

function reloadFixture(): GameState {
	const state = setArtifactLoadout(
		createGame(() => 0.9),
		Object.fromEntries(ARTIFACT_IDS.map((id) => [id, true])),
	);
	return {
		...state,
		time: 0.75,
		paused: true,
		cylinder: startReload(createCylinder(3), state.weapon, 0, "manual"),
	};
}

function demoFixture(): GameState {
	let state = createRunGame(() => 0.42);
	state = {
		...state,
		run: { ...state.run!, wave: 10, phase: "choice" },
	};
	state = chooseRunArtifact(state, state.run!.choices[0]);
	return {
		...state,
		time: 1,
		targets: state.targets.map((target) => target.kind === "sheriffBoss"
			? { ...target, health: target.maxHealth * 0.5, ai: { ...target.ai!, nextShotAt: 100 } }
			: target),
		pickups: [{ id: "fixture-pickup", kind: "damage", x: state.player.x + 130, y: state.player.y, radius: 16 }],
		pickupNotice: { text: "+8% DAMAGE", expiresAt: 999 },
	};
}

function completeFixture(): GameState {
	let state = createRunGame(() => 0.42);
	state = setArtifactLoadout(
		state,
		Object.fromEntries(ARTIFACT_IDS.slice(0, 10).map((id) => [id, true])),
	);
	return {
		...state,
		time: 1,
		targets: [],
		pickups: [],
		run: { ...state.run!, phase: "complete", wave: 10, artifactsTaken: 10, choices: [] },
	};
}

export function materializeFixture(id: string | null): GameState | undefined {
	if (!id || !fixtureIds.has(id)) return undefined;
	const fixtureId = id as FixtureId;
	const kind = E2E_FIXTURE_DESCRIPTIONS[fixtureId].kind;
	if (kind === "presentation") return presentationFixture();
	if (kind === "death") return deathFixture();
	if (kind === "reload") return reloadFixture();
	if (kind === "demo") return demoFixture();
	return completeFixture();
}
