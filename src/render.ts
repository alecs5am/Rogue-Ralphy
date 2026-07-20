import type { AssetKey, LoadedAssets } from "./assets";
import {
	RALPHY_ATLAS,
	selectRalphyPose,
	type RalphyPose,
} from "./game/presentation";
import type { GameState, Point } from "./game/simulation";
import type { TargetKind } from "./game/combat-effects";
import {
	assertNever,
	projectEffectDraws,
	type EffectDraw,
	type EffectDrawLayer,
} from "./render-effects";

type RenderOptions = { reducedMotion: boolean };
const round = (value: number) => Math.round(value);
const SCREEN = { width: 960, height: 576 } as const;
const DEMO_CELL = 1254 / 4;
const DEMO_SPRITES = {
    skullRaider: [0, 0],
    candleShooter: [1, 0],
    batSpirit: [2, 0],
    tombBrute: [3, 0],
    splitSlime: [0, 1],
    sniperEye: [1, 1],
    barrelBomber: [2, 1],
    healerLantern: [3, 1],
    fastBandit: [0, 2],
    bellSummoner: [1, 2],
    sheriffBoss: [2, 2],
    health: [0, 3],
    fireRate: [1, 3],
    capacity: [1, 3],
    damage: [2, 3],
    reload: [2, 3],
    speed: [2, 3],
	destructibleCrate: [2, 3],
    stoneBlock: [3, 3],
} as const satisfies Record<string, readonly [number, number]>;
const PICKUP_LABELS = {
	health: "+HP",
	speed: "+SPEED",
	damage: "+DAMAGE",
	fireRate: "+FIRE RATE",
	reload: "+RELOAD",
	capacity: "+CHAMBER",
} as const;

export type Viewport = Readonly<{ x: number; y: number; width: number; height: number }>;
export function projectViewport(state: GameState): Viewport {
    return {
        x: Math.max(0, Math.min(state.room.width - SCREEN.width, state.player.x - SCREEN.width / 2)),
        y: Math.max(0, Math.min(state.room.height - SCREEN.height, state.player.y - SCREEN.height / 2)),
        width: SCREEN.width,
        height: SCREEN.height,
    };
}

function imageAt(
	context: CanvasRenderingContext2D,
	assets: LoadedAssets,
	key: AssetKey,
	x: number,
	y: number,
	width: number,
	height = width,
): void {
	context.drawImage(
		assets[key],
		round(x),
		round(y),
		round(width),
		round(height),
	);
}

function centeredImage(
	context: CanvasRenderingContext2D,
	assets: LoadedAssets,
	key: AssetKey,
	point: Point,
	size: number,
): void {
	imageAt(
		context,
		assets,
		key,
		point.x - size / 2,
		point.y - size / 2,
		size,
		size,
	);
}

function atlasCell(
    context: CanvasRenderingContext2D,
    assets: LoadedAssets,
    key: keyof typeof DEMO_SPRITES,
    point: Point,
    size: number,
): void {
    const [column, row] = DEMO_SPRITES[key];
    context.drawImage(
        assets.arenaSprites,
        Math.floor(column * DEMO_CELL),
        Math.floor(row * DEMO_CELL),
        Math.floor(DEMO_CELL),
        Math.floor(DEMO_CELL),
        round(point.x - size / 2),
        round(point.y - size / 2),
        round(size),
        round(size),
    );
}

function drawRalphyFrame(
	context: CanvasRenderingContext2D,
	assets: LoadedAssets,
	pose: RalphyPose,
	x: number,
	y: number,
): void {
	const atlas = assets.ralphyAtlas;
	const { cellSize, destinationSize, anchorX, anchorY } = RALPHY_ATLAS;
	context.save();
	context.translate(round(x), round(y));
	if (pose.flipX) context.scale(-1, 1);
	context.drawImage(
		atlas,
		pose.frame.col * cellSize,
		pose.frame.row * cellSize,
		cellSize,
		cellSize,
		round((-destinationSize * anchorX) / cellSize),
		round((-destinationSize * anchorY) / cellSize),
		destinationSize,
		destinationSize,
	);
	context.restore();
}

