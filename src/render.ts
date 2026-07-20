import type { AssetKey, LoadedAssets } from "./assets";
import {
	RALPHY_ATLAS,
	selectRalphyPose,
	type RalphyPose,
} from "./game/presentation";
import type { GameState, Point } from "./game/simulation";
import { ROOM_PROPS } from "./game/room";
import {
	assertNever,
	projectEffectDraws,
	type EffectDraw,
	type EffectDrawLayer,
} from "./render-effects";

type RenderOptions = { reducedMotion: boolean };
const round = (value: number) => Math.round(value);

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
		centeredImage(
			context,
			assets,
			target.kind,
			target,
			target.kind === "dummy" ? 66 : 58,
		);
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
		if (target.kind === "chaser") {
			context.fillStyle = "#0a0a0b";
			context.fillRect(
				round(target.x - 20),
				round(target.y + target.radius + 8),
				40,
				5,
			);
			context.fillStyle = "#ffa630";
			context.fillRect(
				round(target.x - 19),
				round(target.y + target.radius + 9),
				round((38 * target.health) / target.maxHealth),
				3,
			);
		}
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

export function renderGame(
	context: CanvasRenderingContext2D,
	state: GameState,
	assets: LoadedAssets,
	options: RenderOptions,
): void {
	context.imageSmoothingEnabled = false;
	context.clearRect(0, 0, state.room.width, state.room.height);
	context.drawImage(assets.room, 0, 0, state.room.width, state.room.height);
	for (const prop of ROOM_PROPS)
		centeredImage(
			context,
			assets,
			prop.kind,
			{ x: prop.x, y: prop.y },
			prop.size,
		);
	const effectDraws = projectEffectDraws(state, options.reducedMotion);
	drawEffectLayer(context, assets, effectDraws, "areas-trails");
	drawTargets(context, state, assets);
	drawEffectLayer(context, assets, effectDraws, "target-cues");
	drawEffectLayer(context, assets, effectDraws, "links");
	drawEffectLayer(context, assets, effectDraws, "projectiles");
	drawBaseProjectiles(context, state, assets);
	drawEffectLayer(context, assets, effectDraws, "emission-cues");
	drawEffectLayer(context, assets, effectDraws, "satellites-orbitals-decoy");
	drawPlayer(context, state, assets, options);
	drawDamage(context, state, assets, options.reducedMotion);
	drawAim(context, state);
}