function drawTargets(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
): void {
	for (const target of state.targets) {
        if (target.kind === "dummy" || target.kind === "chaser")
            centeredImage(context, assets, target.kind, target, target.kind === "dummy" ? 66 : 58);
		else if (target.kind === "destructibleCrate")
			centeredImage(context, assets, "crate", target, 62);
        else atlasCell(context, assets, target.kind as keyof typeof DEMO_SPRITES, target, target.kind === "sheriffBoss" ? 112 : 62);
		if (target.ai?.dropsBonus) {
			const pulse = 3 + Math.sin(state.time * 8 + target.ai.phase) * 2;
			context.strokeStyle = "#f7d774";
			context.lineWidth = 3;
			context.beginPath();
			context.arc(round(target.x), round(target.y), target.radius + 8 + pulse, 0, Math.PI * 2);
			context.stroke();
			context.fillStyle = "#f7d774";
			context.font = "bold 11px ui-monospace, monospace";
			context.textAlign = "center";
			context.fillText(target.kind === "destructibleCrate" ? "REWARD" : "BONUS", round(target.x), round(target.y - target.radius - 15));
			context.textAlign = "start";
		}
		if (target.kind === "sheriffBoss" && target.ai) {
			const windup = target.ai.nextShotAt - state.time;
			if (windup >= 0 && windup < 0.35) {
				context.strokeStyle = windup < 0.12 ? "#fff3b0" : "#ff6b3d";
				context.lineWidth = 5;
				context.beginPath();
				context.arc(round(target.x), round(target.y), target.radius + 18 + windup * 30, 0, Math.PI * 2);
				context.stroke();
			}
		}
		if (target.frozenUntil > state.time) {
			context.strokeStyle = "#8fe9ff";
			context.lineWidth = 3;
			context.beginPath();
			context.arc(
				round(target.x),
				round(target.y),
				target.radius + 6,
				0,
				Math.PI * 2,
			);
			context.stroke();
			imageAt(
				context,
				assets,
				"freezeBurst",
				target.x - 16,
				target.y - target.radius - 24,
				32,
			);
		}
		if (target.kind !== "dummy") {
			context.fillStyle = "#0a0a0b";
			context.fillRect(
				round(target.x - 20),
				round(target.y + target.radius + 8),
				40,
				5,
			);
			context.fillStyle = target.kind === "destructibleCrate" ? "#f7d774" : "#ffa630";
			context.fillRect(
				round(target.x - 19),
				round(target.y + target.radius + 9),
				round((38 * target.health) / target.maxHealth),
				3,
			);
		}
	}
}

function drawPickupsAndHazards(context: CanvasRenderingContext2D, state: GameState, assets: LoadedAssets): void {
	for (const pickup of state.pickups) {
		const pulse = 3 + Math.sin(state.time * 9 + pickup.x) * 2;
		context.fillStyle = "#f7d77433";
		context.strokeStyle = "#f7d774";
		context.lineWidth = 3;
		context.beginPath();
		context.arc(round(pickup.x), round(pickup.y), 25 + pulse, 0, Math.PI * 2);
		context.fill();
		context.stroke();
		atlasCell(context, assets, pickup.kind, pickup, 50);
		context.fillStyle = "#fff3b0";
		context.font = "bold 10px ui-monospace, monospace";
		context.textAlign = "center";
		context.fillText(PICKUP_LABELS[pickup.kind], round(pickup.x), round(pickup.y - 31));
	}
	context.textAlign = "start";
	context.lineWidth = 2;
    for (const hazard of state.hazards) {
		context.fillStyle = hazard.boss ? "#9d4edd" : "#ff6b3d";
		context.strokeStyle = hazard.boss ? "#fff3b0" : "#f7d774";
        context.beginPath();
        context.arc(round(hazard.x), round(hazard.y), hazard.radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    }
}

function drawBaseProjectiles(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
): void {
	for (const projectile of state.projectiles) {
		const size = Math.max(10, projectile.radius * 4.2);
		centeredImage(context, assets, "soulProjectile", projectile, size);
	}
}

function drawTiledSegment(
	context: CanvasRenderingContext2D,
	assets: LoadedAssets,
	draw: EffectDraw,
	from: Point,
	to: Point,
	width: number,
): void {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const distance = Math.hypot(dx, dy);
	const angle = Math.atan2(dy, dx);
	const tile = Math.max(12, width * 1.35);
	const count = Math.max(1, Math.ceil(distance / tile));
	for (let index = 0; index <= count; index += 1) {
		const progress = count === 0 ? 0 : index / count;
		context.save();
		context.translate(round(from.x + dx * progress), round(from.y + dy * progress));
		context.rotate(angle);
		imageAt(context, assets, draw.asset, -tile / 2, -width / 2, tile, width);
		context.restore();
	}
}

function drawEffect(
	context: CanvasRenderingContext2D,
	assets: LoadedAssets,
	draw: EffectDraw,
): void {
	context.save();
	context.globalAlpha = draw.essential ? 0.9 : 0.72;
	const geometry = draw.geometry;
	switch (geometry.type) {
		case "sprite":
			context.translate(round(geometry.x), round(geometry.y));
			context.rotate(geometry.rotation + draw.phase * Math.PI * 2);
			imageAt(context, assets, draw.asset, -geometry.size / 2, -geometry.size / 2, geometry.size);
			break;
		case "disc":
			context.translate(round(geometry.x), round(geometry.y));
			context.rotate(draw.phase * Math.PI * 2);
			imageAt(context, assets, draw.asset, -geometry.radius, -geometry.radius, geometry.radius * 2);
			break;
		case "path":
			for (const segment of geometry.segments)
				drawTiledSegment(context, assets, draw, segment.from, segment.to, geometry.width);
			break;
		case "hudDelivery":
			break;
		default:
			assertNever(geometry);
	}
	context.restore();
}

function drawEffectLayer(
	context: CanvasRenderingContext2D,
	assets: LoadedAssets,
	draws: readonly EffectDraw[],
	layer: EffectDrawLayer,
): void {
	for (const draw of draws) if (draw.layer === layer) drawEffect(context, assets, draw);
}

function drawPlayer(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
	options: RenderOptions,
): void {
	const pose = selectRalphyPose(state, options.reducedMotion);
	const aim = Math.atan2(
		state.aim.y - state.player.y,
		state.aim.x - state.player.x,
	);
	const bob =
		options.reducedMotion || pose.state !== "move"
			? 0
			: Math.round(Math.sin(state.time * 14) * 2);
	const bodyX = state.player.x - Math.cos(aim) * pose.bodyRecoil;
	const bodyY = state.player.y + bob - Math.sin(aim) * pose.bodyRecoil;
	drawRalphyFrame(context, assets, pose, bodyX, bodyY);

	if (pose.state === "death") return;
	context.save();
	context.translate(round(bodyX), round(bodyY));
	context.rotate(aim + Math.sin(pose.gunSpin) * 0.08);
	imageAt(
		context,
		assets,
		"ghostRevolver",
		9 - pose.gunRecoil,
		-32,
		64,
	);
	if (pose.state === "fire" && pose.frame.col % 4 === 0) {
		imageAt(
			context,
			assets,
			"muzzleFlash",
			55 - pose.gunRecoil,
			-16,
			32,
		);
	}
	context.restore();
}

function drawDamage(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
	reducedMotion: boolean,
): void {
	context.textAlign = "center";
	context.font = "bold 18px ui-monospace, monospace";
	for (const event of state.metrics.hitEvents) {
		const age = state.time - event.time;
		if (age < 0 || age > 0.7) continue;
		const target = state.targets.find(
			(candidate) => candidate.id === event.targetId,
		);
		const point =
			event.x === undefined || event.y === undefined
				? target
				: { x: event.x, y: event.y };
		if (!point) continue;
		const y =
			point.y -
			(target?.radius ?? 18) -
			18 -
			(reducedMotion ? 0 : age * 28);
		context.globalAlpha = Math.max(0, 1 - age / 0.7);
		if (!reducedMotion) centeredImage(context, assets, "impact", point, 34);
		context.fillStyle = "#f5f5f4";
		context.fillText(`${Math.round(event.damage)}`, round(point.x), round(y));
	}
	context.globalAlpha = 1;
	context.textAlign = "start";
}

function drawAim(context: CanvasRenderingContext2D, state: GameState): void {
	context.strokeStyle = "#ffa630";
	context.lineWidth = 2;
	context.beginPath();
	context.moveTo(round(state.aim.x - 7), round(state.aim.y));
	context.lineTo(round(state.aim.x + 7), round(state.aim.y));
	context.moveTo(round(state.aim.x), round(state.aim.y - 7));
	context.lineTo(round(state.aim.x), round(state.aim.y + 7));
	context.stroke();
}

function drawMinimap(context: CanvasRenderingContext2D, state: GameState, viewport: Viewport): void {
    if (!state.run) return;
    const width = 150;
    const height = 90;
    const x = SCREEN.width - width - 18;
    const y = 18;
    const sx = width / state.room.width;
    const sy = height / state.room.height;
    context.save();
    context.globalAlpha = 0.86;
    context.fillStyle = "#0a0a0b";
    context.fillRect(x - 4, y - 4, width + 8, height + 8);
    context.strokeStyle = "#f7d774";
    context.strokeRect(x - 4, y - 4, width + 8, height + 8);
    context.fillStyle = "#2b221c";
    context.fillRect(x, y, width, height);
    context.strokeStyle = "#9ca3af";
    context.strokeRect(x + viewport.x * sx, y + viewport.y * sy, viewport.width * sx, viewport.height * sy);
    context.fillStyle = "#e7f7ff";
    context.fillRect(x + state.player.x * sx - 2, y + state.player.y * sy - 2, 4, 4);
    context.fillStyle = "#ff6b3d";
	for (const target of state.targets) {
		if (target.kind === "destructibleCrate") {
			context.fillStyle = "#c38b45";
			context.fillRect(x + target.x * sx - 2, y + target.y * sy - 2, 4, 4);
		} else {
			context.fillStyle = target.ai?.dropsBonus ? "#f7d774" : "#ff6b3d";
			context.fillRect(x + target.x * sx - 1.5, y + target.y * sy - 1.5, 3, 3);
		}
	}
    context.fillStyle = "#f7d774";
	for (const pickup of state.pickups) context.fillRect(x + pickup.x * sx - 2, y + pickup.y * sy - 2, 4, 4);
    context.restore();
}

export function renderGame(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
	options: RenderOptions,
): void {
    context.imageSmoothingEnabled = false;
    const viewport = projectViewport(state);
    context.clearRect(0, 0, SCREEN.width, SCREEN.height);
    context.save();
    context.translate(-viewport.x, -viewport.y);
    context.drawImage(assets.room, 0, 0, state.room.width, state.room.height);
    for (const prop of state.roomProps) {
        if (prop.kind === "stoneBlock") atlasCell(context, assets, "stoneBlock", prop, prop.size);
        else centeredImage(context, assets, prop.kind, { x: prop.x, y: prop.y }, prop.size);
    }
    const effectDraws = projectEffectDraws(state, options.reducedMotion);
    drawEffectLayer(context, assets, effectDraws, "areas-trails");
    drawTargets(context, state, assets);
    drawPickupsAndHazards(context, state, assets);
    drawEffectLayer(context, assets, effectDraws, "target-cues");
	drawEffectLayer(context, assets, effectDraws, "links");
	drawEffectLayer(context, assets, effectDraws, "projectiles");
	drawBaseProjectiles(context, state, assets);
	drawEffectLayer(context, assets, effectDraws, "emission-cues");
	drawEffectLayer(context, assets, effectDraws, "satellites-orbitals-decoy");
    drawPlayer(context, state, assets, options);
    drawDamage(context, state, assets, options.reducedMotion);
    drawAim(context, state);
    context.restore();
    drawMinimap(context, state, viewport);
}
